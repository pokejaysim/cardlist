import { supabase } from "../lib/supabase.js";
import { identifyCard, type CardIdentificationResult } from "./claude/vision.js";
import { buildListingDescription } from "./descriptionBuilder.js";
import { getPublishReadiness } from "./ebay/readiness.js";
import {
  CANADA_BETA_CURRENCY_CODE,
  CANADA_BETA_MARKETPLACE_ID,
} from "./ebay/config.js";
import {
  fetchEbayComps,
  type EbayCompResult,
  type EbayCompsLookup,
} from "./pricing/ebayComps.js";
import {
  priceForCondition,
  searchPriceCharting,
  type PriceChartingLookup,
  type PriceChartingResult,
} from "./pricing/pricecharting.js";
import { generateTitle } from "./titleGenerator.js";
import {
  classifyAutopilotItem,
  smartRoundCadPrice,
  type PhotoPair,
} from "./autopilotRules.js";
import {
  getListingPreferences,
  type ListingPreferences,
  type RawCondition,
} from "./listingPreferences.js";

export interface CreateListingBatchInput {
  items: PhotoPair[];
}

export interface ListingBatchDetail {
  id: string;
  user_id: string;
  status: "processing" | "completed" | "error";
  summary_counts: {
    total: number;
    ready: number;
    needs_review: number;
    error: number;
    processing: number;
  };
  created_at: string;
  completed_at: string | null;
  items: Array<Record<string, unknown> & { listing?: Record<string, unknown> | null }>;
}

interface ListingRow {
  id: string;
  status: string;
  card_name: string;
  set_name: string | null;
  card_number: string | null;
  rarity: string | null;
  language: string;
  condition: string | null;
  card_game: string | null;
  card_type: "raw" | "graded";
  grading_company: string | null;
  grade: string | null;
  cert_number: string | null;
  title: string | null;
  description: string | null;
  price_cad: number | null;
  listing_type: "auction" | "fixed_price";
  duration: number;
  ebay_aspects: Record<string, string | string[]> | null;
  autopilot_metadata: Record<string, unknown> | null;
}

interface PricingResult {
  suggested_price_cad: number | null;
  original_suggested_price_cad: number | null;
  pricechart_price_cad: number | null;
  ebay_avg_price_cad: number | null;
  ebay_comps: EbayCompResult[];
  sources: {
    pricecharting: string;
    ebay: string;
    fx_rate_usd_to_cad: number;
  };
}

function getUsdToCadRate(): number {
  const raw = process.env.USD_TO_CAD_RATE;
  if (!raw) return 1.37;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1.37;
}

function normalizeCondition(value: string | null, fallback: RawCondition): RawCondition {
  return value === "NM" ||
    value === "LP" ||
    value === "MP" ||
    value === "HP" ||
    value === "DMG"
    ? value
    : fallback;
}

function normalizeCardType(value: string | null | undefined): "raw" | "graded" {
  return value === "graded" ? "graded" : "raw";
}

function normalizeGradingCompany(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const upper = trimmed.toUpperCase();
  if (["PSA", "BGS", "CGC", "SGC"].includes(upper)) return upper;
  return "other";
}

function normalizeCertNumber(value: string | null): string | null {
  if (!value) return null;
  const normalized = value.replace(/[^a-zA-Z0-9]/g, "").trim();
  return normalized || null;
}

function priceChartingCadForIdentification(
  result: PriceChartingResult,
  identification: CardIdentificationResult,
  usdToCad: number,
): number | null {
  let usdPrice: number | null;

  if (identification.card_type === "graded") {
    const gradeNumber = Number.parseFloat(identification.grade ?? "");
    if (Number.isFinite(gradeNumber) && gradeNumber >= 9.5) {
      usdPrice = result.price_graded_10_usd ?? result.price_graded_9_usd;
    } else if (Number.isFinite(gradeNumber) && gradeNumber >= 8) {
      usdPrice = result.price_graded_9_usd ?? result.price_raw_usd;
    } else {
      usdPrice = result.price_raw_usd;
    }
  } else {
    usdPrice = priceForCondition(result, identification.condition);
  }

  return usdPrice == null ? null : Math.round(usdPrice * usdToCad * 100) / 100;
}

function sourceStatusLabel(status: PriceChartingLookup | EbayCompsLookup): string {
  if (status.status === "ok") return "ok";
  if (status.status === "no_key") return "not_configured";
  if (status.status === "api_error") return `api_error:${status.message}`;
  return `not_found:${status.query}`;
}

async function suggestAutopilotPrice(
  identification: CardIdentificationResult,
  preferences: ListingPreferences,
): Promise<PricingResult> {
  const usdToCad = getUsdToCadRate();
  const [pricecharting, ebay] = await Promise.all([
    searchPriceCharting(
      identification.card_name,
      identification.set_name || null,
      identification.condition || null,
      identification.card_number || null,
    ),
    fetchEbayComps(
      identification.card_name,
      identification.set_name || null,
      identification.condition || null,
    ),
  ]);

  let pricechartPriceCad: number | null = null;
  if (pricecharting.status === "ok") {
    pricechartPriceCad = priceChartingCadForIdentification(
      pricecharting.result,
      identification,
      usdToCad,
    );
  }

  let ebayComps: EbayCompResult[] = [];
  let ebayAvgPriceCad: number | null = null;
  if (ebay.status === "ok") {
    ebayComps = ebay.comps;
    const converted = ebayComps
      .map((comp) => {
        if (comp.currency === "CAD") return comp.sold_price;
        if (comp.currency === "USD") return comp.sold_price * usdToCad;
        return null;
      })
      .filter((value): value is number => value != null);

    if (converted.length > 0) {
      ebayAvgPriceCad =
        Math.round(
          (converted.reduce((sum, price) => sum + price, 0) / converted.length) *
            100,
        ) / 100;
    }
  }

  const sources = [pricechartPriceCad, ebayAvgPriceCad].filter(
    (price): price is number => price != null && price > 0,
  );
  const originalSuggested =
    sources.length > 0
      ? Math.round(
          (sources.reduce((sum, price) => sum + price, 0) / sources.length) *
            100,
        ) / 100
      : null;
  const suggested =
    originalSuggested == null
      ? null
      : preferences.price_rounding_enabled
        ? smartRoundCadPrice(originalSuggested)
        : originalSuggested;

  return {
    suggested_price_cad: suggested,
    original_suggested_price_cad: originalSuggested,
    pricechart_price_cad: pricechartPriceCad,
    ebay_avg_price_cad: ebayAvgPriceCad,
    ebay_comps: ebayComps,
    sources: {
      pricecharting: sourceStatusLabel(pricecharting),
      ebay: sourceStatusLabel(ebay),
      fx_rate_usd_to_cad: usdToCad,
    },
  };
}

function buildAutopilotMetadata(
  identification: CardIdentificationResult,
  pricing: PricingResult,
  readinessReady: boolean,
  readinessMissing: string[],
  reasons: string[],
): Record<string, unknown> {
  return {
    identification: {
      confidence: identification.confidence,
      card_type: identification.card_type,
      grading_company: identification.grading_company,
      grade: identification.grade,
      cert_number: identification.cert_number,
    },
    pricing: {
      original_suggested_price_cad: pricing.original_suggested_price_cad,
      rounded_price_cad: pricing.suggested_price_cad,
      pricechart_price_cad: pricing.pricechart_price_cad,
      ebay_avg_price_cad: pricing.ebay_avg_price_cad,
      sources: pricing.sources,
    },
    readiness: {
      ready: readinessReady,
      missing: readinessMissing,
    },
    review_reasons: reasons,
    ai_notes:
      "Autopilot created this draft from the front/back photo pair. Please review the facts, photos, and price before publishing.",
  };
}

export async function createListingBatch(
  userId: string,
  input: CreateListingBatchInput,
): Promise<ListingBatchDetail> {
  const items = input.items
    .map((item) => ({
      front_url: item.front_url?.trim(),
      back_url: item.back_url?.trim() || null,
    }))
    .filter(
      (item): item is { front_url: string; back_url: string | null } =>
        Boolean(item.front_url),
    );

  if (items.length === 0) {
    throw new Error("At least one front photo is required.");
  }

  if (items.length > 50) {
    throw new Error("Batch size exceeds the maximum of 50 cards.");
  }

  const preferences = await getListingPreferences(userId);

  const { data: batch, error: batchError } = await supabase
    .from("listing_batches")
    .insert({
      user_id: userId,
      status: "processing",
      summary_counts: {
        total: items.length,
        ready: 0,
        needs_review: 0,
        error: 0,
        processing: items.length,
      },
    })
    .select()
    .single();

  if (batchError || !batch) {
    throw new Error(
      `Failed to create listing batch: ${batchError?.message ?? "unknown error"}`,
    );
  }

  const batchId = String((batch as Record<string, unknown>).id);

  for (const [index, item] of items.entries()) {
    await processBatchItem({
      userId,
      batchId,
      position: index + 1,
      frontUrl: item.front_url,
      backUrl: item.back_url,
      preferences,
    });
  }

  await refreshBatchSummary(batchId);
  return getListingBatch(userId, batchId);
}

export async function getListingBatch(
  userId: string,
  batchId: string,
): Promise<ListingBatchDetail> {
  const { data: batch, error: batchError } = await supabase
    .from("listing_batches")
    .select("*")
    .eq("id", batchId)
    .eq("user_id", userId)
    .single();

  if (batchError || !batch) {
    throw new Error("Listing batch not found.");
  }

  const { data: items, error: itemsError } = await supabase
    .from("listing_batch_items")
    .select("*")
    .eq("batch_id", batchId)
    .order("position", { ascending: true });

  if (itemsError) {
    throw new Error(`Failed to load listing batch items: ${itemsError.message}`);
  }

  const batchItems = (items as Array<Record<string, unknown>> | null) ?? [];
  const listingIds = batchItems
    .map((item) => item.listing_id)
    .filter((id): id is string => typeof id === "string");

  const listingsById = new Map<string, Record<string, unknown>>();
  if (listingIds.length > 0) {
    const { data: listings, error: listingsError } = await supabase
      .from("listings")
      .select("*")
      .eq("user_id", userId)
      .in("id", listingIds);

    if (listingsError) {
      throw new Error(`Failed to load batch listings: ${listingsError.message}`);
    }

    for (const listing of (listings as Array<Record<string, unknown>> | null) ??
      []) {
      if (typeof listing.id === "string") {
        listingsById.set(listing.id, listing);
      }
    }
  }

  const detail = batch as Record<string, unknown>;
  return {
    id: String(detail.id),
    user_id: String(detail.user_id),
    status: detail.status === "error" ? "error" : detail.status === "processing" ? "processing" : "completed",
    summary_counts: normalizeSummaryCounts(detail.summary_counts),
    created_at: String(detail.created_at),
    completed_at:
      typeof detail.completed_at === "string" ? detail.completed_at : null,
    items: batchItems.map((item) => ({
      ...item,
      needs_review_reasons: normalizeStringArray(item.needs_review_reasons),
      listing:
        typeof item.listing_id === "string"
          ? listingsById.get(item.listing_id) ?? null
          : null,
    })),
  };
}

async function processBatchItem(input: {
  userId: string;
  batchId: string;
  position: number;
  frontUrl: string;
  backUrl: string | null;
  preferences: ListingPreferences;
}): Promise<void> {
  const { data: batchItem, error: itemError } = await supabase
    .from("listing_batch_items")
    .insert({
      batch_id: input.batchId,
      position: input.position,
      front_photo_url: input.frontUrl,
      back_photo_url: input.backUrl,
      status: "processing",
    })
    .select()
    .single();

  if (itemError || !batchItem) {
    console.error("Failed to create batch item:", itemError);
    return;
  }

  const batchItemId = String((batchItem as Record<string, unknown>).id);

  try {
    const identification = await identifyCard(input.frontUrl);
    identification.card_type = normalizeCardType(identification.card_type);
    identification.grading_company =
      identification.card_type === "graded"
        ? normalizeGradingCompany(identification.grading_company)
        : null;
    identification.grade =
      identification.card_type === "graded" && identification.grade
        ? identification.grade.trim()
        : null;
    identification.cert_number =
      identification.card_type === "graded"
        ? normalizeCertNumber(identification.cert_number)
        : null;
    identification.condition =
      identification.card_type === "graded"
        ? ""
        : normalizeCondition(
            identification.condition,
            input.preferences.default_raw_condition,
          );
    identification.card_game =
      identification.card_game === "pokemon" ? "pokemon" : identification.card_game;

    const pricing = await suggestAutopilotPrice(
      identification,
      input.preferences,
    );
    const listing = await insertAutopilotListing({
      userId: input.userId,
      identification,
      preferences: input.preferences,
      pricing,
      frontUrl: input.frontUrl,
      backUrl: input.backUrl,
    });

    await insertListingPhotos(listing.id, input.frontUrl, input.backUrl);

    let readinessReady = false;
    let readinessMissing: string[] = [];
    try {
      const readiness = await getPublishReadiness(listing.id, input.userId);
      readinessReady = readiness.ready;
      readinessMissing = readiness.missing.map((entry) => entry.message);
    } catch (error) {
      readinessMissing = [
        error instanceof Error
          ? error.message
          : "Publish readiness could not be checked.",
      ];
    }

    const classification = classifyAutopilotItem({
      confidence: identification.confidence,
      price_cad: pricing.suggested_price_cad,
      has_front_photo: true,
      has_back_photo: Boolean(input.backUrl),
      card_type: identification.card_type,
      condition: identification.condition || null,
      grading_company: identification.grading_company,
      grade: identification.grade,
      readiness_ready: readinessReady,
      readiness_missing: readinessMissing,
    });

    const metadata = buildAutopilotMetadata(
      identification,
      pricing,
      readinessReady,
      readinessMissing,
      classification.reasons,
    );

    await supabase
      .from("listings")
      .update({ autopilot_metadata: metadata })
      .eq("id", listing.id)
      .eq("user_id", input.userId);

    await supabase
      .from("listing_batch_items")
      .update({
        listing_id: listing.id,
        status: classification.status,
        confidence_score: identification.confidence,
        needs_review_reasons: classification.reasons,
        error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", batchItemId);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Autopilot processing failed.";
    console.error("Autopilot batch item failed:", message);
    await supabase
      .from("listing_batch_items")
      .update({
        status: "error",
        error: message,
        updated_at: new Date().toISOString(),
      })
      .eq("id", batchItemId);
  }
}

async function insertAutopilotListing(input: {
  userId: string;
  identification: CardIdentificationResult;
  preferences: ListingPreferences;
  pricing: PricingResult;
  frontUrl: string;
  backUrl: string | null;
}): Promise<ListingRow> {
  const isGraded = input.identification.card_type === "graded";
  const title = generateTitle({
    card_name: input.identification.card_name,
    card_number: input.identification.card_number || null,
    set_name: input.identification.set_name || null,
    rarity: input.identification.rarity || null,
    condition: isGraded ? null : input.identification.condition,
    language: input.identification.language || "English",
    card_type: input.identification.card_type,
    grading_company: input.identification.grading_company,
    grade: input.identification.grade,
    cert_number: input.identification.cert_number,
  });
  const listingType = input.preferences.default_batch_fixed_price
    ? "fixed_price"
    : input.preferences.default_listing_type;
  const photoUrls = [input.frontUrl, input.backUrl].filter(
    (url): url is string => Boolean(url),
  );
  const description = await buildListingDescription(input.userId, {
    title,
    card_name: input.identification.card_name,
    set_name: input.identification.set_name || null,
    card_number: input.identification.card_number || null,
    rarity: input.identification.rarity || null,
    condition: isGraded ? null : input.identification.condition,
    language: input.identification.language || "English",
    card_type: input.identification.card_type,
    grading_company: input.identification.grading_company,
    grade: input.identification.grade,
    cert_number: input.identification.cert_number,
    price_cad: input.pricing.suggested_price_cad,
  });

  const { data, error } = await supabase
    .from("listings")
    .insert({
      user_id: input.userId,
      status: "draft",
      card_name: input.identification.card_name,
      set_name: input.identification.set_name || null,
      card_number: input.identification.card_number || null,
      rarity: input.identification.rarity || null,
      language: input.identification.language || "English",
      condition: isGraded ? null : input.identification.condition,
      card_game: input.identification.card_game === "pokemon" ? "pokemon" : null,
      card_type: input.identification.card_type,
      grading_company: input.identification.grading_company,
      grade: input.identification.grade,
      cert_number: input.identification.cert_number,
      identified_by: "ai",
      title,
      description,
      price_cad: input.pricing.suggested_price_cad,
      marketplace_id: CANADA_BETA_MARKETPLACE_ID,
      currency_code: CANADA_BETA_CURRENCY_CODE,
      listing_type: listingType,
      duration: listingType === "fixed_price" ? 30 : 7,
      ebay_aspects:
        input.identification.card_game === "pokemon"
          ? { Game: "Pokemon TCG", Manufacturer: "Nintendo" }
          : {},
      photo_urls: photoUrls,
      autopilot_metadata: {
        identification: {
          confidence: input.identification.confidence,
          card_type: input.identification.card_type,
          grading_company: input.identification.grading_company,
          grade: input.identification.grade,
          cert_number: input.identification.cert_number,
        },
        pricing: {
          original_suggested_price_cad:
            input.pricing.original_suggested_price_cad,
          rounded_price_cad: input.pricing.suggested_price_cad,
          pricechart_price_cad: input.pricing.pricechart_price_cad,
          ebay_avg_price_cad: input.pricing.ebay_avg_price_cad,
          sources: input.pricing.sources,
        },
      },
    })
    .select()
    .single();

  if (error || !data) {
    throw new Error(
      `Failed to create autopilot draft: ${error?.message ?? "unknown error"}`,
    );
  }

  return data as ListingRow;
}

async function insertListingPhotos(
  listingId: string,
  frontUrl: string,
  backUrl: string | null,
): Promise<void> {
  const rows = [
    { listing_id: listingId, file_url: frontUrl, position: 1 },
    ...(backUrl
      ? [{ listing_id: listingId, file_url: backUrl, position: 2 }]
      : []),
  ];

  const { error } = await supabase.from("photos").insert(rows);
  if (error) {
    throw new Error(`Failed to attach listing photos: ${error.message}`);
  }
}

async function refreshBatchSummary(batchId: string): Promise<void> {
  const { data: items, error } = await supabase
    .from("listing_batch_items")
    .select("status")
    .eq("batch_id", batchId);

  if (error) {
    throw new Error(`Failed to summarize listing batch: ${error.message}`);
  }

  const statuses = ((items as Array<{ status?: string }> | null) ?? []).map(
    (item) => item.status ?? "processing",
  );
  const summary = {
    total: statuses.length,
    ready: statuses.filter((status) => status === "ready").length,
    needs_review: statuses.filter((status) => status === "needs_review").length,
    error: statuses.filter((status) => status === "error").length,
    processing: statuses.filter((status) => status === "processing").length,
  };

  await supabase
    .from("listing_batches")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
      summary_counts: summary,
    })
    .eq("id", batchId);
}

function normalizeSummaryCounts(input: unknown): ListingBatchDetail["summary_counts"] {
  const value =
    input && typeof input === "object" ? (input as Record<string, unknown>) : {};

  return {
    total: numberOrZero(value.total),
    ready: numberOrZero(value.ready),
    needs_review: numberOrZero(value.needs_review),
    error: numberOrZero(value.error),
    processing: numberOrZero(value.processing),
  };
}

function normalizeStringArray(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input.filter((value): value is string => typeof value === "string");
}

function numberOrZero(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
