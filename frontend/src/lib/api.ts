import {
  DEV_MODE,
  DEV_LISTINGS,
  DEV_PHOTOS,
  DEV_USAGE,
  DEV_EBAY_PUBLISH_SETTINGS,
  DEV_USER,
} from "./devMode";
import { useAuthStore } from "@/store/auth";
import {
  CANADA_BETA_CURRENCY_CODE,
  CANADA_BETA_MARKETPLACE_ID,
} from "../../../shared/types";
import type { Listing, ListingBatchDetail, ListingPreference } from "../../../shared/types";

const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:3001/api";

let devListingCounter = 0;
let devBatchCounter = 0;
const DEV_BATCHES: ListingBatchDetail[] = [];
let DEV_LISTING_PREFERENCES: ListingPreference = {
  user_id: DEV_USER.id,
  default_listing_type: "fixed_price",
  default_batch_fixed_price: true,
  price_rounding_enabled: true,
  default_raw_condition: "NM",
  description_template: "Thanks for looking. Cards are packed carefully and shipped from Canada.",
  description_template_html: null,
  seller_logo_url: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

// Mock responses for dev mode so the UI is fully navigable without a backend
function devMockResponse<T>(path: string, options?: RequestInit): T | null {
  if (!DEV_MODE) return null;

  const method = options?.method ?? "GET";

  // GET /listings
  if (path === "/listings" && method === "GET") {
    return DEV_LISTINGS as unknown as T;
  }

  // POST /listings (save draft) — add to session list
  if (path === "/listings" && method === "POST") {
    const body = JSON.parse((options?.body as string) ?? "{}");
    const id = `dev-new-${++devListingCounter}`;
    const isGraded = body.card_type === "graded";
    const parts = [body.card_name];
    if (body.card_number) parts.push(body.card_number);
    if (body.set_name) parts.push(body.set_name);
    if (isGraded && body.grading_company) parts.push(body.grading_company);
    if (isGraded && body.grade) parts.push(body.grade);
    if (body.rarity) parts.push(body.rarity);
    if (!isGraded && body.condition) parts.push(body.condition);

    const newListing = {
      id,
      card_name: body.card_name ?? "Untitled",
      set_name: body.set_name ?? null,
      card_number: body.card_number ?? null,
      rarity: body.rarity ?? null,
      language: body.language ?? "English",
      condition: isGraded ? null : (body.condition ?? "NM"),
      card_game: body.card_game ?? "pokemon",
      card_type: body.card_type ?? "raw",
      grading_company: body.grading_company ?? null,
      grade: body.grade ?? null,
      status: "draft",
      title: parts.join(" ").slice(0, 80),
      description: null,
      price_cad: body.price_cad ?? null,
      marketplace_id: CANADA_BETA_MARKETPLACE_ID,
      currency_code: CANADA_BETA_CURRENCY_CODE,
      listing_type: body.listing_type ?? "auction",
      duration: body.listing_type === "fixed_price" ? 30 : 7,
      ebay_aspects: body.ebay_aspects ?? null,
      created_at: new Date().toISOString(),
      published_at: null,
      scheduled_at: null,
      publish_started_at: null,
      publish_attempted_at: null,
      ebay_item_id: null,
      ebay_error: null,
      identified_by: body.identified_by ?? "manual",
      autopilot_metadata: body.autopilot_metadata ?? null,
    };
    DEV_LISTINGS.unshift(newListing);
    DEV_PHOTOS[id] = [];
    return { id, status: "draft" } as unknown as T;
  }

  // GET /listings/:id
  const listingMatch = path.match(/^\/listings\/([\w-]+)$/);
  if (listingMatch && method === "GET") {
    const listing = DEV_LISTINGS.find((l) => l.id === listingMatch[1]);
    if (!listing) throw new Error("Listing not found");
    return listing as unknown as T;
  }

  // PUT /listings/:id
  const updateMatch = path.match(/^\/listings\/([\w-]+)$/);
  if (updateMatch && method === "PUT") {
    const listing = DEV_LISTINGS.find((l) => l.id === updateMatch[1]);
    if (listing) {
      const body = JSON.parse((options?.body as string) ?? "{}");
      Object.assign(listing, body);
    }
    return (listing ?? { ok: true }) as unknown as T;
  }

  // DELETE /listings/:id
  const deleteMatch = path.match(/^\/listings\/([\w-]+)$/);
  if (deleteMatch && method === "DELETE") {
    const idx = DEV_LISTINGS.findIndex((l) => l.id === deleteMatch[1]);
    if (idx !== -1) DEV_LISTINGS.splice(idx, 1);
    return { ok: true } as unknown as T;
  }

  // POST /listings/:id/publish
  const publishMatch = path.match(/^\/listings\/([\w-]+)\/publish$/);
  if (publishMatch && method === "POST") {
    const listing = DEV_LISTINGS.find((l) => l.id === publishMatch[1]);
    const body = JSON.parse((options?.body as string) ?? "{}") as {
      mode?: "now" | "scheduled";
      scheduled_at?: string | null;
    };
    if (listing) {
      if (body.mode === "scheduled") {
        listing.status = "scheduled";
        listing.scheduled_at = body.scheduled_at ?? new Date(Date.now() + 60 * 60 * 1000).toISOString();
        listing.publish_attempted_at = new Date().toISOString();
        listing.publish_started_at = null;
        listing.ebay_item_id = null;
        return {
          mock: true,
          status: "scheduled",
          scheduled_at: listing.scheduled_at,
        } as unknown as T;
      }

      listing.status = "published";
      listing.ebay_item_id = `MOCK-${Date.now()}`;
      listing.published_at = new Date().toISOString();
      listing.scheduled_at = null;
      listing.publish_attempted_at = listing.published_at;
      listing.publish_started_at = listing.published_at;
    }
    return { mock: true, status: "published" } as unknown as T;
  }

  // GET /listings/:id/photos
  const photosMatch = path.match(/^\/listings\/([\w-]+)\/photos$/);
  if (photosMatch && method === "GET") {
    return (DEV_PHOTOS[photosMatch[1]] ?? []) as unknown as T;
  }

  // GET /account/usage
  if (path === "/account/usage") {
    return DEV_USAGE as unknown as T;
  }

  // GET /account/ebay-status
  if (path === "/account/ebay-status") {
    return {
      linked: DEV_EBAY_PUBLISH_SETTINGS.linked,
      ebay_user_id: "TESTUSER_snapcard_seller",
    } as unknown as T;
  }

  if (path.startsWith("/account/ebay-publish-settings") && method === "GET") {
    return DEV_EBAY_PUBLISH_SETTINGS as unknown as T;
  }

  if (path === "/account/ebay-publish-settings" && method === "PUT") {
    const body = JSON.parse((options?.body as string) ?? "{}");
    const currentSettings = DEV_EBAY_PUBLISH_SETTINGS.settings ?? {
      user_id: "dev-user",
      marketplace_id: DEV_EBAY_PUBLISH_SETTINGS.marketplace_id,
      location: null,
      postal_code: null,
      fulfillment_policy_id: null,
      fulfillment_policy_name: null,
      payment_policy_id: null,
      payment_policy_name: null,
      return_policy_id: null,
      return_policy_name: null,
      shipping_service: null,
      shipping_cost: null,
      handling_time_days: null,
      returns_accepted: null,
      return_period_days: null,
      return_shipping_cost_payer: null,
      last_synced_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    DEV_EBAY_PUBLISH_SETTINGS.settings = {
      ...currentSettings,
      location: body.location ?? null,
      postal_code: body.postal_code ?? null,
      fulfillment_policy_id: body.fulfillment_policy_id ?? null,
      fulfillment_policy_name:
        DEV_EBAY_PUBLISH_SETTINGS.available_policies.fulfillment.find(
          (policy) => policy.id === body.fulfillment_policy_id,
        )?.name ?? null,
      payment_policy_id: body.payment_policy_id ?? null,
      payment_policy_name:
        DEV_EBAY_PUBLISH_SETTINGS.available_policies.payment.find(
          (policy) => policy.id === body.payment_policy_id,
        )?.name ?? null,
      return_policy_id: body.return_policy_id ?? null,
      return_policy_name:
        DEV_EBAY_PUBLISH_SETTINGS.available_policies.return.find(
          (policy) => policy.id === body.return_policy_id,
        )?.name ?? null,
      shipping_service: body.shipping_service ?? null,
      shipping_cost: body.shipping_cost ?? null,
      handling_time_days: body.handling_time_days ?? null,
      returns_accepted: body.returns_accepted ?? null,
      return_period_days: body.return_period_days ?? null,
      return_shipping_cost_payer: body.return_shipping_cost_payer ?? null,
      updated_at: new Date().toISOString(),
      last_synced_at: new Date().toISOString(),
    };
    const hasPolicies =
      Boolean(DEV_EBAY_PUBLISH_SETTINGS.settings?.fulfillment_policy_id) &&
      Boolean(DEV_EBAY_PUBLISH_SETTINGS.settings?.payment_policy_id) &&
      Boolean(DEV_EBAY_PUBLISH_SETTINGS.settings?.return_policy_id);
    const hasFallback =
      Boolean(DEV_EBAY_PUBLISH_SETTINGS.settings?.shipping_service) &&
      DEV_EBAY_PUBLISH_SETTINGS.settings?.shipping_cost != null &&
      DEV_EBAY_PUBLISH_SETTINGS.settings?.handling_time_days != null &&
      DEV_EBAY_PUBLISH_SETTINGS.settings?.returns_accepted != null &&
      (!DEV_EBAY_PUBLISH_SETTINGS.settings?.returns_accepted ||
        (DEV_EBAY_PUBLISH_SETTINGS.settings?.return_period_days != null &&
          Boolean(
            DEV_EBAY_PUBLISH_SETTINGS.settings
              ?.return_shipping_cost_payer,
          )));

    DEV_EBAY_PUBLISH_SETTINGS.publish_strategy = hasPolicies
      ? "business_policies"
      : hasFallback
        ? "snapcard_defaults"
        : "incomplete";
    DEV_EBAY_PUBLISH_SETTINGS.readiness = {
      ready:
        Boolean(
          DEV_EBAY_PUBLISH_SETTINGS.settings?.location ||
            DEV_EBAY_PUBLISH_SETTINGS.settings?.postal_code,
        ) && (hasPolicies || hasFallback),
      missing: [],
    };

    if (
      !DEV_EBAY_PUBLISH_SETTINGS.settings?.location &&
      !DEV_EBAY_PUBLISH_SETTINGS.settings?.postal_code
    ) {
      DEV_EBAY_PUBLISH_SETTINGS.readiness.missing.push(
        "Add a seller location or postal code.",
      );
    }
    if (!hasPolicies && !DEV_EBAY_PUBLISH_SETTINGS.settings?.shipping_service) {
      DEV_EBAY_PUBLISH_SETTINGS.readiness.missing.push(
        "Choose a default shipping service for SnapCard fallback.",
      );
    }
    if (
      !hasPolicies &&
      DEV_EBAY_PUBLISH_SETTINGS.settings?.shipping_cost == null
    ) {
      DEV_EBAY_PUBLISH_SETTINGS.readiness.missing.push(
        "Set a default shipping cost for SnapCard fallback.",
      );
    }
    if (
      !hasPolicies &&
      DEV_EBAY_PUBLISH_SETTINGS.settings?.handling_time_days == null
    ) {
      DEV_EBAY_PUBLISH_SETTINGS.readiness.missing.push(
        "Set a handling time for SnapCard fallback.",
      );
    }
    if (
      !hasPolicies &&
      DEV_EBAY_PUBLISH_SETTINGS.settings?.returns_accepted == null
    ) {
      DEV_EBAY_PUBLISH_SETTINGS.readiness.missing.push(
        "Choose whether you accept returns in SnapCard fallback.",
      );
    }
    if (
      !hasPolicies &&
      DEV_EBAY_PUBLISH_SETTINGS.settings?.returns_accepted === true &&
      DEV_EBAY_PUBLISH_SETTINGS.settings?.return_period_days == null
    ) {
      DEV_EBAY_PUBLISH_SETTINGS.readiness.missing.push(
        "Choose a return window for SnapCard fallback.",
      );
    }
    if (
      !hasPolicies &&
      DEV_EBAY_PUBLISH_SETTINGS.settings?.returns_accepted === true &&
      !DEV_EBAY_PUBLISH_SETTINGS.settings?.return_shipping_cost_payer
    ) {
      DEV_EBAY_PUBLISH_SETTINGS.readiness.missing.push(
        "Choose who pays return shipping in SnapCard fallback.",
      );
    }

    return DEV_EBAY_PUBLISH_SETTINGS as unknown as T;
  }

  if (path === "/account/listing-preferences" && method === "GET") {
    return DEV_LISTING_PREFERENCES as unknown as T;
  }

  if (path === "/account/listing-preferences" && method === "PUT") {
    const body = JSON.parse((options?.body as string) ?? "{}") as Partial<ListingPreference>;
    DEV_LISTING_PREFERENCES = {
      ...DEV_LISTING_PREFERENCES,
      default_listing_type:
        body.default_listing_type === "auction" ? "auction" : "fixed_price",
      default_batch_fixed_price:
        typeof body.default_batch_fixed_price === "boolean"
          ? body.default_batch_fixed_price
          : DEV_LISTING_PREFERENCES.default_batch_fixed_price,
      price_rounding_enabled:
        typeof body.price_rounding_enabled === "boolean"
          ? body.price_rounding_enabled
          : DEV_LISTING_PREFERENCES.price_rounding_enabled,
      default_raw_condition:
        body.default_raw_condition ?? DEV_LISTING_PREFERENCES.default_raw_condition,
      description_template:
        body.description_template ?? DEV_LISTING_PREFERENCES.description_template,
      description_template_html:
        body.description_template_html ?? DEV_LISTING_PREFERENCES.description_template_html,
      seller_logo_url:
        body.seller_logo_url ?? DEV_LISTING_PREFERENCES.seller_logo_url,
      updated_at: new Date().toISOString(),
    };
    return DEV_LISTING_PREFERENCES as unknown as T;
  }

  if (path === "/listing-batches" && method === "POST") {
    const body = JSON.parse((options?.body as string) ?? "{}") as {
      items?: Array<{ front_url?: string; back_url?: string | null }>;
    };
    const items = body.items ?? [];
    const batchId = `dev-batch-${++devBatchCounter}`;
    const batchItems = items.map((item, index) => {
      const listingId = `dev-autopilot-${++devListingCounter}`;
      const hasBack = Boolean(item.back_url);
      const listing: Listing = {
        id: listingId,
        user_id: DEV_USER.id,
        card_name: index % 2 === 0 ? "Charizard" : "Pikachu",
        set_name: index % 2 === 0 ? "Base Set" : "Vivid Voltage",
        card_number: index % 2 === 0 ? "4/102" : "044/185",
        rarity: index % 2 === 0 ? "Holo Rare" : "VMAX",
        language: "English",
        condition: "NM",
        card_game: "pokemon",
        card_type: "raw" as const,
        grading_company: null,
        grade: null,
        status: "draft",
        title: index % 2 === 0 ? "Charizard 4/102 Base Set Holo Rare NM" : "Pikachu VMAX 044/185 Vivid Voltage NM",
        description: "Autopilot generated draft description.",
        price_cad: index % 2 === 0 ? 89.99 : 14.5,
        marketplace_id: CANADA_BETA_MARKETPLACE_ID,
        currency_code: CANADA_BETA_CURRENCY_CODE,
        listing_type: "fixed_price" as const,
        duration: 30,
        ebay_aspects: { Game: "Pokemon TCG", Manufacturer: "Nintendo" },
        created_at: new Date().toISOString(),
        published_at: null,
        scheduled_at: null,
        publish_started_at: null,
        publish_attempted_at: null,
        ebay_item_id: null,
        ebay_error: null,
        identified_by: "ai",
        photo_urls: [item.front_url, item.back_url].filter((url): url is string => Boolean(url)),
        research_notes: null,
        autopilot_metadata: {
          identification: { confidence: hasBack ? 0.94 : 0.78 },
          pricing: { rounded_price_cad: index % 2 === 0 ? 89.99 : 14.5 },
        },
      };
      DEV_LISTINGS.unshift(listing as unknown as (typeof DEV_LISTINGS)[number]);
      DEV_PHOTOS[listingId] = [
        { id: `${listingId}-front`, file_url: item.front_url ?? "", ebay_url: null, position: 1 },
        ...(item.back_url
          ? [{ id: `${listingId}-back`, file_url: item.back_url, ebay_url: null, position: 2 }]
          : []),
      ];
      return {
        id: `${batchId}-item-${String(index + 1)}`,
        batch_id: batchId,
        listing_id: listingId,
        position: index + 1,
        front_photo_url: item.front_url ?? "",
        back_photo_url: item.back_url ?? null,
        status: hasBack ? "ready" as const : "needs_review" as const,
        confidence_score: hasBack ? 0.94 : 0.78,
        needs_review_reasons: hasBack ? [] : ["Back photo is missing.", "AI identification confidence is below 85%; review the card details."],
        error: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        listing,
      };
    });
    const batch: ListingBatchDetail = {
      id: batchId,
      user_id: DEV_USER.id,
      status: "completed",
      summary_counts: {
        total: batchItems.length,
        ready: batchItems.filter((item) => item.status === "ready").length,
        needs_review: batchItems.filter((item) => item.status === "needs_review").length,
        error: 0,
        processing: 0,
      },
      created_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      items: batchItems,
    };
    DEV_BATCHES.unshift(batch);
    return batch as unknown as T;
  }

  const batchMatch = path.match(/^\/listing-batches\/([\w-]+)$/);
  if (batchMatch && method === "GET") {
    const batch = DEV_BATCHES.find((item) => item.id === batchMatch[1]);
    if (!batch) throw new Error("Listing batch not found");
    batch.items = batch.items.map((item) => ({
      ...item,
      listing: DEV_LISTINGS.find((listing) => listing.id === item.listing_id) as typeof item.listing,
    }));
    return batch as unknown as T;
  }

  if (path === "/listings/bulk-publish" && method === "POST") {
    const body = JSON.parse((options?.body as string) ?? "{}") as {
      listing_ids?: string[];
    };
    const results = (body.listing_ids ?? []).map((listingId) => {
      const listing = DEV_LISTINGS.find((item) => item.id === listingId);
      if (!listing) {
        return { listing_id: listingId, status: "error" as const, error: "Listing not found" };
      }
      listing.status = "published";
      listing.published_at = new Date().toISOString();
      listing.ebay_item_id = `MOCK-${Date.now()}`;
      return { listing_id: listingId, status: "published" as const, ebay_item_id: listing.ebay_item_id };
    });
    return { results } as unknown as T;
  }

  const readinessMatch = path.match(/^\/listings\/([\w-]+)\/publish-readiness$/);
  if (readinessMatch && method === "GET") {
    const listing = DEV_LISTINGS.find((item) => item.id === readinessMatch[1]);
    if (!listing) throw new Error("Listing not found");

    const missing: Array<{
      code: string;
      message: string;
      scope: "seller" | "listing";
    }> = [];

    if (listing.marketplace_id !== CANADA_BETA_MARKETPLACE_ID) {
      missing.push({
        code: "unsupported_marketplace",
        message:
          "SnapCard beta publishing currently supports eBay Canada listings only. Create a new Canada listing to publish this card.",
        scope: "listing",
      });
    }

    for (const message of DEV_EBAY_PUBLISH_SETTINGS.readiness.missing) {
      missing.push({
        code: message.toLowerCase().replace(/[^a-z0-9]+/g, "_"),
        message,
        scope: "seller",
      });
    }

    if (!listing.price_cad) {
      missing.push({
        code: "missing_price",
        message: "Set a positive price before publishing.",
        scope: "listing",
      });
    }

    if (!listing.description) {
      missing.push({
        code: "missing_description",
        message: "Generate or enter an eBay description before publishing.",
        scope: "listing",
      });
    }

    const hasPhotos = (DEV_PHOTOS[listing.id] ?? []).length > 0;
    if (!hasPhotos) {
      missing.push({
        code: "missing_photos",
        message: "Upload at least one card photo before publishing.",
        scope: "listing",
      });
    }

    const aspects = listing.ebay_aspects ?? {};
    if (!("Game" in aspects)) {
      missing.push({
        code: "missing_aspect_game",
        message: 'Add the required eBay field "Game".',
        scope: "listing",
      });
    }

    return {
      ready: missing.length === 0,
      missing,
      warnings: [],
      resolved_item_specifics: {
        Manufacturer: ["Nintendo"],
        ...(listing.ebay_aspects?.Game ? { Game: [String(listing.ebay_aspects.Game)] } : {}),
      },
      unresolved_required_aspects:
        "Game" in aspects
          ? []
          : [
              {
                name: "Game",
                required: true,
                mode: "select",
                multiple: false,
                values: ["Pokemon TCG"],
                value: null,
                description: "Required by eBay for collectible card game singles.",
              },
            ],
      allowed_listing_types: ["auction", "fixed_price"],
      allowed_auction_durations: [3, 5, 7, 10],
      current_listing_type: listing.listing_type,
      current_duration: listing.duration,
      display_duration:
        listing.listing_type === "fixed_price"
          ? "Good 'Til Cancelled"
          : `${listing.duration} days`,
    } as unknown as T;
  }

  // GET /account
  if (path === "/account" && method === "GET") {
    return { id: "dev", email: "demo@snapcard.dev", name: "Demo User", plan: "free" } as unknown as T;
  }

  // GET /cards/search?q=...
  if (path.startsWith("/cards/search") && method === "GET") {
    const url = new URL(path, "http://localhost");
    const q = (url.searchParams.get("q") ?? "").toLowerCase();
    const mockCards = [
      { id: "base1-4", name: "Charizard", set_name: "Base", set_series: "Base", number: "4/102", rarity: "Holo Rare", image_small: "https://images.pokemontcg.io/base1/4.png", image_large: "https://images.pokemontcg.io/base1/4_hires.png" },
      { id: "swsh4-25", name: "Charizard VMAX", set_name: "Vivid Voltage", set_series: "Sword & Shield", number: "25/185", rarity: "VMAX", image_small: "https://images.pokemontcg.io/swsh4/25.png", image_large: "https://images.pokemontcg.io/swsh4/25_hires.png" },
      { id: "base1-2", name: "Blastoise", set_name: "Base", set_series: "Base", number: "2/102", rarity: "Holo Rare", image_small: "https://images.pokemontcg.io/base1/2.png", image_large: "https://images.pokemontcg.io/base1/2_hires.png" },
      { id: "base1-25", name: "Pikachu", set_name: "Base", set_series: "Base", number: "25/102", rarity: "Common", image_small: "https://images.pokemontcg.io/base1/25.png", image_large: "https://images.pokemontcg.io/base1/25_hires.png" },
      { id: "sv3pt5-151", name: "Mewtwo ex", set_name: "Pokemon 151", set_series: "Scarlet & Violet", number: "151/165", rarity: "Ultra Rare", image_small: "https://images.pokemontcg.io/sv3pt5/151.png", image_large: "https://images.pokemontcg.io/sv3pt5/151_hires.png" },
    ];
    const filtered = q ? mockCards.filter((c) => c.name.toLowerCase().includes(q)) : mockCards;
    return { cards: filtered, totalCount: filtered.length, page: 1, pageSize: 10 } as unknown as T;
  }

  // GET /cards/pokemon-tcg/:id
  const tcgMatch = path.match(/^\/cards\/pokemon-tcg\/([\w-]+)$/);
  if (tcgMatch && method === "GET") {
    const mockDetails: Record<string, unknown> = {
      "base1-4": { id: "base1-4", name: "Charizard", set_name: "Base", set_series: "Base", number: "4/102", rarity: "Holo Rare", image_small: "https://images.pokemontcg.io/base1/4.png", image_large: "https://images.pokemontcg.io/base1/4_hires.png", supertype: "Pokémon", subtypes: ["Stage 2"], tcgplayer_url: null, tcgplayer_prices: { variant: "holofoil", low: 120, mid: 200, high: 450, market: 250 } },
      "base1-2": { id: "base1-2", name: "Blastoise", set_name: "Base", set_series: "Base", number: "2/102", rarity: "Holo Rare", image_small: "https://images.pokemontcg.io/base1/2.png", image_large: "https://images.pokemontcg.io/base1/2_hires.png", supertype: "Pokémon", subtypes: ["Stage 2"], tcgplayer_url: null, tcgplayer_prices: { variant: "holofoil", low: 40, mid: 65, high: 120, market: 70 } },
      "base1-25": { id: "base1-25", name: "Pikachu", set_name: "Base", set_series: "Base", number: "25/102", rarity: "Common", image_small: "https://images.pokemontcg.io/base1/25.png", image_large: "https://images.pokemontcg.io/base1/25_hires.png", supertype: "Pokémon", subtypes: ["Basic"], tcgplayer_url: null, tcgplayer_prices: { variant: "normal", low: 5, mid: 10, high: 25, market: 12 } },
    };
    const detail = mockDetails[tcgMatch[1]];
    if (!detail) throw new Error("Card not found");
    return detail as unknown as T;
  }

  // POST /cards/identify (AI vision mock)
  if (path === "/cards/identify" && method === "POST") {
    return {
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
      confidence: 0.95,
    } as unknown as T;
  }

  // POST /pricing/suggest (pricing mock)
  if (path === "/pricing/suggest" && method === "POST") {
    return {
      suggested_price_cad: 250.0,
      pricechart_price: 240.0,
      ebay_avg_price: 260.0,
      ebay_comps: [],
      reasoning: "Based on recent market data (dev mode)",
    } as unknown as T;
  }

  return null;
}

export async function apiFetch<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  // In dev mode, return mock data instead of hitting the backend
  const mock = devMockResponse<T>(path, options);
  if (mock !== null) {
    return mock;
  }

  const token = localStorage.getItem("access_token");

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(token && { Authorization: `Bearer ${token}` }),
        ...options?.headers,
      },
    });
  } catch {
    throw new Error("Network error — check your connection and try again.");
  }

  if (!res.ok) {
    // Handle 401 — session expired, force logout
    if (res.status === 401) {
      localStorage.removeItem("access_token");
      useAuthStore.getState().signOut();
      window.location.href = "/login";
      throw new Error("Session expired. Please sign in again.");
    }

    const body = (await res.json().catch(() => ({}))) as {
      error?: string;
      code?: string;
    };
    throw new Error(body.error ?? `Request failed: ${res.status}`);
  }

  return res.json() as Promise<T>;
}

/**
 * Upload a file via multipart/form-data (e.g., photo upload).
 * Does NOT set Content-Type — the browser sets it with the boundary.
 */
export async function apiUpload<T>(
  path: string,
  formData: FormData,
): Promise<T> {
  if (DEV_MODE) {
    if (path === "/photos/upload") {
      return {
        url: `https://placehold.co/400x560/1f2937/ffffff?text=Uploaded+${String(Date.now())}`,
      } as unknown as T;
    }
    return { id: "dev-photo", file_url: "https://placeholder.dev/photo.jpg" } as unknown as T;
  }

  const token = localStorage.getItem("access_token");

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: {
        ...(token && { Authorization: `Bearer ${token}` }),
      },
      body: formData,
    });
  } catch {
    throw new Error("Network error — check your connection and try again.");
  }

  if (!res.ok) {
    if (res.status === 401) {
      localStorage.removeItem("access_token");
      useAuthStore.getState().signOut();
      window.location.href = "/login";
      throw new Error("Session expired. Please sign in again.");
    }

    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Upload failed: ${res.status}`);
  }

  return res.json() as Promise<T>;
}
