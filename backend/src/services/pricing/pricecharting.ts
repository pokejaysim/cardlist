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
  /** PriceCharting's numeric product ID (used to build the verification URL). */
  product_id: string | null;
  /** Product name exactly as PriceCharting returned it — so users can see
   *  whether our query matched the right card. */
  product_name: string;
  /** "Console name" — PriceCharting's category field (e.g. "Pokemon Base Set"). */
  console_name: string | null;
  /** Direct link to the PriceCharting product page. Null if we can't build one. */
  product_url: string | null;
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
  id?: string | number;
  "product-name"?: string;
  "console-name"?: string;
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
 * Normalize a user-facing card number (e.g. "149/182", "TG05/TG30", "4/102")
 * into a bare number PriceCharting's search likes. Returns null if there's
 * nothing usable.
 *
 * PriceCharting indexes card numbers as just the print number — "149" not
 * "149/182". The slash-total confuses their search.
 */
function normalizeCardNumber(raw: string | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // Split on slash and take the numerator (handles "149/182" → "149",
  // "TG05/TG30" → "TG05").
  const [first] = trimmed.split("/");
  return first?.trim() || null;
}

/**
 * Fire one PriceCharting product-search call with the given query string.
 * Returns null (meaning "not found") when the API responds with no product,
 * or throws with a tagged error when something infrastructural is wrong.
 */
async function fetchPriceChartingProduct(
  apiKey: string,
  query: string,
): Promise<PriceChartingResponse | null> {
  const url = new URL("https://www.pricecharting.com/api/product");
  url.searchParams.set("t", apiKey);
  url.searchParams.set("q", query);

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`HTTP ${String(response.status)} ${response.statusText}`);
  }
  const data = (await response.json()) as PriceChartingResponse;
  return data["product-name"] ? data : null;
}

/**
 * Search PriceCharting for a card's market price.
 *
 * Tries progressively broader queries so we match the correct card variant
 * when a set has multiple prints of the same card (common in modern sets
 * with Illustration Rares / Full Arts / Alt Arts sharing one name):
 *
 *   1. "cardName setName cardNumber"   — most specific
 *   2. "cardName setName"              — fallback if specific match fails
 *   3. "cardName"                      — last resort (only when no set)
 *
 * Returns a PriceChartingLookup tagged with the reason for any non-ok result
 * so the UI can show an actionable error message instead of a generic "no data".
 */
export async function searchPriceCharting(
  cardName: string,
  setName: string | null,
  _condition: string | null,
  cardNumber: string | null = null,
): Promise<PriceChartingLookup> {
  const apiKey = process.env.PRICECHARTING_API_KEY;
  if (!apiKey) {
    console.warn("[pricecharting] PRICECHARTING_API_KEY is not set");
    return { status: "no_key" };
  }

  // Build ordered query candidates, most-specific first.
  const normNumber = normalizeCardNumber(cardNumber);
  const candidates: string[] = [];
  if (setName && normNumber) candidates.push(`${cardName} ${setName} ${normNumber}`);
  if (setName) candidates.push(`${cardName} ${setName}`);
  candidates.push(cardName);

  let data: PriceChartingResponse | null = null;
  let matchedQuery = "";

  try {
    for (const q of candidates) {
      const result = await fetchPriceChartingProduct(apiKey, q);
      if (result) {
        data = result;
        matchedQuery = q;
        console.log(`[pricecharting] Matched "${result["product-name"] ?? ""}" via query "${q}"`);
        break;
      }
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[pricecharting] API error: ${message}`);
    return { status: "api_error", message };
  }

  if (!data) {
    return { status: "not_found", query: candidates[0] ?? cardName };
  }

  try {
    // PriceCharting returns prices in cents — convert to dollars.
    const centsToDollars = (v: unknown): number | null =>
      typeof v === "number" && v > 0 ? v / 100 : null;

    // Build a direct link to the product page so users can verify.
    // PriceCharting's /game/{id} URL redirects to the canonical product page.
    // Fall back to a search URL if for some reason the id is missing.
    const productId = data.id !== undefined ? String(data.id) : null;
    const productUrl = productId
      ? `https://www.pricecharting.com/game/${productId}`
      : `https://www.pricecharting.com/search-products?q=${encodeURIComponent(matchedQuery)}&type=prices`;

    const result: PriceChartingResult = {
      product_id: productId,
      product_name: data["product-name"] ?? cardName,
      console_name: data["console-name"] ?? null,
      product_url: productUrl,
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
      return { status: "not_found", query: matchedQuery };
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
