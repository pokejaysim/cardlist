/**
 * PriceCharting API wrapper for trading card prices.
 *
 * Important: PriceCharting uses video-game-derived field names, but the
 * semantics differ for trading cards:
 *
 *   loose-price        → raw / ungraded card (what most of our users sell)
 *   graded-price       → PSA / BGS 9
 *   manual-only-price  → PSA / BGS 9.5 or 10
 *   box-only-price     → BGS 10 pristine
 *   bgs-10-price       → BGS 10
 *
 * new-price and cib-price are NOT meaningful for cards — they're sealed-game
 * fields. Ignore them.
 *
 * For raw cards at various played conditions (NM/LP/MP/HP/DMG) we anchor on
 * `loose-price` and apply a market-standard condition multiplier.
 */

export interface PriceChartingResult {
  product_name: string;
  /** Raw / ungraded card price in USD. Primary field for most of our users. */
  price_raw_usd: number | null;
  /** PSA/BGS 9 graded price in USD. */
  price_graded_9_usd: number | null;
  /** PSA/BGS 9.5 or 10 graded price in USD. */
  price_graded_10_usd: number | null;
  /** Raw PriceCharting response for debugging / price_research storage. */
  raw: Record<string, unknown>;
}

/**
 * Discriminated-union result so callers can distinguish between
 * "not configured" (fix your env vars), "api broke" (temporary), and
 * "card not found" (real absence of data).
 */
export type PriceChartingLookup =
  | { status: "no_key" }
  | { status: "api_error"; message: string }
  | { status: "not_found"; query: string }
  | { status: "ok"; result: PriceChartingResult };

interface PriceChartingResponse {
  "product-name"?: string;
  "loose-price"?: number;
  "graded-price"?: number;
  "manual-only-price"?: number;
  "box-only-price"?: number;
  "bgs-10-price"?: number;
  [key: string]: unknown;
}

/**
 * Condition multipliers against the raw NM price.
 *
 * Loosely calibrated to market practice on eBay / TCGplayer for played
 * Pokemon cards. Tweakable via CONDITION_MULTIPLIERS_JSON env var if the
 * defaults feel off (e.g. for vintage cards where LP/MP often holds value
 * better).
 */
const DEFAULT_CONDITION_MULTIPLIERS: Record<string, number> = {
  NM: 1.0,
  LP: 0.85,
  MP: 0.7,
  HP: 0.5,
  DMG: 0.3,
};

function parseConditionMultipliers(): Record<string, number> {
  const raw = process.env.CONDITION_MULTIPLIERS_JSON;
  if (!raw) return DEFAULT_CONDITION_MULTIPLIERS;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object") {
      return { ...DEFAULT_CONDITION_MULTIPLIERS, ...(parsed as Record<string, number>) };
    }
  } catch {
    console.warn("[pricecharting] Invalid CONDITION_MULTIPLIERS_JSON, using defaults");
  }
  return DEFAULT_CONDITION_MULTIPLIERS;
}

/**
 * Search PriceCharting for a card's market price.
 * Returns a PriceChartingLookup tagged with the reason for any non-ok result
 * so the UI can show an actionable error message instead of a generic "no data".
 */
export async function searchPriceCharting(
  cardName: string,
  setName: string | null,
  _condition: string | null,
): Promise<PriceChartingLookup> {
  const apiKey = process.env.PRICECHARTING_API_KEY;
  if (!apiKey) {
    console.warn("[pricecharting] PRICECHARTING_API_KEY is not set");
    return { status: "no_key" };
  }

  const query = setName ? `${cardName} ${setName}` : cardName;

  try {
    const url = new URL("https://www.pricecharting.com/api/product");
    url.searchParams.set("t", apiKey);
    url.searchParams.set("q", query);

    const response = await fetch(url.toString());
    if (!response.ok) {
      const message = `HTTP ${String(response.status)} ${response.statusText}`;
      console.error(`[pricecharting] API error: ${message}`);
      return { status: "api_error", message };
    }

    const data = (await response.json()) as PriceChartingResponse;

    // PriceCharting returns a non-error response with no product name when the
    // query matches no known product — surface that as a distinct status.
    if (!data["product-name"]) {
      return { status: "not_found", query };
    }

    // PriceCharting returns prices in cents — convert to dollars.
    const centsToDollars = (v: unknown): number | null =>
      typeof v === "number" && v > 0 ? v / 100 : null;

    const result: PriceChartingResult = {
      product_name: data["product-name"],
      price_raw_usd: centsToDollars(data["loose-price"]),
      price_graded_9_usd: centsToDollars(data["graded-price"]),
      // Prefer manual-only-price (PSA 10) over box/bgs-10 (BGS 10), fall back.
      price_graded_10_usd:
        centsToDollars(data["manual-only-price"]) ??
        centsToDollars(data["bgs-10-price"]) ??
        centsToDollars(data["box-only-price"]),
      raw: data as Record<string, unknown>,
    };

    // Product matched but no usable price fields — treat as not-found for
    // pricing purposes (we can't suggest a price off no prices).
    if (
      result.price_raw_usd === null &&
      result.price_graded_9_usd === null &&
      result.price_graded_10_usd === null
    ) {
      return { status: "not_found", query };
    }

    return { status: "ok", result };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[pricecharting] Lookup failed:", message);
    return { status: "api_error", message };
  }
}

/**
 * Pick the appropriate USD price for a raw card based on its condition.
 *
 * All raw conditions (NM/LP/MP/HP/DMG) anchor on `loose-price` (the ungraded
 * market price from PriceCharting) and scale by a condition multiplier.
 *
 * If the caller passes a condition we don't recognize (e.g. "PSA 10"), we
 * fall back to NM. Graded-card pricing is a separate flow — callers that
 * need it should read `price_graded_9_usd` / `price_graded_10_usd` directly.
 */
export function priceForCondition(
  result: PriceChartingResult,
  condition: string | null,
): number | null {
  const rawPrice = result.price_raw_usd;
  if (rawPrice === null) return null;

  const multipliers = parseConditionMultipliers();
  const cond = (condition ?? "NM").toUpperCase().trim();
  const multiplier = multipliers[cond] ?? multipliers.NM ?? 1.0;

  return Math.round(rawPrice * multiplier * 100) / 100;
}
