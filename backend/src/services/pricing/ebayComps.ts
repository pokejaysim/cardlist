export interface EbayCompResult {
  title: string;
  sold_price: number;
  condition: string;
  sold_date: string;
  currency: string;
}

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
 * Returns an empty array if the eBay App ID is not configured or the request fails.
 */
export async function fetchEbayComps(
  cardName: string,
  setName: string | null,
  _condition: string | null
): Promise<EbayCompResult[]> {
  const appId = process.env.EBAY_APP_ID;
  if (!appId) {
    return [];
  }

  try {
    const keywords = setName ? `${cardName} ${setName}` : cardName;

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
      console.error(`eBay Finding API error: ${response.status} ${response.statusText}`);
      return [];
    }

    const data = (await response.json()) as EbayFindingResponse;

    const searchResponse = data.findCompletedItemsResponse?.[0];
    const searchResult = searchResponse?.searchResult?.[0];
    const items = searchResult?.item;

    if (!items || items.length === 0) {
      return [];
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

    return results;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("eBay comps lookup failed:", message);
    return [];
  }
}
