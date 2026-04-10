// ── Dev Mode ──────────────────────────────────────────
// Enable via VITE_DEV_MODE=true in .env to bypass auth and use mock data.
// When unset or "false", the app connects to real Supabase + backend.

export const DEV_MODE = import.meta.env.VITE_DEV_MODE === "true";

export const DEV_USER = {
  id: "dev-user-00000000-0000-0000-0000-000000000000",
  email: "demo@snapcard.dev",
  name: "Demo User",
};

export const DEV_USAGE = {
  plan: "free" as const,
  listings_this_month: 3,
  listings_limit: 10,
  total_listings: 7,
  published_listings: 2,
  ai_identify: false,
  pricing_suggestions: false,
};

export const DEV_LISTINGS = [
  {
    id: "dev-listing-1",
    card_name: "Charizard",
    set_name: "Base Set",
    condition: "NM",
    status: "published",
    title: "Charizard 4/102 Base Set Holo Rare NM",
    price_cad: 450.0,
    created_at: new Date(Date.now() - 7 * 86400000).toISOString(),
    ebay_item_id: 1234567890,
  },
  {
    id: "dev-listing-2",
    card_name: "Dark Magician",
    set_name: "Legend of Blue Eyes",
    condition: "LP",
    status: "scheduled",
    title: "Dark Magician LOB-005 Legend of Blue Eyes Ultra Rare LP",
    price_cad: 85.0,
    created_at: new Date(Date.now() - 2 * 86400000).toISOString(),
    ebay_item_id: null,
  },
  {
    id: "dev-listing-3",
    card_name: "Mike Trout",
    set_name: "2011 Topps Update",
    condition: "NM",
    status: "draft",
    title: "Mike Trout US175 2011 Topps Update Rookie Card NM",
    price_cad: null,
    created_at: new Date(Date.now() - 86400000).toISOString(),
    ebay_item_id: null,
  },
  {
    id: "dev-listing-4",
    card_name: "Pikachu V",
    set_name: "Vivid Voltage",
    condition: "NM",
    status: "error",
    title: "Pikachu V 170/185 Vivid Voltage Full Art NM",
    price_cad: 25.0,
    created_at: new Date().toISOString(),
    ebay_item_id: null,
  },
];
