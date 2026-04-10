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

// ── Listings ───────────────────────────────────────────

export type ListingStatus = "draft" | "scheduled" | "published" | "error";
export type ListingType = "auction" | "fixed_price";
export type CardCondition = "NM" | "LP" | "MP" | "HP" | "DMG";
export type CardGame = "pokemon";

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
  identified_by: "manual" | "ai";

  // Listing details
  title: string | null;
  description: string | null;
  price_cad: number | null;
  listing_type: ListingType;
  duration: number;

  // Photos
  photo_urls: string[];

  // Metadata
  created_at: string;
  published_at: string | null;
  ebay_error: string | null;
  research_notes: string | null;
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
}

// ── API Responses ──────────────────────────────────────

export interface ApiError {
  error: string;
  code?: string;
}
