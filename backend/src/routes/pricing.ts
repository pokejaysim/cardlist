import { Router } from "express";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth.js";
import { requirePlan } from "../middleware/requirePlan.js";
import { supabase } from "../lib/supabase.js";
import {
  searchPriceCharting,
  priceForCondition,
  type PriceChartingResult,
} from "../services/pricing/pricecharting.js";
import {
  fetchEbayComps,
  type EbayCompResult,
} from "../services/pricing/ebayComps.js";

const router = Router();

/**
 * USD → CAD conversion rate. Configurable via env var so it can be kept
 * current without a redeploy. Default 1.37 (approximate late-2025 rate —
 * adjust via USD_TO_CAD_RATE in Railway when exchange rates shift).
 */
function getUsdToCadRate(): number {
  const raw = process.env.USD_TO_CAD_RATE;
  if (!raw) return 1.37;
  const parsed = Number(raw);
  if (!isFinite(parsed) || parsed <= 0) return 1.37;
  return parsed;
}

interface SuggestRequestBody {
  card_name: string;
  set_name?: string;
  condition?: string;
  listing_id?: string;
}

/**
 * Per-source status surfaced to the frontend so it can show a targeted error
 * ("not configured", "temporary outage", "no matches") instead of a generic
 * "no data available" catch-all.
 */
type SourceStatus =
  | { state: "ok" }
  | { state: "no_key" }
  | { state: "api_error"; message: string }
  | { state: "not_found"; query: string };

interface SuggestResponse {
  suggested_price_cad: number | null;
  pricechart_price: number | null;
  ebay_avg_price: number | null;
  ebay_comps: EbayCompResult[];
  reasoning: string;
  sources: {
    pricecharting: SourceStatus;
    ebay: SourceStatus;
    fx_rate_usd_to_cad: number;
    condition_applied: string;
  };
}

// ── POST /pricing/suggest ─────────────────────────────────

router.post("/pricing/suggest", requireAuth, requirePlan("pricing_suggestions"), async (req, res) => {
  const _authReq = req as AuthenticatedRequest;
  const body = req.body as SuggestRequestBody;

  if (!body.card_name) {
    res.status(400).json({ error: "card_name is required" });
    return;
  }

  const cardName = body.card_name;
  const setName = body.set_name ?? null;
  const condition = body.condition ?? null;
  const USD_TO_CAD = getUsdToCadRate();

  // Fetch pricing data from both sources in parallel
  const [pcLookup, ebayLookup] = await Promise.all([
    searchPriceCharting(cardName, setName, condition),
    fetchEbayComps(cardName, setName, condition),
  ]);

  // -- PriceCharting: unpack status, compute CAD price if ok --
  let pcResult: PriceChartingResult | null = null;
  let pcStatus: SourceStatus;
  let pricechartPrice: number | null = null;
  if (pcLookup.status === "ok") {
    pcResult = pcLookup.result;
    pcStatus = { state: "ok" };
    const usdPrice = priceForCondition(pcResult, condition);
    if (usdPrice !== null) {
      pricechartPrice = Math.round(usdPrice * USD_TO_CAD * 100) / 100;
    }
  } else if (pcLookup.status === "no_key") {
    pcStatus = { state: "no_key" };
  } else if (pcLookup.status === "api_error") {
    pcStatus = { state: "api_error", message: pcLookup.message };
  } else {
    pcStatus = { state: "not_found", query: pcLookup.query };
  }

  // -- eBay: unpack status, filter currencies, average in CAD --
  //
  // eBay returns comps in various currencies (USD, CAD, GBP, etc.) — we only
  // trust USD and CAD and convert USD to CAD. Mixing currencies without
  // conversion produced garbage averages before.
  let ebayComps: EbayCompResult[] = [];
  let ebayStatus: SourceStatus;
  let ebayAvgPrice: number | null = null;
  if (ebayLookup.status === "ok") {
    ebayComps = ebayLookup.comps;
    ebayStatus = { state: "ok" };
    const ebayCompsInCad = ebayComps
      .map((comp) => {
        if (comp.currency === "CAD") return comp.sold_price;
        if (comp.currency === "USD") {
          return Math.round(comp.sold_price * USD_TO_CAD * 100) / 100;
        }
        return null;
      })
      .filter((p): p is number => p !== null);
    if (ebayCompsInCad.length > 0) {
      const total = ebayCompsInCad.reduce((sum, p) => sum + p, 0);
      ebayAvgPrice = Math.round((total / ebayCompsInCad.length) * 100) / 100;
    }
  } else if (ebayLookup.status === "no_key") {
    ebayStatus = { state: "no_key" };
  } else if (ebayLookup.status === "api_error") {
    ebayStatus = { state: "api_error", message: ebayLookup.message };
  } else {
    ebayStatus = { state: "not_found", query: ebayLookup.query };
  }

  // -- Suggested price: average of available sources --
  let suggestedPriceCad: number | null = null;
  const reasoningParts: string[] = [];
  const conditionLabel = (condition ?? "NM").toUpperCase();

  if (pricechartPrice !== null && ebayAvgPrice !== null) {
    suggestedPriceCad = Math.round(((pricechartPrice + ebayAvgPrice) / 2) * 100) / 100;
    reasoningParts.push(
      `PriceCharting raw card, ${conditionLabel} adjusted: $${pricechartPrice.toFixed(2)} CAD.`,
    );
    reasoningParts.push(
      `eBay average of ${String(ebayComps.length)} recent sold comp${ebayComps.length === 1 ? "" : "s"}: $${ebayAvgPrice.toFixed(2)} CAD.`,
    );
    reasoningParts.push(
      `Suggested: $${suggestedPriceCad.toFixed(2)} CAD (average of both).`,
    );
  } else if (pricechartPrice !== null) {
    suggestedPriceCad = pricechartPrice;
    reasoningParts.push(
      `PriceCharting raw card, ${conditionLabel} adjusted: $${pricechartPrice.toFixed(2)} CAD.`,
    );
    reasoningParts.push(reasonForUnavailable("eBay sold comps", ebayStatus));
  } else if (ebayAvgPrice !== null) {
    suggestedPriceCad = ebayAvgPrice;
    reasoningParts.push(
      `eBay average of ${String(ebayComps.length)} recent sold comp${ebayComps.length === 1 ? "" : "s"}: $${ebayAvgPrice.toFixed(2)} CAD.`,
    );
    reasoningParts.push(reasonForUnavailable("PriceCharting", pcStatus));
  } else {
    reasoningParts.push(reasonForUnavailable("PriceCharting", pcStatus));
    reasoningParts.push(reasonForUnavailable("eBay sold comps", ebayStatus));
    reasoningParts.push("Please set price manually.");
  }

  const reasoning = reasoningParts.join(" ");

  // -- Persist to price_research if listing_id provided --
  if (body.listing_id) {
    const { error: insertError } = await supabase.from("price_research").insert({
      listing_id: body.listing_id,
      pricechart_data: pcResult ?? null,
      ebay_comps: ebayComps,
      suggested_price_cad: suggestedPriceCad,
    });

    if (insertError) {
      console.error("Failed to save price research:", insertError);
      // Non-fatal: still return the pricing suggestion
    }
  }

  const response: SuggestResponse = {
    suggested_price_cad: suggestedPriceCad,
    pricechart_price: pricechartPrice,
    ebay_avg_price: ebayAvgPrice,
    ebay_comps: ebayComps,
    reasoning,
    sources: {
      pricecharting: pcStatus,
      ebay: ebayStatus,
      fx_rate_usd_to_cad: USD_TO_CAD,
      condition_applied: conditionLabel,
    },
  };

  res.json(response);
});

/**
 * Human-readable reason why a source didn't contribute to the suggestion.
 * Keeps the reasoning text actionable instead of a generic "not available".
 */
function reasonForUnavailable(label: string, status: SourceStatus): string {
  switch (status.state) {
    case "ok":
      return ""; // shouldn't be called in this case
    case "no_key":
      return `${label} is not configured on the server.`;
    case "api_error":
      return `${label} API error (${status.message}).`;
    case "not_found":
      return `${label} found no match for "${status.query}".`;
  }
}

export default router;
