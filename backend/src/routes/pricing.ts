import { Router } from "express";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth.js";
import { requirePlan } from "../middleware/requirePlan.js";
import { supabase } from "../lib/supabase.js";
import {
  searchPriceCharting,
  priceForCondition,
} from "../services/pricing/pricecharting.js";
import { fetchEbayComps } from "../services/pricing/ebayComps.js";

const router = Router();

const USD_TO_CAD = 1.35;

interface SuggestRequestBody {
  card_name: string;
  set_name?: string;
  condition?: string;
  listing_id?: string;
}

interface SuggestResponse {
  suggested_price_cad: number | null;
  pricechart_price: number | null;
  ebay_avg_price: number | null;
  ebay_comps: Array<{
    title: string;
    sold_price: number;
    condition: string;
    sold_date: string;
    currency: string;
  }>;
  reasoning: string;
}

// ── POST /pricing/suggest ─────────────────────────────────

router.post("/pricing/suggest", requireAuth, requirePlan("pricing_suggestions"), async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const body = req.body as SuggestRequestBody;

  if (!body.card_name) {
    res.status(400).json({ error: "card_name is required" });
    return;
  }

  const cardName = body.card_name;
  const setName = body.set_name ?? null;
  const condition = body.condition ?? null;

  // Fetch pricing data from both sources in parallel
  const [pcResult, ebayComps] = await Promise.all([
    searchPriceCharting(cardName, setName, condition),
    fetchEbayComps(cardName, setName, condition),
  ]);

  // -- PriceCharting price (converted to CAD) --
  let pricechartPrice: number | null = null;
  if (pcResult) {
    const usdPrice = priceForCondition(pcResult, condition);
    if (usdPrice !== null) {
      pricechartPrice = Math.round(usdPrice * USD_TO_CAD * 100) / 100;
    }
  }

  // -- eBay average sold price --
  let ebayAvgPrice: number | null = null;
  if (ebayComps.length > 0) {
    const total = ebayComps.reduce((sum, comp) => sum + comp.sold_price, 0);
    ebayAvgPrice = Math.round((total / ebayComps.length) * 100) / 100;
  }

  // -- Suggested price: average of available sources --
  let suggestedPriceCad: number | null = null;
  const reasoningParts: string[] = [];

  if (pricechartPrice !== null && ebayAvgPrice !== null) {
    suggestedPriceCad = Math.round(((pricechartPrice + ebayAvgPrice) / 2) * 100) / 100;
    reasoningParts.push(
      `PriceCharting (${condition ?? "NM"}): $${pricechartPrice.toFixed(2)} CAD`
    );
    reasoningParts.push(
      `eBay avg of ${ebayComps.length} sold comps: $${ebayAvgPrice.toFixed(2)}`
    );
    reasoningParts.push(
      `Suggested price is the average of both sources: $${suggestedPriceCad.toFixed(2)} CAD`
    );
  } else if (pricechartPrice !== null) {
    suggestedPriceCad = pricechartPrice;
    reasoningParts.push(
      `PriceCharting (${condition ?? "NM"}): $${pricechartPrice.toFixed(2)} CAD`
    );
    reasoningParts.push("No eBay sold comps found; using PriceCharting price only.");
  } else if (ebayAvgPrice !== null) {
    suggestedPriceCad = ebayAvgPrice;
    reasoningParts.push(
      `eBay avg of ${ebayComps.length} sold comps: $${ebayAvgPrice.toFixed(2)}`
    );
    reasoningParts.push("PriceCharting data unavailable; using eBay comps only.");
  } else {
    reasoningParts.push(
      "No pricing data available from PriceCharting or eBay. Please set price manually."
    );
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
  };

  res.json(response);
});

export default router;
