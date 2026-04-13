import { getEbayUrls } from "./config.js";

interface CacheEntry<T> {
  expiresAt: number;
  value: T;
}

interface TaxonomyAspectResponse {
  aspects?: Array<{
    localizedAspectName?: string;
    aspectConstraint?: {
      aspectRequired?: boolean;
      aspectMode?: "SELECTION_ONLY" | "FREE_TEXT";
      itemToAspectCardinality?: "SINGLE" | "MULTI";
    };
    aspectValues?: Array<{
      localizedValue?: string;
    }>;
    aspectUsage?: string;
    aspectAdvancedDataType?: string;
  }>;
}

interface DefaultCategoryTreeResponse {
  categoryTreeId?: string;
}

interface ListingTypePoliciesResponse {
  listingTypePolicies?: Array<{
    categoryId?: string;
    listingDurations?: Array<{
      listingType?: string;
      durationValues?: string[];
    }>;
  }>;
}

interface ReturnPoliciesResponse {
  returnPolicies?: {
    required?: boolean;
  };
}

interface ItemConditionPoliciesResponse {
  itemConditionPolicies?: Array<{
    categoryId?: string;
    itemConditionRequired?: boolean;
    itemConditions?: Array<{
      conditionId?: string;
      conditionDescription?: string;
      conditionDescriptors?: Array<{
        conditionDescriptorId?: string;
        conditionDescriptorName?: string;
        conditionDescriptorHelpText?: string;
        conditionDescriptorConstraint?: {
          cardinality?: "SINGLE" | "MULTI";
          mode?: "SELECTION_ONLY" | "FREE_TEXT";
          usage?: "REQUIRED";
        };
        conditionDescriptorValues?: Array<{
          conditionDescriptorValueId?: string;
          conditionDescriptorValueName?: string;
          conditionDescriptorValueConstraints?: Array<{
            applicableToConditionDescriptorId?: string;
            applicableToConditionDescriptorValueIds?: string[];
          }>;
        }>;
      }>;
    }>;
  }>;
}

export interface EbayAspectMetadata {
  name: string;
  required: boolean;
  multiple: boolean;
  mode: "select" | "text";
  values: string[];
  description: string | null;
}

export interface EbayListingTypeMetadata {
  allowedListingTypes: Array<"auction" | "fixed_price">;
  allowedAuctionDurations: number[];
}

export interface EbayReturnPolicyMetadata {
  required: boolean;
}

export interface EbayConditionDescriptorValue {
  id: string;
  name: string;
  applicableToDescriptorId: string | null;
  applicableToValueIds: string[];
}

export interface EbayConditionDescriptor {
  id: string;
  name: string;
  helpText: string | null;
  required: boolean;
  multiple: boolean;
  mode: "select" | "text";
  values: EbayConditionDescriptorValue[];
}

export interface EbayItemConditionMetadata {
  conditionId: string;
  description: string;
  descriptors: EbayConditionDescriptor[];
}

interface OAuthTokenResponse {
  access_token: string;
  expires_in: number;
}

const APP_TOKEN_TTL_BUFFER_MS = 60_000;
const METADATA_TTL_MS = 15 * 60 * 1000;

let appTokenCache: CacheEntry<string> | null = null;
const metadataCache = new Map<string, CacheEntry<unknown>>();

function getCachedValue<T>(cacheKey: string): T | null {
  const cached = metadataCache.get(cacheKey);
  if (!cached || cached.expiresAt <= Date.now()) {
    metadataCache.delete(cacheKey);
    return null;
  }

  return cached.value as T;
}

function setCachedValue<T>(cacheKey: string, value: T, ttlMs = METADATA_TTL_MS) {
  metadataCache.set(cacheKey, {
    value,
    expiresAt: Date.now() + ttlMs,
  });
}

function getMetadataFilter(categoryId: string): string {
  return `categoryIds:{${categoryId}}`;
}

function normalizeListingType(listingType: string | undefined): "auction" | "fixed_price" | null {
  if (!listingType) return null;

  const normalized = listingType.toUpperCase();
  if (normalized === "AUCTION") return "auction";
  if (normalized === "FIXED_PRICE_ITEM" || normalized === "FIXED_PRICE") {
    return "fixed_price";
  }

  return null;
}

function durationEnumToDays(value: string): number | null {
  const match = value.match(/^DAYS_(\d+)$/i);
  if (!match) return null;
  return Number(match[1]);
}

export function normalizeForLookup(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

async function getAppAccessToken(): Promise<string> {
  if (appTokenCache && appTokenCache.expiresAt > Date.now()) {
    return appTokenCache.value;
  }

  const appId = process.env.EBAY_APP_ID;
  const certId = process.env.EBAY_CERT_ID;

  if (!appId || !certId) {
    throw new Error("eBay app credentials are not configured.");
  }

  const credentials = Buffer.from(`${appId}:${certId}`).toString("base64");
  const { apiBase } = getEbayUrls();

  const response = await fetch(`${apiBase}/identity/v1/oauth2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${credentials}`,
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      scope: "https://api.ebay.com/oauth/api_scope",
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to fetch eBay app token: ${errorText}`);
  }

  const data = (await response.json()) as OAuthTokenResponse;
  appTokenCache = {
    value: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000 - APP_TOKEN_TTL_BUFFER_MS,
  };

  return data.access_token;
}

async function fetchAppJson<T>(cacheKey: string, path: string): Promise<T> {
  const cached = getCachedValue<T>(cacheKey);
  if (cached) {
    return cached;
  }

  const token = await getAppAccessToken();
  const { apiBase } = getEbayUrls();

  const response = await fetch(`${apiBase}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "Accept-Encoding": "gzip",
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`eBay metadata request failed: ${errorText}`);
  }

  const data = (await response.json()) as T;
  setCachedValue(cacheKey, data);
  return data;
}

export async function getDefaultCategoryTreeId(
  marketplaceId: string,
): Promise<string> {
  const response = await fetchAppJson<DefaultCategoryTreeResponse>(
    `default-category-tree:${marketplaceId}`,
    `/commerce/taxonomy/v1/get_default_category_tree_id?marketplace_id=${encodeURIComponent(
      marketplaceId,
    )}`,
  );

  if (!response.categoryTreeId) {
    throw new Error("eBay taxonomy did not return a default category tree.");
  }

  return response.categoryTreeId;
}

export async function getCategoryAspectMetadata(
  marketplaceId: string,
  categoryId: string,
): Promise<EbayAspectMetadata[]> {
  const categoryTreeId = await getDefaultCategoryTreeId(marketplaceId);
  const response = await fetchAppJson<TaxonomyAspectResponse>(
    `aspect-metadata:${marketplaceId}:${categoryId}`,
    `/commerce/taxonomy/v1/category_tree/${encodeURIComponent(
      categoryTreeId,
    )}/get_item_aspects_for_category?category_id=${encodeURIComponent(categoryId)}`,
  );

  return (response.aspects ?? []).map((aspect) => ({
    name: aspect.localizedAspectName ?? "",
    required: Boolean(aspect.aspectConstraint?.aspectRequired),
    multiple: aspect.aspectConstraint?.itemToAspectCardinality === "MULTI",
    mode:
      aspect.aspectConstraint?.aspectMode === "FREE_TEXT" ? "text" : "select",
    values: (aspect.aspectValues ?? [])
      .map((value) => value.localizedValue)
      .filter((value): value is string => Boolean(value)),
    description: aspect.aspectUsage ?? aspect.aspectAdvancedDataType ?? null,
  }));
}

export async function getListingTypeMetadata(
  marketplaceId: string,
  categoryId: string,
): Promise<EbayListingTypeMetadata> {
  const response = await fetchAppJson<ListingTypePoliciesResponse>(
    `listing-type-metadata:${marketplaceId}:${categoryId}`,
    `/sell/metadata/v1/marketplace/${encodeURIComponent(
      marketplaceId,
    )}/get_listing_type_policies?filter=${encodeURIComponent(
      getMetadataFilter(categoryId),
    )}`,
  );

  const policy = (response.listingTypePolicies ?? []).find(
    (entry) => entry.categoryId === categoryId,
  );

  const allowedListingTypes = new Set<"auction" | "fixed_price">();
  const allowedAuctionDurations = new Set<number>();

  for (const durationPolicy of policy?.listingDurations ?? []) {
    const listingType = normalizeListingType(durationPolicy.listingType);
    if (!listingType) continue;

    allowedListingTypes.add(listingType);

    if (listingType === "auction") {
      for (const value of durationPolicy.durationValues ?? []) {
        const days = durationEnumToDays(value);
        if (days != null) {
          allowedAuctionDurations.add(days);
        }
      }
    }
  }

  return {
    allowedListingTypes: Array.from(allowedListingTypes),
    allowedAuctionDurations: Array.from(allowedAuctionDurations).sort(
      (left, right) => left - right,
    ),
  };
}

export async function getReturnPolicyMetadata(
  marketplaceId: string,
  categoryId: string,
): Promise<EbayReturnPolicyMetadata> {
  const response = await fetchAppJson<ReturnPoliciesResponse>(
    `return-policy-metadata:${marketplaceId}:${categoryId}`,
    `/sell/metadata/v1/marketplace/${encodeURIComponent(
      marketplaceId,
    )}/get_return_policies?filter=${encodeURIComponent(getMetadataFilter(categoryId))}`,
  );

  return {
    required: Boolean(response.returnPolicies?.required),
  };
}

export async function getConditionMetadata(
  marketplaceId: string,
  categoryId: string,
): Promise<EbayItemConditionMetadata[]> {
  const response = await fetchAppJson<ItemConditionPoliciesResponse>(
    `condition-metadata:${marketplaceId}:${categoryId}`,
    `/sell/metadata/v1/marketplace/${encodeURIComponent(
      marketplaceId,
    )}/get_item_condition_policies?filter=${encodeURIComponent(
      getMetadataFilter(categoryId),
    )}`,
  );

  const policy = (response.itemConditionPolicies ?? []).find(
    (entry) => entry.categoryId === categoryId,
  );

  return (policy?.itemConditions ?? [])
    .filter((condition): condition is NonNullable<typeof condition> =>
      Boolean(condition?.conditionId),
    )
    .map((condition) => ({
      conditionId: condition.conditionId ?? "",
      description: condition.conditionDescription ?? "",
      descriptors: (condition.conditionDescriptors ?? []).map((descriptor) => ({
        id: descriptor.conditionDescriptorId ?? "",
        name: descriptor.conditionDescriptorName ?? "",
        helpText: descriptor.conditionDescriptorHelpText ?? null,
        required: descriptor.conditionDescriptorConstraint?.usage === "REQUIRED",
        multiple:
          descriptor.conditionDescriptorConstraint?.cardinality === "MULTI",
        mode:
          descriptor.conditionDescriptorConstraint?.mode === "FREE_TEXT"
            ? "text"
            : "select",
        values: (descriptor.conditionDescriptorValues ?? []).map((value) => ({
          id: value.conditionDescriptorValueId ?? "",
          name: value.conditionDescriptorValueName ?? "",
          applicableToDescriptorId:
            value.conditionDescriptorValueConstraints?.[0]
              ?.applicableToConditionDescriptorId ?? null,
          applicableToValueIds:
            value.conditionDescriptorValueConstraints?.[0]
              ?.applicableToConditionDescriptorValueIds ?? [],
        })),
      })),
    }));
}
