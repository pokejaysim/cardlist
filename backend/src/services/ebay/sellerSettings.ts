import { supabase } from "../../lib/supabase.js";
import { getEbayMarketplaceId, getEbayUrls } from "./config.js";
import { getValidEbayToken } from "./tokenManager.js";

type PolicyType = "fulfillment" | "payment" | "return";

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
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface EbayPublishSettingsState {
  linked: boolean;
  marketplace_id: string;
  settings: EbaySellerSettings | null;
  available_policies: EbayBusinessPolicyBundle;
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
  marketplace_id?: string | null;
}

function normalizePolicyId(policyId: string | number | null | undefined): string | null {
  if (policyId == null) return null;
  return String(policyId);
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
    throw new Error(`eBay seller settings request failed: ${errorText}`);
  }

  return (await response.json()) as T;
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
): Promise<EbaySellerSettings | null> {
  const { data, error } = await supabase
    .from("ebay_seller_settings")
    .select("*")
    .eq("user_id", userId)
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

function findPolicyName(
  policies: EbayBusinessPolicy[],
  policyId: string | null | undefined,
): string | null {
  if (!policyId) return null;
  return policies.find((policy) => policy.id === policyId)?.name ?? null;
}

function buildMissingMessages(
  settings: EbaySellerSettings | null,
  policies: EbayBusinessPolicyBundle,
): string[] {
  const missing: string[] = [];

  if (!settings?.location && !settings?.postal_code) {
    missing.push("Add a seller location or postal code.");
  }

  if (policies.fulfillment.length === 0) {
    missing.push("Create at least one eBay fulfillment policy.");
  } else if (!settings?.fulfillment_policy_id) {
    missing.push("Select a default fulfillment policy.");
  } else if (!findPolicyName(policies.fulfillment, settings.fulfillment_policy_id)) {
    missing.push("Re-select your fulfillment policy.");
  }

  if (policies.payment.length === 0) {
    missing.push("Create at least one eBay payment policy.");
  } else if (!settings?.payment_policy_id) {
    missing.push("Select a default payment policy.");
  } else if (!findPolicyName(policies.payment, settings.payment_policy_id)) {
    missing.push("Re-select your payment policy.");
  }

  if (policies.return.length === 0) {
    missing.push("Create at least one eBay return policy.");
  } else if (!settings?.return_policy_id) {
    missing.push("Select a default return policy.");
  } else if (!findPolicyName(policies.return, settings.return_policy_id)) {
    missing.push("Re-select your return policy.");
  }

  return missing;
}

function getEnvSellerLocationDefaults() {
  return {
    location: process.env.EBAY_LOCATION?.trim() || null,
    postal_code: process.env.EBAY_POSTAL_CODE?.trim() || null,
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

    const timestamp = new Date(0).toISOString();
    return {
      user_id: "",
      marketplace_id: marketplaceId,
      location: envDefaults.location,
      postal_code: envDefaults.postal_code,
      fulfillment_policy_id: null,
      fulfillment_policy_name: null,
      payment_policy_id: null,
      payment_policy_name: null,
      return_policy_id: null,
      return_policy_name: null,
      last_synced_at: null,
      created_at: timestamp,
      updated_at: timestamp,
    };
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
        marketplace_id: payload.marketplace_id ?? getEbayMarketplaceId(),
        ...payload,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    )
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(`Failed to save eBay publish settings: ${error?.message ?? "unknown error"}`);
  }

  return data as EbaySellerSettings;
}

function buildAutoSelectionPayload(
  settings: EbaySellerSettings | null,
  policies: EbayBusinessPolicyBundle,
  marketplaceId: string,
): Partial<SellerSettingsRow> | null {
  const current = settings ?? {
    user_id: "",
    marketplace_id: marketplaceId,
    location: null,
    postal_code: null,
    fulfillment_policy_id: null,
    fulfillment_policy_name: null,
    payment_policy_id: null,
    payment_policy_name: null,
    return_policy_id: null,
    return_policy_name: null,
    last_synced_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

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
): Promise<EbayPublishSettingsState> {
  const linked = await getLinkedAccount(userId);
  const marketplaceId = getEbayMarketplaceId();

  if (!linked) {
    return {
      linked: false,
      marketplace_id: marketplaceId,
      settings: null,
      available_policies: {
        fulfillment: [],
        payment: [],
        return: [],
      },
      readiness: {
        ready: false,
        missing: ["Connect your eBay account."],
      },
    };
  }

  let settings = applyLocationFallback(
    await getStoredSellerSettings(userId),
    marketplaceId,
  );
  const policies = await fetchSellerBusinessPolicies(
    userId,
    settings?.marketplace_id ?? marketplaceId,
  );

  const autoSelection = buildAutoSelectionPayload(
    settings,
    policies,
    settings?.marketplace_id ?? marketplaceId,
  );

  if (autoSelection) {
    settings = await upsertSellerSettings(userId, autoSelection);
  }

  const missing = buildMissingMessages(settings, policies);

  return {
    linked: true,
    marketplace_id: settings?.marketplace_id ?? marketplaceId,
    settings,
    available_policies: policies,
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
  const marketplaceId = input.marketplace_id ?? getEbayMarketplaceId();
  const policies = await fetchSellerBusinessPolicies(userId, marketplaceId);

  const fulfillmentPolicyId = normalizePolicyId(input.fulfillment_policy_id);
  const paymentPolicyId = normalizePolicyId(input.payment_policy_id);
  const returnPolicyId = normalizePolicyId(input.return_policy_id);

  if (
    fulfillmentPolicyId &&
    !policies.fulfillment.some((policy) => policy.id === fulfillmentPolicyId)
  ) {
    throw new Error("The selected fulfillment policy is no longer available on eBay.");
  }

  if (
    paymentPolicyId &&
    !policies.payment.some((policy) => policy.id === paymentPolicyId)
  ) {
    throw new Error("The selected payment policy is no longer available on eBay.");
  }

  if (
    returnPolicyId &&
    !policies.return.some((policy) => policy.id === returnPolicyId)
  ) {
    throw new Error("The selected return policy is no longer available on eBay.");
  }

  const payload: Partial<SellerSettingsRow> = {
    marketplace_id: marketplaceId,
    location: input.location?.trim() || null,
    postal_code: input.postal_code?.trim() || null,
    fulfillment_policy_id: fulfillmentPolicyId,
    fulfillment_policy_name: findPolicyName(policies.fulfillment, fulfillmentPolicyId),
    payment_policy_id: paymentPolicyId,
    payment_policy_name: findPolicyName(policies.payment, paymentPolicyId),
    return_policy_id: returnPolicyId,
    return_policy_name: findPolicyName(policies.return, returnPolicyId),
    last_synced_at: new Date().toISOString(),
  };

  await upsertSellerSettings(userId, payload);
  return getEbayPublishSettingsState(userId);
}
