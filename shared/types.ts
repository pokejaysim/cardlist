// ── Users ──────────────────────────────────────────────

export interface User {
  id: string;
  email: string;
  name: string | null;
  created_at: string;
  stripe_customer_id: string | null;
  plan: "free" | "pro" | "enterprise";
}

// ── eBay Accounts ──────────────────────────────────────

export interface EbayAccount {
  id: string;
  user_id: string;
  ebay_token: string;
  ebay_user_id: string;
  site_id: number;
  created_at: string;
  refreshed_at: string | null;
}

export interface EbayBusinessPolicy {
  id: string;
  name: string;
  marketplace_id: string;
}

export interface EbaySellerSettings {
  user_id: string;
  marketplace_id: string;
  location: string | null;
  postal_code: string | null;
  fulfillment_policy_id: string | null;
  fulfillment_policy_name: string | null;
  payment_policy_id: string | null;
  payment_policy_name: string | null;
  return_policy_id: string | null;
  return_policy_name: string | null;
  shipping_service: string | null;
  shipping_cost: number | null;
  handling_time_days: number | null;
  returns_accepted: boolean | null;
  return_period_days: number | null;
  return_shipping_cost_payer: "Buyer" | "Seller" | null;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface EbayPublishSettingsResponse {
  linked: boolean;
  marketplace_id: string;
  settings: EbaySellerSettings | null;
  available_policies: {
    fulfillment: EbayBusinessPolicy[];
    payment: EbayBusinessPolicy[];
    return: EbayBusinessPolicy[];
  };
  policy_support: {
    available: boolean;
    message: string | null;
  };
  publish_strategy: "business_policies" | "snapcard_defaults" | "incomplete";
  readiness: {
    ready: boolean;
    missing: string[];
  };
}

export interface EbayAspectField {
  name: string;
  required: boolean;
  mode: "select" | "text";
  multiple: boolean;
  values: string[];
  value: string | string[] | null;
  description: string | null;
}

export interface EbayPublishReadiness {
  ready: boolean;
  missing: Array<{
    code: string;
    message: string;
    scope: "seller" | "listing";
  }>;
  warnings: string[];
  resolved_item_specifics: Record<string, string[]>;
  unresolved_required_aspects: EbayAspectField[];
  allowed_listing_types: ListingType[];
  allowed_auction_durations: number[];
  current_listing_type: ListingType;
  current_duration: number;
  display_duration: string;
}

// ── Listings ───────────────────────────────────────────

export type ListingStatus = "draft" | "publishing" | "scheduled" | "published" | "error";
export type ListingType = "auction" | "fixed_price";
export type CardCondition = "NM" | "LP" | "MP" | "HP" | "DMG";
export type CardGame = "pokemon";
export type CardType = "raw" | "graded";
export type GradingCompany = "PSA" | "BGS" | "CGC" | "SGC" | "other";
export type EbayMarketplace = "EBAY_CA" | "EBAY_US";

export const CANADA_BETA_MARKETPLACE_ID = "EBAY_CA" as const;
export const CANADA_BETA_CURRENCY_CODE = "CAD" as const;

export const EBAY_MARKETPLACE_CONFIG: Record<EbayMarketplace, { siteId: string; country: string; currency: string; label: string }> = {
  EBAY_CA: { siteId: "2", country: "CA", currency: "CAD", label: "eBay Canada" },
  EBAY_US: { siteId: "0", country: "US", currency: "USD", label: "eBay US" },
};

export const SNAPCARD_FALLBACK_SHIPPING_OPTIONS: Record<
  EbayMarketplace,
  Array<{ value: string; label: string }>
> = {
  EBAY_CA: [
    { value: "CA_PostLettermail", label: "Canada Post Lettermail" },
    { value: "CA_PostRegularParcel", label: "Canada Post Regular Parcel" },
    { value: "CA_PostExpeditedParcel", label: "Canada Post Expedited Parcel" },
  ],
  EBAY_US: [
    { value: "USPSGround", label: "USPS Ground" },
    { value: "USPSFirstClass", label: "USPS First Class" },
    { value: "USPSPriority", label: "USPS Priority Mail" },
  ],
};

export const SNAPCARD_FALLBACK_HANDLING_TIME_OPTIONS = [1, 2, 3, 5] as const;
export const SNAPCARD_FALLBACK_RETURN_DAYS_OPTIONS = [14, 30, 60] as const;

export interface Listing {
  id: string;
  user_id: string;
  ebay_item_id: number | null;
  status: ListingStatus;

  // Card details
  card_name: string;
  set_name: string | null;
  card_number: string | null;
  rarity: string | null;
  language: string;
  condition: CardCondition | null;
  card_game: CardGame | null;
  card_type: CardType;
  grading_company: GradingCompany | null;
  grade: string | null;
  cert_number: string | null;
  identified_by: "manual" | "ai" | "pokemon_tcg";

  // Listing details
  title: string | null;
  description: string | null;
  price_cad: number | null;
  marketplace_id: string;
  currency_code: string;
  listing_type: ListingType;
  duration: number;
  ebay_aspects: Record<string, string | string[]> | null;

  // Photos
  photo_urls: string[];

  // Metadata
  created_at: string;
  published_at: string | null;
  scheduled_at: string | null;
  publish_started_at: string | null;
  publish_attempted_at: string | null;
  ebay_error: string | null;
  research_notes: string | null;
  autopilot_metadata: Record<string, unknown> | null;
}

// ── Seller Listing Preferences ─────────────────────────

export interface ListingPreference {
  user_id: string;
  default_listing_type: ListingType;
  default_batch_fixed_price: boolean;
  price_rounding_enabled: boolean;
  default_raw_condition: CardCondition;
  description_template: string | null;
  description_template_html: string | null;
  seller_logo_url: string | null;
  created_at: string;
  updated_at: string;
}

// ── Autopilot Batches ─────────────────────────────────

export type ListingBatchStatus = "processing" | "completed" | "error";
export type ListingBatchItemStatus =
  | "processing"
  | "ready"
  | "needs_review"
  | "error";

export interface ListingBatchSummaryCounts {
  total: number;
  ready: number;
  needs_review: number;
  error: number;
  processing: number;
}

export interface ListingBatch {
  id: string;
  user_id: string;
  status: ListingBatchStatus;
  summary_counts: ListingBatchSummaryCounts;
  created_at: string;
  completed_at: string | null;
}

export interface ListingBatchItem {
  id: string;
  batch_id: string;
  listing_id: string | null;
  position: number;
  front_photo_url: string;
  back_photo_url: string | null;
  status: ListingBatchItemStatus;
  confidence_score: number | null;
  needs_review_reasons: string[];
  error: string | null;
  created_at: string;
  updated_at: string;
  listing?: Listing | null;
}

export interface ListingBatchDetail extends ListingBatch {
  items: ListingBatchItem[];
}

export interface CreateListingBatchRequest {
  items: Array<{
    front_url: string;
    back_url?: string | null;
  }>;
}

export interface BulkPublishRequest {
  listing_ids: string[];
  mode: "now" | "scheduled";
  scheduled_at?: string | null;
}

export interface BulkPublishListingResult {
  listing_id: string;
  status: "blocked" | "publishing" | "published" | "scheduled" | "error";
  ebay_item_id?: string | number | null;
  scheduled_at?: string | null;
  error?: string | null;
}

export interface BulkPublishResponse {
  results: BulkPublishListingResult[];
}

// ── Photos ─────────────────────────────────────────────

export interface Photo {
  id: string;
  listing_id: string;
  file_url: string | null;
  ebay_url: string | null;
  position: number;
  uploaded_at: string;
}

// ── Price Research ─────────────────────────────────────

export interface EbayComp {
  title: string;
  sold_price: number;
  condition: string;
  sold_date: string;
}

export interface PriceResearch {
  id: string;
  listing_id: string;
  pricechart_data: Record<string, unknown>;
  ebay_comps: EbayComp[];
  suggested_price_cad: number;
  researched_at: string;
}

export interface PriceSuggestion {
  suggested_price_cad: number;
  pricechart_price: number | null;
  ebay_avg_price: number | null;
  ebay_comps: EbayComp[];
  reasoning: string;
}

// ── Card Identification (Claude Vision) ────────────────

export interface CardIdentification {
  card_name: string;
  set_name: string;
  card_number: string;
  rarity: string;
  language: string;
  condition: CardCondition;
  card_game: CardGame;
  card_type: CardType;
  grading_company: GradingCompany | null;
  grade: string | null;
  cert_number: string | null;
  confidence: number; // 0-1
}

// ── API Responses ──────────────────────────────────────

// ── Usage / Plan Info ─────────────────────────────────

export interface UsageInfo {
  plan: "free" | "pro" | "enterprise";
  listings_this_month: number;
  listings_limit: number | null;
  total_listings: number;
  published_listings: number;
  ai_identify: boolean;
  pricing_suggestions: boolean;
  card_search: boolean;
}

// ── API Responses ──────────────────────────────────────

// ── Pokemon TCG API ──────────────────────────────────

export interface PokemonTcgSearchResult {
  id: string;
  name: string;
  set_name: string;
  set_series: string;
  number: string;
  rarity: string | null;
  image_small: string;
  image_large: string;
}

export interface PokemonTcgCardDetail extends PokemonTcgSearchResult {
  supertype: string;
  subtypes: string[];
  tcgplayer_url: string | null;
  tcgplayer_prices: {
    variant: string;
    low: number | null;
    mid: number | null;
    high: number | null;
    market: number | null;
  } | null;
}

// ── API Responses ──────────────────────────────────────

export interface ApiError {
  error: string;
  code?: string;
}
