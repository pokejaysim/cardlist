import { supabase } from "../lib/supabase.js";
import {
  uploadSiteHostedPictures,
  addItem,
} from "../services/ebay/trading.js";
import type { ListingData } from "../services/ebay/trading.js";

// ---------------------------------------------------------------------------
// Types for DB rows (minimal shape needed by this job)
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

    // 2. Fetch the user's eBay account for the auth token
    const { data: ebayAccount, error: ebayErr } = await supabase
      .from("ebay_accounts")
      .select("*")
      .eq("user_id", listingRow.user_id)
      .single();

    if (ebayErr || !ebayAccount) {
      throw new Error(
        `eBay account not found for user ${listingRow.user_id}: ${ebayErr?.message ?? "no data"}`,
      );
    }

    const account = ebayAccount as unknown as EbayAccountRow;
    const token = account.ebay_token;

    // 3. Fetch photos for this listing
    const { data: photos, error: photosErr } = await supabase
      .from("photos")
      .select("*")
      .eq("listing_id", listingId)
      .order("position", { ascending: true });

    if (photosErr) {
      throw new Error(`Failed to fetch photos: ${photosErr.message}`);
    }

    const photoRows = (photos ?? []) as unknown as PhotoRow[];

    // 4. Upload photos that have file_url but no ebay_url
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

    // 5. Collect all eBay-hosted photo URLs
    const ebayPhotoUrls = photoRows
      .map((p) => p.ebay_url)
      .filter((url): url is string => url != null);

    // 6. Build listing data and call AddItem
    const listingData: ListingData = {
      title: listingRow.title,
      description: listingRow.description,
      price_cad: listingRow.price_cad,
      condition: listingRow.condition,
      photo_urls: ebayPhotoUrls,
      listing_type: listingRow.listing_type,
      duration: listingRow.duration,
    };

    const { itemId } = await addItem(listingData, token);

    // 7. Update listing as published
    const { error: publishErr } = await supabase
      .from("listings")
      .update({
        ebay_item_id: itemId,
        status: "published",
        published_at: new Date().toISOString(),
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
      })
      .eq("id", listingId);

    // Re-throw so the queue knows the job failed
    throw err;
  }
}
