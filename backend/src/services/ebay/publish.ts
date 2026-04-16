import { supabase } from "../../lib/supabase.js";
import { publishQueue } from "../../lib/queue.js";
import { verifyAddItem } from "./trading.js";
import { getValidEbayToken } from "./tokenManager.js";
import { isMockMode } from "./config.js";
import { prepareListingForPublish } from "./readiness.js";

// ---------------------------------------------------------------------------
// Types for DB rows (minimal shape needed here)
// ---------------------------------------------------------------------------

interface ListingRow {
  id: string;
  user_id: string;
  status: string;
}

interface PhotoRow {
  id: string;
  listing_id: string;
  file_url: string | null;
  ebay_url: string | null;
}

// ---------------------------------------------------------------------------
// Schedule a listing for publish
// ---------------------------------------------------------------------------

export async function schedulePublish(
  listingId: string,
  userId: string,
): Promise<{ scheduled: boolean; error?: string }> {
  // 1. Fetch listing and verify ownership + draft status
  const { data: listing, error: listingErr } = await supabase
    .from("listings")
    .select("*")
    .eq("id", listingId)
    .eq("user_id", userId)
    .single();

  if (listingErr || !listing) {
    return {
      scheduled: false,
      error: `Listing not found or does not belong to user: ${listingErr?.message ?? "no data"}`,
    };
  }

  const listingRow = listing as unknown as ListingRow;

  if (listingRow.status !== "draft" && listingRow.status !== "error") {
    return {
      scheduled: false,
      error: `Listing must be in draft or error status to publish (current: ${listingRow.status})`,
    };
  }

  // 2. Verify the user has a linked eBay account
  const { data: ebayAccount, error: ebayErr } = await supabase
    .from("ebay_accounts")
    .select("id")
    .eq("user_id", userId)
    .single();

  if (ebayErr || !ebayAccount) {
    return {
      scheduled: false,
      error: "No linked eBay account found. Please connect your eBay account first.",
    };
  }

  // 3. Get a valid token (refreshes if needed)
  const token = await getValidEbayToken(userId);

  // 4. Fetch photo URLs for the listing
  const { data: photos } = await supabase
    .from("photos")
    .select("*")
    .eq("listing_id", listingId)
    .order("position", { ascending: true });

  const photoRows = (photos ?? []) as unknown as PhotoRow[];
  const photoUrls = photoRows
    .map((p) => p.ebay_url ?? p.file_url)
    .filter((url): url is string => url != null);

  try {
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

    // Log warnings but don't block on them
    if (warnings.length > 0) {
      console.warn(
        `[schedulePublish] VerifyAddItem warnings for listing ${listingId}:`,
        warnings,
      );
    }
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "eBay validation failed";
    return {
      scheduled: false,
      error: `eBay validation failed: ${message}`,
    };
  }

  // 6. Update listing status to "scheduled"
  const { error: updateErr } = await supabase
    .from("listings")
    .update({ status: "scheduled" })
    .eq("id", listingId);

  if (updateErr) {
    return {
      scheduled: false,
      error: `Failed to update listing status: ${updateErr.message}`,
    };
  }

  // 7. Enqueue (or run synchronously if no Redis)
  if (publishQueue) {
    const PUBLISH_DELAY_MS = 5 * 60 * 60 * 1000; // 5 hours
    await publishQueue.add(
      { listingId },
      {
        delay: PUBLISH_DELAY_MS,
        attempts: 3,
        backoff: { type: "exponential", delay: 60_000 },
        removeOnComplete: true,
      },
    );
  } else {
    // No Redis — run synchronously
    const { processPublishJob } = await import("../../jobs/publishListing.js");
    await processPublishJob({ listingId });
  }

  return { scheduled: true };
}
