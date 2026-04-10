import { supabase } from "../../lib/supabase.js";
import { publishQueue } from "../../lib/queue.js";
import { verifyAddItem } from "./trading.js";
import type { ListingData } from "./trading.js";

// ---------------------------------------------------------------------------
// Types for DB rows (minimal shape needed here)
// ---------------------------------------------------------------------------

interface ListingRow {
  id: string;
  user_id: string;
  title: string;
  description: string;
  price_cad: number;
  condition: string;
  listing_type: "auction" | "fixed_price";
  duration: number;
  status: string;
}

interface EbayAccountRow {
  id: string;
  user_id: string;
  ebay_token: string;
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

  if (!listingRow.price_cad || listingRow.price_cad <= 0) {
    return {
      scheduled: false,
      error: "Price must be set before publishing. Go back and set a price.",
    };
  }

  if (!listingRow.title) {
    return {
      scheduled: false,
      error: "Listing title is missing. Please edit the listing and add a title.",
    };
  }

  // 2. Verify the user has a linked eBay account
  const { data: ebayAccount, error: ebayErr } = await supabase
    .from("ebay_accounts")
    .select("*")
    .eq("user_id", userId)
    .single();

  if (ebayErr || !ebayAccount) {
    return {
      scheduled: false,
      error: "No linked eBay account found. Please connect your eBay account first.",
    };
  }

  const account = ebayAccount as unknown as EbayAccountRow;

  // 3. Fetch photo URLs for the listing
  const { data: photos } = await supabase
    .from("photos")
    .select("*")
    .eq("listing_id", listingId)
    .order("position", { ascending: true });

  const photoRows = (photos ?? []) as unknown as PhotoRow[];
  const photoUrls = photoRows
    .map((p) => p.ebay_url ?? p.file_url)
    .filter((url): url is string => url != null);

  // 4. Run VerifyAddItem as a dry-run validation
  const listingData: ListingData = {
    title: listingRow.title,
    description: listingRow.description,
    price_cad: listingRow.price_cad,
    condition: listingRow.condition,
    photo_urls: photoUrls,
    listing_type: listingRow.listing_type,
    duration: listingRow.duration,
  };

  try {
    const { warnings } = await verifyAddItem(listingData, account.ebay_token);

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

  // 5. Update listing status to "scheduled" and enqueue the publish job
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

  // Enqueue to Bull with 5-hour delay (eBay scheduling buffer)
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

  return { scheduled: true };
}
