export interface EbayCompResult {
  title: string;
  sold_price: number;
  condition: string;
  sold_date: string;
  currency: string;
}

/**
 * Discriminated-union result so callers can tell "not configured" apart from
 * "API failed" apart from "genuinely no comps found for this card".
 */
export type EbayCompsLookup =
  | { status: "no_key" }
  | { status: "api_error"; message: string }
  | { status: "not_found"; query: string }
  | { status: "ok"; comps: EbayCompResult[] };

/**
 * Shape of a single item from the eBay Finding API findCompletedItems response.
 * Only the fields we actually use are typed here.
 */
interface EbayFindingItem {
  title?: string[];
  sellingStatus?: Array<{
    currentPrice?: Array<{
      __value__?: string;
      "@currencyId"?: string;
    }>;
  }>;
  listingInfo?: Array<{
    endTime?: string[];
  }>;
  condition?: {
    conditionDisplayName?: string[];
  };
}

interface EbayFindingResponse {
  findCompletedItemsResponse?: Array<{
    searchResult?: Array<{
      item?: EbayFindingItem[];
    }>;
  }>;
}

/**
 * Fetch recent eBay sold comps for a card using the Finding API (findCompletedItems).
 * Returns a tagged status so the UI can distinguish config / API / no-results problems.
 */
export async function fetchEbayComps(
  cardName: string,
  setName: string | null,
  _condition: string | null,
): Promise<EbayCompsLookup> {
  const appId = process.env.EBAY_APP_ID;
  if (!appId) {
    console.warn("[ebayComps] EBAY_APP_ID is not set");
    return { status: "no_key" };
  }

  const keywords = setName ? `${cardName} ${setName}` : cardName;

  try {
    const url = new URL("https://svcs.ebay.com/services/search/FindingService/v1");
    url.searchParams.set("OPERATION-NAME", "findCompletedItems");
    url.searchParams.set("SERVICE-VERSION", "1.13.0");
    url.searchParams.set("SECURITY-APPNAME", appId);
    url.searchParams.set("RESPONSE-DATA-FORMAT", "JSON");
    url.searchParams.set("keywords", keywords);
    url.searchParams.set("itemFilter(0).name", "SoldItemsOnly");
    url.searchParams.set("itemFilter(0).value", "true");
    url.searchParams.set("sortOrder", "EndTimeSoonest");
    url.searchParams.set("paginationInput.entriesPerPage", "10");

    const response = await fetch(url.toString());
    if (!response.ok) {
      const message = `HTTP ${String(response.status)} ${response.statusText}`;
      console.error(`[ebayComps] API error: ${message}`);
      return { status: "api_error", message };
    }

    const data = (await response.json()) as EbayFindingResponse;

    const searchResponse = data.findCompletedItemsResponse?.[0];
    const searchResult = searchResponse?.searchResult?.[0];
    const items = searchResult?.item;

    if (!items || items.length === 0) {
      return { status: "not_found", query: keywords };
    }

    const results: EbayCompResult[] = [];

    for (const item of items) {
      const title = item.title?.[0] ?? "";
      const sellingStatus = item.sellingStatus?.[0];
      const priceEntry = sellingStatus?.currentPrice?.[0];
      const priceValue = priceEntry?.__value__;
      const currency = priceEntry?.["@currencyId"] ?? "USD";
      const endTime = item.listingInfo?.[0]?.endTime?.[0] ?? "";
      const conditionName = item.condition?.conditionDisplayName?.[0] ?? "Unknown";

      if (priceValue === undefined) {
        continue;
      }

      const soldPrice = parseFloat(priceValue);
      if (isNaN(soldPrice)) {
        continue;
      }

      results.push({
        title,
        sold_price: soldPrice,
        condition: conditionName,
        sold_date: endTime,
        currency,
      });
    }

    if (results.length === 0) {
      return { status: "not_found", query: keywords };
    }

    return { status: "ok", comps: results };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[ebayComps] Lookup failed:", message);
    return { status: "api_error", message };
  }
}
