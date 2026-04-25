import { supabase } from "../lib/supabase.js";
import { sanitizeDescriptionHtml } from "./descriptionTemplateRenderer.js";

export type ListingType = "auction" | "fixed_price";
export type RawCondition = "NM" | "LP" | "MP" | "HP" | "DMG";

export interface ListingPreferences {
  user_id: string;
  default_listing_type: ListingType;
  default_batch_fixed_price: boolean;
  price_rounding_enabled: boolean;
  default_raw_condition: RawCondition;
  description_template: string | null;
  description_template_html: string | null;
  seller_logo_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface ListingPreferencesInput {
  default_listing_type?: unknown;
  default_batch_fixed_price?: unknown;
  price_rounding_enabled?: unknown;
  default_raw_condition?: unknown;
  description_template?: unknown;
  description_template_html?: unknown;
  seller_logo_url?: unknown;
}

export function defaultListingPreferences(userId: string): ListingPreferences {
  const now = new Date().toISOString();
  return {
    user_id: userId,
    default_listing_type: "fixed_price",
    default_batch_fixed_price: true,
    price_rounding_enabled: true,
    default_raw_condition: "NM",
    description_template:
      "Thanks for looking. Cards are packed carefully and shipped from Canada.",
    description_template_html: null,
    seller_logo_url: null,
    created_at: now,
    updated_at: now,
  };
}

export async function getListingPreferences(
  userId: string,
): Promise<ListingPreferences> {
  const { data, error } = await supabase
    .from("listing_preferences")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load listing preferences: ${error.message}`);
  }

  if (!data) {
    return defaultListingPreferences(userId);
  }

  return normalizeListingPreferences(userId, data as Record<string, unknown>);
}

export async function saveListingPreferences(
  userId: string,
  input: ListingPreferencesInput,
): Promise<ListingPreferences> {
  const current = await getListingPreferences(userId);
  const updates = normalizeListingPreferences(userId, {
    ...current,
    ...input,
    updated_at: new Date().toISOString(),
  });

  const { data, error } = await supabase
    .from("listing_preferences")
    .upsert({
      user_id: userId,
      default_listing_type: updates.default_listing_type,
      default_batch_fixed_price: updates.default_batch_fixed_price,
      price_rounding_enabled: updates.price_rounding_enabled,
      default_raw_condition: updates.default_raw_condition,
      description_template: updates.description_template,
      description_template_html: updates.description_template_html,
      seller_logo_url: updates.seller_logo_url,
      updated_at: updates.updated_at,
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to save listing preferences: ${error.message}`);
  }

  return normalizeListingPreferences(userId, data as Record<string, unknown>);
}

function normalizeListingPreferences(
  userId: string,
  row: Record<string, unknown>,
): ListingPreferences {
  const defaults = defaultListingPreferences(userId);

  return {
    user_id: userId,
    default_listing_type:
      row.default_listing_type === "auction" ? "auction" : "fixed_price",
    default_batch_fixed_price:
      typeof row.default_batch_fixed_price === "boolean"
        ? row.default_batch_fixed_price
        : defaults.default_batch_fixed_price,
    price_rounding_enabled:
      typeof row.price_rounding_enabled === "boolean"
        ? row.price_rounding_enabled
        : defaults.price_rounding_enabled,
    default_raw_condition: normalizeRawCondition(
      row.default_raw_condition,
      defaults.default_raw_condition,
    ),
    description_template:
      typeof row.description_template === "string" &&
      row.description_template.trim()
        ? row.description_template.trim()
        : null,
    description_template_html:
      typeof row.description_template_html === "string" &&
      row.description_template_html.trim()
        ? sanitizeDescriptionHtml(row.description_template_html.trim()).trim() || null
        : null,
    seller_logo_url: normalizeSellerLogoUrl(row.seller_logo_url),
    created_at:
      typeof row.created_at === "string" ? row.created_at : defaults.created_at,
    updated_at:
      typeof row.updated_at === "string" ? row.updated_at : defaults.updated_at,
  };
}

function normalizeSellerLogoUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  try {
    const url = new URL(trimmed);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function normalizeRawCondition(
  value: unknown,
  fallback: RawCondition,
): RawCondition {
  return value === "NM" ||
    value === "LP" ||
    value === "MP" ||
    value === "HP" ||
    value === "DMG"
    ? value
    : fallback;
}
