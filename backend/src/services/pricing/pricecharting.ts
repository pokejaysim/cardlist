export interface PriceChartingResult {
  product_name: string;
  price_nm: number | null;
  price_lp: number | null;
  price_mp: number | null;
  raw: Record<string, unknown>;
}

interface PriceChartingResponse {
  "product-name"?: string;
  "new-price"?: number;
  "cib-price"?: number;
  "loose-price"?: number;
  [key: string]: unknown;
}

/**
 * Search PriceCharting for a card's market price.
 * Returns null if the API key is not configured or the request fails.
 */
export async function searchPriceCharting(
  cardName: string,
  setName: string | null,
  condition: string | null
): Promise<PriceChartingResult | null> {
  const apiKey = process.env.PRICECHARTING_API_KEY;
  if (!apiKey) {
    return null;
  }

  try {
    const query = setName ? `${cardName} ${setName}` : cardName;
    const url = new URL("https://www.pricecharting.com/api/product");
    url.searchParams.set("t", apiKey);
    url.searchParams.set("q", query);

    const response = await fetch(url.toString());
    if (!response.ok) {
      console.error(`PriceCharting API error: ${response.status} ${response.statusText}`);
      return null;
    }

    const data = (await response.json()) as PriceChartingResponse;

    // PriceCharting returns prices in cents -- convert to dollars
    const newPrice = typeof data["new-price"] === "number" ? data["new-price"] / 100 : null;
    const cibPrice = typeof data["cib-price"] === "number" ? data["cib-price"] / 100 : null;
    const loosePrice = typeof data["loose-price"] === "number" ? data["loose-price"] / 100 : null;

    return {
      product_name: data["product-name"] ?? cardName,
      price_nm: newPrice,
      price_lp: cibPrice,
      price_mp: loosePrice,
      raw: data as Record<string, unknown>,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("PriceCharting lookup failed:", message);
    return null;
  }
}

/**
 * Pick the appropriate price from a PriceCharting result based on card condition.
 * Condition mapping:
 *   NM (Near Mint)   -> new-price  (price_nm)
 *   LP (Light Play)  -> cib-price  (price_lp)
 *   MP/HP/DMG        -> loose-price (price_mp)
 */
export function priceForCondition(
  result: PriceChartingResult,
  condition: string | null
): number | null {
  const cond = (condition ?? "NM").toUpperCase();

  if (cond === "NM") return result.price_nm;
  if (cond === "LP") return result.price_lp;
  // MP, HP, DMG all map to loose/MP price
  return result.price_mp;
}
