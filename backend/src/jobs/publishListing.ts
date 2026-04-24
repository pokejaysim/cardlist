import { supabase } from "../lib/supabase.js";
import {
  uploadSiteHostedPictures,
  addItem,
} from "../services/ebay/trading.js";
import { getValidEbayToken } from "../services/ebay/tokenManager.js";
import { prepareListingForPublish } from "../services/ebay/readiness.js";

// ---------------------------------------------------------------------------
// Types for DB rows (minimal shape needed by this job)
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
// Job processor
// ---------------------------------------------------------------------------

export async function processPublishJob(jobData: {
  listingId: string;
}): Promise<void> {
  const { listingId } = jobData;

  try {
    // 1. Fetch the listing
    const { data: listing, error: listingErr } = await supabase
      .from("listings")
      .select("*")
      .eq("id", listingId)
      .single();

    if (listingErr || !listing) {
      throw new Error(
        `Listing ${listingId} not found: ${listingErr?.message ?? "no data"}`,
      );
    }

    const listingRow = listing as unknown as ListingRow;

    const startedAt = new Date().toISOString();
    await supabase
      .from("listings")
      .update({
        status: "publishing",
        publish_started_at: startedAt,
        publish_attempted_at: startedAt,
        ebay_error: null,
      })
      .eq("id", listingId);

    const token = await getValidEbayToken(listingRow.user_id);

    // 2. Fetch photos for this listing
    const { data: photos, error: photosErr } = await supabase
      .from("photos")
      .select("*")
      .eq("listing_id", listingId)
      .order("position", { ascending: true });

    if (photosErr) {
      throw new Error(`Failed to fetch photos: ${photosErr.message}`);
    }

    const photoRows = (photos ?? []) as unknown as PhotoRow[];

    // 3. Upload photos that have file_url but no ebay_url
    for (const photo of photoRows) {
      if (photo.file_url && !photo.ebay_url) {
        const ebayUrl = await uploadSiteHostedPictures(photo.file_url, token);

        const { error: updateErr } = await supabase
          .from("photos")
          .update({ ebay_url: ebayUrl })
          .eq("id", photo.id);

        if (updateErr) {
          throw new Error(
            `Failed to update photo ${photo.id}: ${updateErr.message}`,
          );
        }

        // Update local reference so we can collect all URLs below
        photo.ebay_url = ebayUrl;
      }
    }

    // 4. Collect all eBay-hosted photo URLs
    const ebayPhotoUrls = photoRows
      .map((p) => p.ebay_url)
      .filter((url): url is string => url != null);

    // 5. Build the metadata-validated payload and call AddItem
    const listingData = await prepareListingForPublish(
      listingId,
      listingRow.user_id,
      ebayPhotoUrls,
    );
    const { itemId } = await addItem(
      listingData,
      token,
      listingData.marketplaceId,
    );

    // 6. Update listing as published
    const { error: publishErr } = await supabase
      .from("listings")
      .update({
        ebay_item_id: itemId,
        status: "published",
        published_at: new Date().toISOString(),
        scheduled_at: null,
        ebay_error: null,
        photo_urls: ebayPhotoUrls,
      })
      .eq("id", listingId);

    if (publishErr) {
      throw new Error(
        `Failed to update listing after publish: ${publishErr.message}`,
      );
    }
  } catch (err: unknown) {
    // On any error, mark the listing with error status
    const message =
      err instanceof Error ? err.message : "Unknown publish error";

    await supabase
      .from("listings")
      .update({
        status: "error",
        ebay_error: message,
        publish_attempted_at: new Date().toISOString(),
      })
      .eq("id", listingId);

    // Re-throw so the queue knows the job failed
    throw err;
  }
}
