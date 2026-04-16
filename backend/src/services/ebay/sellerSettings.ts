import { supabase } from "../../lib/supabase.js";
import {
  getEbayMarketplaceConfig,
  getEbayMarketplaceId,
  getEbayUrls,
} from "./config.js";
import { getValidEbayToken } from "./tokenManager.js";

type PolicyType = "fulfillment" | "payment" | "return";
type ReturnShippingCostPayer = "Buyer" | "Seller";

interface PolicyResponse {
  marketplaceId?: string;
  name?: string;
  fulfillmentPolicyId?: string | number;
  paymentPolicyId?: string | number;
  returnPolicyId?: string | number;
}

interface SellerSettingsRow {
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
  return_shipping_cost_payer: ReturnShippingCostPayer | null;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface EbayBusinessPolicy {
  id: string;
  name: string;
  marketplace_id: string;
}

export interface EbayBusinessPolicyBundle {
  fulfillment: EbayBusinessPolicy[];
  payment: EbayBusinessPolicy[];
  return: EbayBusinessPolicy[];
}

export interface EbayPolicySupport {
  available: boolean;
  message: string | null;
}

export type EbayPublishStrategy =
  | "business_policies"
  | "snapcard_defaults"
  | "incomplete";

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
  return_shipping_cost_payer: ReturnShippingCostPayer | null;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface EbayPublishSettingsState {
  linked: boolean;
  marketplace_id: string;
  settings: EbaySellerSettings | null;
  available_policies: EbayBusinessPolicyBundle;
  policy_support: EbayPolicySupport;
  publish_strategy: EbayPublishStrategy;
  readiness: {
    ready: boolean;
    missing: string[];
  };
}

export interface SaveSellerSettingsInput {
  location?: string | null;
  postal_code?: string | null;
  fulfillment_policy_id?: string | null;
  payment_policy_id?: string | null;
  return_policy_id?: string | null;
  shipping_service?: string | null;
  shipping_cost?: number | null;
  handling_time_days?: number | null;
  returns_accepted?: boolean | null;
  return_period_days?: number | null;
  return_shipping_cost_payer?: ReturnShippingCostPayer | null;
  marketplace_id?: string | null;
}

const EMPTY_POLICIES: EbayBusinessPolicyBundle = {
  fulfillment: [],
  payment: [],
  return: [],
};

const BUSINESS_POLICY_UNAVAILABLE_MESSAGES = [
  "not opted into business policies",
  "not eligible for business policy",
  "\"errorid\":20403",
  "\"errorid\": 20403",
];

function normalizePolicyId(
  policyId: string | number | null | undefined,
): string | null {
  if (policyId == null) return null;
  return String(policyId);
}

function normalizeMarketplaceId(marketplaceId?: string | null): string {
  return marketplaceId ?? getEbayMarketplaceId();
}

function normalizeOptionalString(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizeOptionalNumber(
  value: number | string | null | undefined,
): number | null {
  if (value == null || value === "") {
    return null;
  }

  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return null;
  }

  return numeric;
}

function normalizeOptionalPositiveInteger(
  value: number | string | null | undefined,
): number | null {
  const numeric = normalizeOptionalNumber(value);
  if (numeric == null) {
    return null;
  }

  const rounded = Math.round(numeric);
  return rounded > 0 ? rounded : null;
}

function mapPolicies(
  responses: PolicyResponse[] | undefined,
  policyType: PolicyType,
  fallbackMarketplaceId: string,
): EbayBusinessPolicy[] {
  return (responses ?? [])
    .map((policy) => {
      const policyId =
        policyType === "fulfillment"
          ? policy.fulfillmentPolicyId
          : policyType === "payment"
            ? policy.paymentPolicyId
            : policy.returnPolicyId;

      const id = normalizePolicyId(policyId);
      if (!id || !policy.name) {
        return null;
      }

      return {
        id,
        name: policy.name,
        marketplace_id: policy.marketplaceId ?? fallbackMarketplaceId,
      };
    })
    .filter((policy): policy is EbayBusinessPolicy => policy != null);
}

async function fetchUserJson<T>(userId: string, path: string): Promise<T> {
  const token = await getValidEbayToken(userId);
  const { apiBase } = getEbayUrls();

  const response = await fetch(`${apiBase}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const errorText = await response.text();

    try {
      const errorJson = JSON.parse(errorText);
      const errorCode = errorJson?.errors?.[0]?.errorId ?? errorJson?.errorId;
      if (errorCode === 20403) {
        throw new Error(
          "Your eBay account is not opted into Business Policies yet. SnapCard can still publish by using its own saved shipping and return defaults.",
        );
      }
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes("not opted into Business Policies")
      ) {
        throw error;
      }
    }

    throw new Error(`eBay seller settings request failed: ${errorText}`);
  }

  return (await response.json()) as T;
}

function isBusinessPolicyUnavailableError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();
  return BUSINESS_POLICY_UNAVAILABLE_MESSAGES.some((entry) =>
    normalized.includes(entry),
  );
}

async function getLinkedAccount(userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("ebay_accounts")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to check eBay account status: ${error.message}`);
  }

  return Boolean(data);
}

export async function getStoredSellerSettings(
  userId: string,
  marketplaceId?: string,
): Promise<EbaySellerSettings | null> {
  const mid = normalizeMarketplaceId(marketplaceId);
  const { data, error } = await supabase
    .from("ebay_seller_settings")
    .select("*")
    .eq("user_id", userId)
    .eq("marketplace_id", mid)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load eBay publish settings: ${error.message}`);
  }

  return (data as SellerSettingsRow | null) ?? null;
}

export async function fetchSellerBusinessPolicies(
  userId: string,
  marketplaceId: string,
): Promise<EbayBusinessPolicyBundle> {
  const [fulfillment, payment, returns] = await Promise.all([
    fetchUserJson<{ fulfillmentPolicies?: PolicyResponse[] }>(
      userId,
      `/sell/account/v1/fulfillment_policy?marketplace_id=${encodeURIComponent(
        marketplaceId,
      )}`,
    ),
    fetchUserJson<{ paymentPolicies?: PolicyResponse[] }>(
      userId,
      `/sell/account/v1/payment_policy?marketplace_id=${encodeURIComponent(
        marketplaceId,
      )}`,
    ),
    fetchUserJson<{ returnPolicies?: PolicyResponse[] }>(
      userId,
      `/sell/account/v1/return_policy?marketplace_id=${encodeURIComponent(
        marketplaceId,
      )}`,
    ),
  ]);

  return {
    fulfillment: mapPolicies(
      fulfillment.fulfillmentPolicies,
      "fulfillment",
      marketplaceId,
    ),
    payment: mapPolicies(payment.paymentPolicies, "payment", marketplaceId),
    return: mapPolicies(returns.returnPolicies, "return", marketplaceId),
  };
}

async function loadBusinessPolicyAccess(
  userId: string,
  marketplaceId: string,
): Promise<{
  policies: EbayBusinessPolicyBundle;
  policySupport: EbayPolicySupport;
}> {
  try {
    return {
      policies: await fetchSellerBusinessPolicies(userId, marketplaceId),
      policySupport: {
        available: true,
        message: null,
      },
    };
  } catch (error) {
    if (!isBusinessPolicyUnavailableError(error)) {
      throw error;
    }

    return {
      policies: EMPTY_POLICIES,
      policySupport: {
        available: false,
        message:
          error instanceof Error
            ? error.message
            : "eBay Business Policies are unavailable for this account.",
      },
    };
  }
}

function findPolicyName(
  policies: EbayBusinessPolicy[],
  policyId: string | null | undefined,
): string | null {
  if (!policyId) return null;
  return policies.find((policy) => policy.id === policyId)?.name ?? null;
}

function isPolicySelectionValid(
  settings: EbaySellerSettings | null,
  policies: EbayBusinessPolicyBundle,
): boolean {
  return Boolean(
    settings?.fulfillment_policy_id &&
      findPolicyName(policies.fulfillment, settings.fulfillment_policy_id) &&
      settings.payment_policy_id &&
      findPolicyName(policies.payment, settings.payment_policy_id) &&
      settings.return_policy_id &&
      findPolicyName(policies.return, settings.return_policy_id),
  );
}

function hasManualShippingDefaults(
  settings: EbaySellerSettings | null,
): boolean {
  return Boolean(
    settings?.shipping_service &&
      settings.shipping_cost != null &&
      settings.shipping_cost >= 0 &&
      settings.handling_time_days != null &&
      settings.handling_time_days > 0,
  );
}

function hasManualReturnDefaults(settings: EbaySellerSettings | null): boolean {
  if (settings?.returns_accepted == null) {
    return false;
  }

  if (!settings.returns_accepted) {
    return true;
  }

  return Boolean(
    settings.return_period_days != null &&
      settings.return_period_days > 0 &&
      settings.return_shipping_cost_payer,
  );
}

export function getSellerPublishStrategy(
  settings: EbaySellerSettings | null,
  policies: EbayBusinessPolicyBundle,
): EbayPublishStrategy {
  if (isPolicySelectionValid(settings, policies)) {
    return "business_policies";
  }

  if (hasManualShippingDefaults(settings) && hasManualReturnDefaults(settings)) {
    return "snapcard_defaults";
  }

  return "incomplete";
}

function buildMissingMessages(
  settings: EbaySellerSettings | null,
  policies: EbayBusinessPolicyBundle,
  policySupport: EbayPolicySupport,
): string[] {
  const missing: string[] = [];
  const strategy = getSellerPublishStrategy(settings, policies);

  if (!settings?.location && !settings?.postal_code) {
    missing.push("Add a seller location or postal code.");
  }

  if (strategy !== "incomplete") {
    return missing;
  }

  if (policySupport.available) {
    missing.push(
      "Select all three eBay business policies, or save SnapCard shipping and return defaults below.",
    );
  }

  if (!settings?.shipping_service) {
    missing.push("Choose a default shipping service for SnapCard fallback.");
  }

  if (settings?.shipping_cost == null || settings.shipping_cost < 0) {
    missing.push("Set a default shipping cost for SnapCard fallback.");
  }

  if (
    settings?.handling_time_days == null ||
    settings.handling_time_days <= 0
  ) {
    missing.push("Set a handling time for SnapCard fallback.");
  }

  if (settings?.returns_accepted == null) {
    missing.push("Choose whether you accept returns in SnapCard fallback.");
  } else if (settings.returns_accepted) {
    if (
      settings.return_period_days == null ||
      settings.return_period_days <= 0
    ) {
      missing.push("Choose a return window for SnapCard fallback.");
    }

    if (!settings.return_shipping_cost_payer) {
      missing.push("Choose who pays return shipping in SnapCard fallback.");
    }
  }

  return missing;
}

function getEnvSellerLocationDefaults() {
  return {
    location: normalizeOptionalString(process.env.EBAY_LOCATION),
    postal_code: normalizeOptionalString(process.env.EBAY_POSTAL_CODE),
  };
}

function buildEmptySettings(
  marketplaceId: string,
  locationDefaults?: { location: string | null; postal_code: string | null },
): EbaySellerSettings {
  const timestamp = new Date(0).toISOString();
  return {
    user_id: "",
    marketplace_id: marketplaceId,
    location: locationDefaults?.location ?? null,
    postal_code: locationDefaults?.postal_code ?? null,
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
    created_at: timestamp,
    updated_at: timestamp,
  };
}

function applyLocationFallback(
  settings: EbaySellerSettings | null,
  marketplaceId: string,
): EbaySellerSettings | null {
  const envDefaults = getEnvSellerLocationDefaults();

  if (!settings) {
    if (!envDefaults.location && !envDefaults.postal_code) {
      return null;
    }

    return buildEmptySettings(marketplaceId, envDefaults);
  }

  if (settings.location || settings.postal_code) {
    return settings;
  }

  return {
    ...settings,
    location: envDefaults.location,
    postal_code: envDefaults.postal_code,
  };
}

async function upsertSellerSettings(
  userId: string,
  payload: Partial<SellerSettingsRow>,
): Promise<EbaySellerSettings> {
  const { data, error } = await supabase
    .from("ebay_seller_settings")
    .upsert(
      {
        user_id: userId,
        marketplace_id: normalizeMarketplaceId(payload.marketplace_id),
        ...payload,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,marketplace_id" },
    )
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(
      `Failed to save eBay publish settings: ${error?.message ?? "unknown error"}`,
    );
  }

  return data as EbaySellerSettings;
}

function buildAutoSelectionPayload(
  settings: EbaySellerSettings | null,
  policies: EbayBusinessPolicyBundle,
  marketplaceId: string,
): Partial<SellerSettingsRow> | null {
  const current = settings ?? buildEmptySettings(marketplaceId);
  const payload: Partial<SellerSettingsRow> = {
    marketplace_id: marketplaceId,
    last_synced_at: new Date().toISOString(),
  };
  let changed = false;

  if (!current.fulfillment_policy_id && policies.fulfillment.length === 1) {
    payload.fulfillment_policy_id = policies.fulfillment[0]?.id ?? null;
    payload.fulfillment_policy_name = policies.fulfillment[0]?.name ?? null;
    changed = true;
  }

  if (!current.payment_policy_id && policies.payment.length === 1) {
    payload.payment_policy_id = policies.payment[0]?.id ?? null;
    payload.payment_policy_name = policies.payment[0]?.name ?? null;
    changed = true;
  }

  if (!current.return_policy_id && policies.return.length === 1) {
    payload.return_policy_id = policies.return[0]?.id ?? null;
    payload.return_policy_name = policies.return[0]?.name ?? null;
    changed = true;
  }

  return changed ? payload : null;
}

export async function getEbayPublishSettingsState(
  userId: string,
  marketplaceId?: string,
): Promise<EbayPublishSettingsState> {
  const linked = await getLinkedAccount(userId);
  const mid = normalizeMarketplaceId(marketplaceId);

  if (!linked) {
    return {
      linked: false,
      marketplace_id: mid,
      settings: null,
      available_policies: EMPTY_POLICIES,
      policy_support: {
        available: false,
        message: null,
      },
      publish_strategy: "incomplete",
      readiness: {
        ready: false,
        missing: ["Connect your eBay account."],
      },
    };
  }

  let settings = applyLocationFallback(await getStoredSellerSettings(userId, mid), mid);
  const { policies, policySupport } = await loadBusinessPolicyAccess(
    userId,
    settings?.marketplace_id ?? mid,
  );

  if (policySupport.available) {
    const autoSelection = buildAutoSelectionPayload(
      settings,
      policies,
      settings?.marketplace_id ?? mid,
    );

    if (autoSelection) {
      settings = await upsertSellerSettings(userId, autoSelection);
    }
  }

  const publishStrategy = getSellerPublishStrategy(settings, policies);
  const missing = buildMissingMessages(settings, policies, policySupport);

  return {
    linked: true,
    marketplace_id: settings?.marketplace_id ?? mid,
    settings,
    available_policies: policies,
    policy_support: policySupport,
    publish_strategy: publishStrategy,
    readiness: {
      ready: missing.length === 0,
      missing,
    },
  };
}

export async function saveEbayPublishSettings(
  userId: string,
  input: SaveSellerSettingsInput,
): Promise<EbayPublishSettingsState> {
  const marketplaceId = normalizeMarketplaceId(input.marketplace_id);
  const { policies, policySupport } = await loadBusinessPolicyAccess(
    userId,
    marketplaceId,
  );
  const marketplaceConfig = getEbayMarketplaceConfig(marketplaceId);

  const fulfillmentPolicyId = normalizePolicyId(input.fulfillment_policy_id);
  const paymentPolicyId = normalizePolicyId(input.payment_policy_id);
  const returnPolicyId = normalizePolicyId(input.return_policy_id);

  if (!policySupport.available) {
    if (fulfillmentPolicyId || paymentPolicyId || returnPolicyId) {
      throw new Error(
        `eBay Business Policies are unavailable for ${marketplaceConfig.label}. Clear the policy fields and save SnapCard fallback defaults instead.`,
      );
    }
  } else {
    if (
      fulfillmentPolicyId &&
      !policies.fulfillment.some((policy) => policy.id === fulfillmentPolicyId)
    ) {
      throw new Error(
        "The selected fulfillment policy is no longer available on eBay.",
      );
    }

    if (
      paymentPolicyId &&
      !policies.payment.some((policy) => policy.id === paymentPolicyId)
    ) {
      throw new Error(
        "The selected payment policy is no longer available on eBay.",
      );
    }

    if (
      returnPolicyId &&
      !policies.return.some((policy) => policy.id === returnPolicyId)
    ) {
      throw new Error(
        "The selected return policy is no longer available on eBay.",
      );
    }
  }

  const returnsAccepted =
    input.returns_accepted === null || input.returns_accepted === undefined
      ? null
      : Boolean(input.returns_accepted);

  const payload: Partial<SellerSettingsRow> = {
    marketplace_id: marketplaceId,
    location: normalizeOptionalString(input.location),
    postal_code: normalizeOptionalString(input.postal_code),
    fulfillment_policy_id: fulfillmentPolicyId,
    fulfillment_policy_name: findPolicyName(policies.fulfillment, fulfillmentPolicyId),
    payment_policy_id: paymentPolicyId,
    payment_policy_name: findPolicyName(policies.payment, paymentPolicyId),
    return_policy_id: returnPolicyId,
    return_policy_name: findPolicyName(policies.return, returnPolicyId),
    shipping_service: normalizeOptionalString(input.shipping_service),
    shipping_cost: normalizeOptionalNumber(input.shipping_cost),
    handling_time_days: normalizeOptionalPositiveInteger(input.handling_time_days),
    returns_accepted: returnsAccepted,
    return_period_days: returnsAccepted
      ? normalizeOptionalPositiveInteger(input.return_period_days)
      : null,
    return_shipping_cost_payer: returnsAccepted
      ? input.return_shipping_cost_payer ?? null
      : null,
    last_synced_at: new Date().toISOString(),
  };

  await upsertSellerSettings(userId, payload);
  return getEbayPublishSettingsState(userId, marketplaceId);
}
