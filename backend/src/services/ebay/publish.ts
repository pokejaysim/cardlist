import { supabase } from "../../lib/supabase.js";
import { publishQueue } from "../../lib/queue.js";
import { verifyAddItem } from "./trading.js";
import { getValidEbayToken } from "./tokenManager.js";
import { isCanadaBetaMarketplace } from "./config.js";
import { prepareListingForPublish } from "./readiness.js";

export type PublishMode = "now" | "scheduled";

export interface PublishRequestInput {
  mode?: PublishMode;
  scheduled_at?: string | null;
}

export interface PublishRequestResult {
  ok: boolean;
  status?: "publishing" | "published" | "scheduled" | "error";
  ebay_item_id?: string | null;
  scheduled_at?: string | null;
  error?: string;
}

interface ListingRow {
  id: string;
  user_id: string;
  status: string;
  marketplace_id: string | null;
}

interface PhotoRow {
  id: string;
  listing_id: string;
  file_url: string | null;
  ebay_url: string | null;
}

const CANADA_BETA_ONLY_MESSAGE =
  "SnapCard beta publishing currently supports eBay Canada listings only. Create a new Canada listing to publish this card.";

function normalizePublishMode(mode: unknown): PublishMode {
  return mode === "scheduled" ? "scheduled" : "now";
}

function parseScheduledAt(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

async function loadOwnedListing(
  listingId: string,
  userId: string,
): Promise<ListingRow | null> {
  const { data, error } = await supabase
    .from("listings")
    .select("id, user_id, status, marketplace_id")
    .eq("id", listingId)
    .eq("user_id", userId)
    .single();

  if (error || !data) {
    return null;
  }

  return data as ListingRow;
}

async function loadPhotoUrls(listingId: string): Promise<string[]> {
  const { data: photos } = await supabase
    .from("photos")
    .select("*")
    .eq("listing_id", listingId)
    .order("position", { ascending: true });

  const photoRows = (photos ?? []) as unknown as PhotoRow[];
  return photoRows
    .map((photo) => photo.ebay_url ?? photo.file_url)
    .filter((url): url is string => url != null);
}

async function assertLinkedEbayAccount(userId: string): Promise<string | null> {
  const { data: ebayAccount, error: ebayErr } = await supabase
    .from("ebay_accounts")
    .select("id")
    .eq("user_id", userId)
    .single();

  if (ebayErr || !ebayAccount) {
    return "No linked eBay account found. Please connect your eBay account first.";
  }

  return null;
}

async function preflightVerify(
  listingId: string,
  userId: string,
): Promise<string | null> {
  const linkedError = await assertLinkedEbayAccount(userId);
  if (linkedError) {
    return linkedError;
  }

  const photoUrls = await loadPhotoUrls(listingId);

  try {
    const token = await getValidEbayToken(userId);
    const listingData = await prepareListingForPublish(
      listingId,
      userId,
      photoUrls,
    );
    const { warnings } = await verifyAddItem(
      listingData,
      token,
      listingData.marketplaceId,
    );

    if (warnings.length > 0) {
      console.warn(
        `[requestPublish] VerifyAddItem warnings for listing ${listingId}:`,
        warnings,
      );
    }
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "eBay validation failed";
    return `eBay validation failed: ${message}`;
  }

  return null;
}

async function enqueuePublishJob(
  listingId: string,
  delayMs: number,
): Promise<void> {
  if (!publishQueue) {
    if (delayMs > 0) {
      const { processPublishJob } = await import("../../jobs/publishListing.js");
      setTimeout(() => {
        processPublishJob({ listingId }).catch((error: unknown) => {
          console.error(
            `[requestPublish] Scheduled in-process publish failed for ${listingId}:`,
            error,
          );
        });
      }, delayMs);
      return;
    }

    const { processPublishJob } = await import("../../jobs/publishListing.js");
    await processPublishJob({ listingId });
    return;
  }

  await publishQueue.add(
    { listingId },
    {
      delay: Math.max(delayMs, 0),
      attempts: 3,
      backoff: { type: "exponential", delay: 60_000 },
      removeOnComplete: true,
    },
  );
}

async function loadPublishOutcome(
  listingId: string,
): Promise<PublishRequestResult> {
  const { data, error } = await supabase
    .from("listings")
    .select("status, ebay_item_id, ebay_error, scheduled_at")
    .eq("id", listingId)
    .single();

  if (error || !data) {
    return {
      ok: false,
      status: "error",
      error: "Publish ran, but SnapCard could not reload the listing status.",
    };
  }

  const row = data as {
    status: string;
    ebay_item_id: string | number | null;
    ebay_error: string | null;
    scheduled_at: string | null;
  };

  if (row.status === "published") {
    return {
      ok: true,
      status: "published",
      ebay_item_id:
        row.ebay_item_id == null ? null : String(row.ebay_item_id),
    };
  }

  if (row.status === "error") {
    return {
      ok: false,
      status: "error",
      error: row.ebay_error ?? "eBay publishing failed.",
    };
  }

  return {
    ok: true,
    status: row.status === "scheduled" ? "scheduled" : "publishing",
    scheduled_at: row.scheduled_at,
  };
}

export async function requestPublish(
  listingId: string,
  userId: string,
  input: PublishRequestInput = {},
): Promise<PublishRequestResult> {
  const mode = normalizePublishMode(input.mode);
  const now = new Date();

  const listing = await loadOwnedListing(listingId, userId);
  if (!listing) {
    return {
      ok: false,
      error: "Listing not found.",
    };
  }

  if (listing.status !== "draft" && listing.status !== "error") {
    return {
      ok: false,
      error: `Listing must be in draft or error status to publish (current: ${listing.status})`,
    };
  }

  if (!isCanadaBetaMarketplace(listing.marketplace_id)) {
    return {
      ok: false,
      error: CANADA_BETA_ONLY_MESSAGE,
    };
  }

  const verifyError = await preflightVerify(listingId, userId);
  if (verifyError) {
    return {
      ok: false,
      error: verifyError,
    };
  }

  if (mode === "scheduled") {
    const scheduledAt = parseScheduledAt(input.scheduled_at);
    if (!scheduledAt) {
      return {
        ok: false,
        error: "Choose a valid publish date/time before scheduling.",
      };
    }

    if (scheduledAt.getTime() <= now.getTime()) {
      return {
        ok: false,
        error: "Scheduled publish time must be in the future.",
      };
    }

    const scheduledAtIso = scheduledAt.toISOString();
    const { error: updateErr } = await supabase
      .from("listings")
      .update({
        status: "scheduled",
        scheduled_at: scheduledAtIso,
        publish_attempted_at: now.toISOString(),
        publish_started_at: null,
        ebay_error: null,
      })
      .eq("id", listingId)
      .eq("user_id", userId);

    if (updateErr) {
      return {
        ok: false,
        error: `Failed to schedule listing: ${updateErr.message}`,
      };
    }

    try {
      await enqueuePublishJob(
        listingId,
        scheduledAt.getTime() - Date.now(),
      );
    } catch (error) {
      return {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to queue scheduled publish.",
      };
    }

    return {
      ok: true,
      status: "scheduled",
      scheduled_at: scheduledAtIso,
    };
  }

  const { error: updateErr } = await supabase
    .from("listings")
    .update({
      status: "publishing",
      scheduled_at: null,
      publish_attempted_at: now.toISOString(),
      publish_started_at: null,
      ebay_error: null,
    })
    .eq("id", listingId)
    .eq("user_id", userId);

  if (updateErr) {
    return {
      ok: false,
      error: `Failed to start publishing: ${updateErr.message}`,
    };
  }

  try {
    await enqueuePublishJob(listingId, 0);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to start publish job.";
    await supabase
      .from("listings")
      .update({
        status: "error",
        ebay_error: message,
        publish_attempted_at: new Date().toISOString(),
      })
      .eq("id", listingId)
      .eq("user_id", userId);

    return {
      ok: false,
      status: "error",
      error: message,
    };
  }

  if (publishQueue) {
    return {
      ok: true,
      status: "publishing",
    };
  }

  return loadPublishOutcome(listingId);
}

// Backwards-compatible wrapper for older internal callers.
export async function schedulePublish(
  listingId: string,
  userId: string,
): Promise<{ scheduled: boolean; error?: string }> {
  const result = await requestPublish(listingId, userId, {
    mode: "scheduled",
    scheduled_at: new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString(),
  });

  return {
    scheduled: result.ok,
    error: result.error,
  };
}
