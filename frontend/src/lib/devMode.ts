// ── Dev Mode ──────────────────────────────────────────
// Enable via VITE_DEV_MODE=true in .env to bypass auth and use mock data.
// When unset or "false", the app connects to real Supabase + backend.

import type { EbayPublishSettingsResponse } from "../../../shared/types";

export const DEV_MODE = import.meta.env.VITE_DEV_MODE === "true";

export const DEV_USER = {
  id: "dev-user-00000000-0000-0000-0000-000000000000",
  email: "demo@snapcard.dev",
  name: "Demo User",
};

export const DEV_USAGE = {
  plan: "free" as const,
  listings_this_month: 3,
  listings_limit: null,
  total_listings: 7,
  published_listings: 2,
  ai_identify: true,
  pricing_suggestions: true,
  card_search: true,
};

// Full listing shape used by both Dashboard and ListingDetail
interface DevListing {
  id: string;
  card_name: string;
  set_name: string | null;
  card_number: string | null;
  rarity: string | null;
  language: string;
  condition: string | null;
  card_game: string;
  card_type: "raw" | "graded";
  grading_company: string | null;
  grade: string | null;
  cert_number: string | null;
  status: string;
  title: string | null;
  description: string | null;
  price_cad: number | null;
  marketplace_id: string;
  currency_code: string;
  listing_type: string;
  duration: number;
  ebay_aspects: Record<string, string | string[]> | null;
  created_at: string;
  published_at: string | null;
  scheduled_at: string | null;
  publish_started_at: string | null;
  publish_attempted_at: string | null;
  ebay_item_id: number | string | null;
  ebay_error: string | null;
  identified_by: string;
  autopilot_metadata: Record<string, unknown> | null;
}

// Mutable array so new listings persist within the session
export const DEV_LISTINGS: DevListing[] = [
  {
    id: "dev-listing-1",
    card_name: "Charizard",
    set_name: "Base Set",
    card_number: "4/102",
    rarity: "Holo Rare",
    language: "English",
    condition: "NM",
    card_game: "pokemon",
    card_type: "raw",
    grading_company: null,
    grade: null,
    cert_number: null,
    status: "published",
    title: "Charizard 4/102 Base Set Holo Rare NM",
    description: "Charizard — Base Set 4/102 — Condition: NM",
    price_cad: 450.0,
    marketplace_id: "EBAY_CA",
    currency_code: "CAD",
    listing_type: "auction",
    duration: 7,
    ebay_aspects: {
      Game: "Pokemon TCG",
      Manufacturer: "Nintendo",
    },
    created_at: new Date(Date.now() - 7 * 86400000).toISOString(),
    published_at: new Date(Date.now() - 6 * 86400000).toISOString(),
    scheduled_at: null,
    publish_started_at: new Date(Date.now() - 6 * 86400000).toISOString(),
    publish_attempted_at: new Date(Date.now() - 6 * 86400000).toISOString(),
    ebay_item_id: 1234567890,
    ebay_error: null,
    identified_by: "manual",
    autopilot_metadata: null,
  },
  {
    id: "dev-listing-2",
    card_name: "Blastoise",
    set_name: "Base Set",
    card_number: "2/102",
    rarity: "Holo Rare",
    language: "English",
    condition: "LP",
    card_game: "pokemon",
    card_type: "raw",
    grading_company: null,
    grade: null,
    cert_number: null,
    status: "scheduled",
    title: "Blastoise 2/102 Base Set Holo Rare LP",
    description: "Blastoise — Base Set 2/102 — Condition: LP",
    price_cad: 85.0,
    marketplace_id: "EBAY_CA",
    currency_code: "CAD",
    listing_type: "fixed_price",
    duration: 30,
    ebay_aspects: {
      Game: "Pokemon TCG",
    },
    created_at: new Date(Date.now() - 2 * 86400000).toISOString(),
    published_at: null,
    scheduled_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
    publish_started_at: null,
    publish_attempted_at: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
    ebay_item_id: null,
    ebay_error: null,
    identified_by: "manual",
    autopilot_metadata: null,
  },
  {
    id: "dev-listing-3",
    card_name: "Pikachu VMAX",
    set_name: "Vivid Voltage",
    card_number: "044/185",
    rarity: "VMAX",
    language: "English",
    condition: "NM",
    card_game: "pokemon",
    card_type: "raw",
    grading_company: null,
    grade: null,
    cert_number: null,
    status: "draft",
    title: "Pikachu VMAX 044/185 Vivid Voltage NM",
    description: null,
    price_cad: null,
    marketplace_id: "EBAY_CA",
    currency_code: "CAD",
    listing_type: "auction",
    duration: 7,
    ebay_aspects: null,
    created_at: new Date(Date.now() - 86400000).toISOString(),
    published_at: null,
    scheduled_at: null,
    publish_started_at: null,
    publish_attempted_at: null,
    ebay_item_id: null,
    ebay_error: null,
    identified_by: "manual",
    autopilot_metadata: null,
  },
  {
    id: "dev-listing-4",
    card_name: "Mewtwo EX",
    set_name: "Pokemon 151",
    card_number: "150/165",
    rarity: "Ultra Rare",
    language: "English",
    condition: "NM",
    card_game: "pokemon",
    card_type: "raw",
    grading_company: null,
    grade: null,
    cert_number: null,
    status: "error",
    title: "Mewtwo EX 150/165 Pokemon 151 Ultra Rare NM",
    description: "Mewtwo EX — Pokemon 151 150/165 — Condition: NM",
    price_cad: 25.0,
    marketplace_id: "EBAY_CA",
    currency_code: "CAD",
    listing_type: "fixed_price",
    duration: 30,
    ebay_aspects: {
      Game: "Pokemon TCG",
    },
    created_at: new Date().toISOString(),
    published_at: null,
    scheduled_at: null,
    publish_started_at: null,
    publish_attempted_at: new Date().toISOString(),
    ebay_item_id: null,
    ebay_error: "eBay API: Invalid shipping configuration. Please check your shipping settings.",
    identified_by: "manual",
    autopilot_metadata: null,
  },
  {
    id: "dev-listing-5",
    card_name: "Charizard",
    set_name: "Base Set",
    card_number: "4/102",
    rarity: "Holo Rare",
    language: "English",
    condition: null,
    card_game: "pokemon",
    card_type: "graded",
    grading_company: "PSA",
    grade: "10",
    cert_number: "12345678",
    status: "draft",
    title: "Charizard 4/102 Base Set PSA 10 Holo Rare",
    description: "Charizard — Base Set 4/102 — PSA 10 (Gem Mint)",
    price_cad: 15000.0,
    marketplace_id: "EBAY_CA",
    currency_code: "CAD",
    listing_type: "fixed_price",
    duration: 30,
    ebay_aspects: {
      Game: "Pokemon TCG",
      Grader: "PSA",
    },
    created_at: new Date(Date.now() - 3 * 86400000).toISOString(),
    published_at: null,
    scheduled_at: null,
    publish_started_at: null,
    publish_attempted_at: null,
    ebay_item_id: null,
    ebay_error: null,
    identified_by: "manual",
    autopilot_metadata: null,
  },
  {
    id: "dev-listing-6",
    card_name: "Pikachu",
    set_name: "Base Set",
    card_number: "58/102",
    rarity: "Common",
    language: "English",
    condition: null,
    card_game: "pokemon",
    card_type: "graded",
    grading_company: "BGS",
    grade: "9.5",
    cert_number: "98765432",
    status: "published",
    title: "Pikachu 58/102 Base Set BGS 9.5 Common",
    description: "Pikachu — Base Set 58/102 — BGS 9.5 (Gem Mint)",
    price_cad: 350.0,
    marketplace_id: "EBAY_CA",
    currency_code: "CAD",
    listing_type: "auction",
    duration: 7,
    ebay_aspects: {
      Game: "Pokemon TCG",
      Grader: "BGS",
    },
    created_at: new Date(Date.now() - 5 * 86400000).toISOString(),
    published_at: new Date(Date.now() - 4 * 86400000).toISOString(),
    scheduled_at: null,
    publish_started_at: new Date(Date.now() - 4 * 86400000).toISOString(),
    publish_attempted_at: new Date(Date.now() - 4 * 86400000).toISOString(),
    ebay_item_id: 9876543210,
    ebay_error: null,
    identified_by: "manual",
    autopilot_metadata: null,
  },
];

// Mock photos keyed by listing ID
export const DEV_PHOTOS: Record<string, { id: string; file_url: string; ebay_url: string | null; position: number }[]> = {
  "dev-listing-1": [
    { id: "photo-1a", file_url: "https://placehold.co/400x560/1a1a2e/ffffff?text=Charizard+Front", ebay_url: null, position: 0 },
    { id: "photo-1b", file_url: "https://placehold.co/400x560/1a1a2e/ffffff?text=Charizard+Back", ebay_url: null, position: 1 },
  ],
  "dev-listing-2": [
    { id: "photo-2a", file_url: "https://placehold.co/400x560/1a1a2e/ffffff?text=Blastoise+Front", ebay_url: null, position: 0 },
  ],
  "dev-listing-3": [],
  "dev-listing-4": [
    { id: "photo-4a", file_url: "https://placehold.co/400x560/1a1a2e/ffffff?text=Mewtwo+Front", ebay_url: null, position: 0 },
  ],
  "dev-listing-5": [
    { id: "photo-5a", file_url: "https://placehold.co/400x560/2e1a1a/ffffff?text=Charizard+PSA+10+Front", ebay_url: null, position: 0 },
    { id: "photo-5b", file_url: "https://placehold.co/400x560/2e1a1a/ffffff?text=Charizard+PSA+10+Back", ebay_url: null, position: 1 },
    { id: "photo-5c", file_url: "https://placehold.co/400x560/2e1a1a/ffffff?text=PSA+Label", ebay_url: null, position: 2 },
  ],
  "dev-listing-6": [
    { id: "photo-6a", file_url: "https://placehold.co/400x560/1a2e1a/ffffff?text=Pikachu+BGS+Front", ebay_url: null, position: 0 },
    { id: "photo-6b", file_url: "https://placehold.co/400x560/1a2e1a/ffffff?text=BGS+Label", ebay_url: null, position: 1 },
  ],
};

export const DEV_EBAY_PUBLISH_SETTINGS: EbayPublishSettingsResponse = {
  linked: true,
  marketplace_id: "EBAY_CA",
  settings: {
    user_id: DEV_USER.id,
    marketplace_id: "EBAY_CA",
    location: "Vancouver, BC",
    postal_code: "V5V 1A1",
    fulfillment_policy_id: "ship-standard",
    fulfillment_policy_name: "Standard tracked shipping",
    payment_policy_id: "pay-default",
    payment_policy_name: "Managed Payments",
    return_policy_id: "",
    return_policy_name: null,
    shipping_service: "CA_PostExpeditedParcel",
    shipping_cost: 2.5,
    handling_time_days: 2,
    returns_accepted: true,
    return_period_days: 30,
    return_shipping_cost_payer: "Buyer",
    last_synced_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  available_policies: {
    fulfillment: [
      { id: "ship-standard", name: "Standard tracked shipping", marketplace_id: "EBAY_CA" },
    ],
    payment: [
      { id: "pay-default", name: "Managed Payments", marketplace_id: "EBAY_CA" },
    ],
    return: [
      { id: "returns-30", name: "30 day returns", marketplace_id: "EBAY_CA" },
    ],
  },
  policy_support: {
    available: true,
    message: null,
  },
  publish_strategy: "snapcard_defaults",
  readiness: {
    ready: true,
    missing: [],
  },
};
