import { supabase } from "../lib/supabase.js";
import {
  type DescriptionInput,
  generateDescription,
} from "./descriptionGenerator.js";
import {
  escapeHtml,
  renderDescriptionTemplate,
  type DescriptionTemplateInput,
} from "./descriptionTemplateRenderer.js";
import { CANADA_BETA_MARKETPLACE_ID } from "./ebay/config.js";
import { getListingPreferences } from "./listingPreferences.js";

interface BuildListingDescriptionInput extends DescriptionInput {
  title?: string | null;
  price_cad?: number | string | null;
  year?: string | number | null;
}

interface SellerDescriptionContext {
  seller_location: string | null;
  shipping_summary: string | null;
  returns_summary: string | null;
}

interface SellerSettingsRow {
  location: string | null;
  postal_code: string | null;
  shipping_service: string | null;
  shipping_cost: number | null;
  handling_time_days: number | null;
  returns_accepted: boolean | null;
  return_period_days: number | null;
  return_shipping_cost_payer: string | null;
}

const SHIPPING_SERVICE_LABELS: Record<string, string> = {
  CA_PostLettermail: "Canada Post Lettermail",
  CA_PostRegularParcel: "Canada Post Regular Parcel",
  CA_PostExpeditedParcel: "Canada Post Expedited Parcel",
};

export async function buildListingDescription(
  userId: string,
  input: BuildListingDescriptionInput,
): Promise<string> {
  const [preferences, sellerContext] = await Promise.all([
    getListingPreferences(userId),
    getSellerDescriptionContext(userId),
  ]);

  if (preferences.description_template_html) {
    return renderDescriptionTemplate(preferences.description_template_html, {
      ...input,
      ...sellerContext,
      seller_logo_url: preferences.seller_logo_url,
    } satisfies DescriptionTemplateInput);
  }

  const baseDescription = generateDescription(input);

  if (!preferences.description_template) {
    return baseDescription;
  }

  return `${baseDescription}
<div style="font-family: Arial, sans-serif; max-width: 800px; margin: 12px auto 0; padding: 0 16px 16px;">
  <div style="background: #fff7ed; border-radius: 8px; padding: 16px;">
    <h3 style="margin: 0 0 8px; color: #333;">Seller Notes</h3>
    <p style="margin: 0; color: #555;">${escapeHtml(preferences.description_template)}</p>
  </div>
</div>`;
}

async function getSellerDescriptionContext(
  userId: string,
): Promise<SellerDescriptionContext> {
  const { data, error } = await supabase
    .from("ebay_seller_settings")
    .select(
      "location, postal_code, shipping_service, shipping_cost, handling_time_days, returns_accepted, return_period_days, return_shipping_cost_payer",
    )
    .eq("user_id", userId)
    .eq("marketplace_id", CANADA_BETA_MARKETPLACE_ID)
    .maybeSingle();

  if (error || !data) {
    return {
      seller_location: null,
      shipping_summary: "Ships from Canada. Combined shipping available.",
      returns_summary: "Please review return details on the eBay listing.",
    };
  }

  const settings = data as SellerSettingsRow;
  return {
    seller_location: formatSellerLocation(settings),
    shipping_summary: formatShippingSummary(settings),
    returns_summary: formatReturnsSummary(settings),
  };
}

function formatSellerLocation(settings: SellerSettingsRow): string | null {
  const parts = [settings.location, settings.postal_code]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));
  return parts.length ? parts.join(" ") : null;
}

function formatShippingSummary(settings: SellerSettingsRow): string {
  const service = settings.shipping_service
    ? SHIPPING_SERVICE_LABELS[settings.shipping_service] ?? settings.shipping_service
    : "Canada Post";
  const handling =
    typeof settings.handling_time_days === "number" &&
    Number.isFinite(settings.handling_time_days)
      ? `${settings.handling_time_days} business day${settings.handling_time_days === 1 ? "" : "s"}`
      : "a few business days";
  const cost =
    typeof settings.shipping_cost === "number" && Number.isFinite(settings.shipping_cost)
      ? ` Shipping cost: $${settings.shipping_cost.toFixed(2)} CAD.`
      : "";

  return `Ships from Canada via ${service} within ${handling}.${cost}`;
}

function formatReturnsSummary(settings: SellerSettingsRow): string {
  if (settings.returns_accepted === false) {
    return "Returns are not accepted unless required by eBay buyer protection.";
  }

  if (settings.returns_accepted === true) {
    const period = settings.return_period_days ?? 30;
    const payer = settings.return_shipping_cost_payer ?? "Buyer";
    return `${period}-day returns accepted. ${payer} pays return shipping.`;
  }

  return "Please review return details on the eBay listing.";
}
