import { supabase } from "../../lib/supabase.js";
import {
  getCategoryAspectMetadata,
  getConditionMetadata,
  getListingTypeMetadata,
  getReturnPolicyMetadata,
  normalizeForLookup,
  type EbayAspectMetadata,
  type EbayConditionDescriptor,
  type EbayItemConditionMetadata,
} from "./metadata.js";
import {
  CANADA_BETA_MARKETPLACE_ID,
  getTradingCardCategoryId,
  isCanadaBetaMarketplace,
} from "./config.js";
import {
  getEbayPublishSettingsState,
  getSellerPublishStrategy,
  type EbaySellerSettings,
} from "./sellerSettings.js";

export interface PublishMissing {
  code: string;
  message: string;
  scope: "seller" | "listing";
}

export interface PublishAspectField {
  name: string;
  required: boolean;
  mode: "select" | "text";
  multiple: boolean;
  values: string[];
  value: string | string[] | null;
  description: string | null;
}

export interface PublishReadinessResult {
  ready: boolean;
  missing: PublishMissing[];
  warnings: string[];
  resolved_item_specifics: Record<string, string[]>;
  unresolved_required_aspects: PublishAspectField[];
  allowed_listing_types: Array<"auction" | "fixed_price">;
  allowed_auction_durations: number[];
  current_listing_type: "auction" | "fixed_price";
  current_duration: number;
  display_duration: string;
}

export interface TradingConditionDescriptorInput {
  Name: string;
  Value?: string[];
  AdditionalInfo?: string;
}

export interface PreparedPublishData {
  listingId: string;
  marketplaceId: string;
  categoryId: string;
  title: string;
  description: string;
  price_cad: number;
  listing_type: "auction" | "fixed_price";
  listing_duration: string;
  photo_urls: string[];
  condition_id: number;
  item_specifics: Array<{
    Name: string;
    Value: string[];
  }>;
  seller_profiles?: {
    SellerShippingProfile: { ShippingProfileID: string };
    SellerReturnProfile: { ReturnProfileID: string };
    SellerPaymentProfile: { PaymentProfileID: string };
  };
  manual_shipping?: {
    shipping_service: string;
    shipping_cost: number;
    handling_time_days: number;
  };
  manual_return_policy?: {
    returns_accepted: boolean;
    return_period_days?: number;
    return_shipping_cost_payer?: "Buyer" | "Seller";
  };
  location?: string;
  postal_code?: string;
  condition_descriptors: TradingConditionDescriptorInput[];
}

interface ListingRow {
  id: string;
  user_id: string;
  title: string | null;
  description: string | null;
  price_cad: number | null;
  condition: string | null;
  card_name: string;
  set_name: string | null;
  card_number: string | null;
  rarity: string | null;
  language: string;
  card_game: string | null;
  card_type: "raw" | "graded" | null;
  grading_company: string | null;
  grade: string | null;
  cert_number: string | null;
  marketplace_id: string | null;
  listing_type: "auction" | "fixed_price";
  duration: number;
  ebay_aspects: Record<string, unknown> | null;
}

interface PhotoRow {
  file_url: string | null;
  ebay_url: string | null;
}

const MANUFACTURER_DEFAULT = "Nintendo";
const CANADA_BETA_ONLY_MESSAGE =
  "SnapCard beta publishing currently supports eBay Canada listings only. Create a new Canada listing to publish this card.";

function formatDuration(
  listingType: "auction" | "fixed_price",
  duration: number,
): string {
  return listingType === "fixed_price"
    ? "Good 'Til Cancelled"
    : `${duration} days`;
}

function normalizeAspectValueMap(
  ebayAspects: Record<string, unknown> | null,
): Record<string, string[]> {
  const normalized: Record<string, string[]> = {};

  for (const [name, value] of Object.entries(ebayAspects ?? {})) {
    if (typeof value === "string" && value.trim()) {
      normalized[name] = [value.trim()];
      continue;
    }

    if (Array.isArray(value)) {
      const values = value
        .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
        .filter(Boolean);
      if (values.length > 0) {
        normalized[name] = values;
      }
    }
  }

  return normalized;
}

function coerceAllowedValue(
  candidate: string,
  allowedValues: string[],
): string | null {
  if (allowedValues.length === 0) {
    return candidate.trim();
  }

  const normalizedCandidate = normalizeForLookup(candidate);
  for (const allowedValue of allowedValues) {
    if (normalizeForLookup(allowedValue) === normalizedCandidate) {
      return allowedValue;
    }
  }

  for (const allowedValue of allowedValues) {
    const normalizedAllowed = normalizeForLookup(allowedValue);
    if (
      normalizedAllowed.includes(normalizedCandidate) ||
      normalizedCandidate.includes(normalizedAllowed)
    ) {
      return allowedValue;
    }
  }

  return null;
}

function buildDerivedAspectCandidates(
  listing: ListingRow,
): Record<string, string[]> {
  const candidates: Record<string, string[]> = {};

  if (listing.card_game === "pokemon") {
    candidates.game = ["Pokemon TCG", "Pokemon Trading Card Game"];
    candidates.manufacturer = [MANUFACTURER_DEFAULT];
  }

  if (listing.set_name) candidates.set = [listing.set_name];
  if (listing.card_name) candidates["card name"] = [listing.card_name];
  if (listing.card_number) candidates["card number"] = [listing.card_number];
  if (listing.rarity) candidates.rarity = [listing.rarity];
  if (listing.language) candidates.language = [listing.language];
  if (listing.card_type === "graded" && listing.cert_number) {
    candidates["certification number"] = [listing.cert_number];
    candidates["cert number"] = [listing.cert_number];
    candidates["certificate number"] = [listing.cert_number];
    candidates["serial number"] = [listing.cert_number];
    candidates["professional sports authenticator cert number"] = [
      listing.cert_number,
    ];
  }

  return candidates;
}

function resolveAspectValues(
  aspect: EbayAspectMetadata,
  storedAspects: Record<string, string[]>,
  derivedCandidates: Record<string, string[]>,
): { values: string[]; currentValue: string | string[] | null } {
  const storedEntry = Object.entries(storedAspects).find(
    ([name]) => normalizeForLookup(name) === normalizeForLookup(aspect.name),
  );

  const sourceValues =
    storedEntry?.[1] ??
    derivedCandidates[normalizeForLookup(aspect.name)] ??
    [];

  if (sourceValues.length === 0) {
    return { values: [], currentValue: null };
  }

  const values = sourceValues
    .map((value) => coerceAllowedValue(value, aspect.values))
    .filter((value): value is string => Boolean(value));

  if (values.length === 0 && storedEntry?.[1]) {
    return {
      values: [],
      currentValue:
        storedEntry[1].length > 1 ? storedEntry[1] : storedEntry[1][0] ?? null,
    };
  }

  return {
    values,
    currentValue: values.length > 1 ? values : values[0] ?? null,
  };
}

function conditionCandidatesForRaw(condition: string): string[] {
  switch (condition.toUpperCase()) {
    case "NM":
      return ["Near Mint or Better", "Near Mint"];
    case "LP":
      return ["Lightly Played (Excellent)", "Lightly Played", "Light Play", "Excellent"];
    case "MP":
      return ["Moderately Played (Very Good)", "Moderately Played", "Moderate Play", "Very Good"];
    case "HP":
      return ["Heavily Played (Poor)", "Heavily Played", "Heavy Play", "Poor"];
    case "DMG":
      return ["Poor", "Damaged", "Heavily Played (Poor)"];
    default:
      return [condition];
  }
}

function staticRawConditionDescriptorValue(condition: string): string {
  switch (condition.toUpperCase()) {
    case "NM":
      return "400010"; // Near Mint or Better
    case "LP":
      return "400011"; // Excellent
    case "MP":
      return "400012"; // Very Good
    case "HP":
    case "DMG":
      return "400013"; // Poor
    default:
      return "400010";
  }
}

function findConditionByKeywords(
  conditions: EbayItemConditionMetadata[],
  keywords: string[],
  preferredId: string,
): EbayItemConditionMetadata | null {
  const byId = conditions.find((condition) => condition.conditionId === preferredId);
  if (byId) {
    return byId;
  }

  for (const condition of conditions) {
    const description = normalizeForLookup(condition.description);
    if (keywords.some((keyword) => description.includes(keyword))) {
      return condition;
    }
  }

  return null;
}

function findDescriptor(
  descriptors: EbayConditionDescriptor[],
  keywords: string[],
): EbayConditionDescriptor | null {
  for (const descriptor of descriptors) {
    const normalizedName = normalizeForLookup(descriptor.name);
    if (keywords.some((keyword) => normalizedName.includes(keyword))) {
      return descriptor;
    }
  }

  return null;
}

function findDescriptorValue(
  descriptor: EbayConditionDescriptor,
  candidates: string[],
): string | null {
  for (const candidate of candidates) {
    const match = coerceAllowedValue(
      candidate,
      descriptor.values.map((value) => value.name),
    );
    if (!match) continue;

    const descriptorValue = descriptor.values.find(
      (value) => value.name === match,
    );
    if (descriptorValue?.id) {
      return descriptorValue.id;
    }
  }

  return null;
}

function buildConditionInputs(
  listing: ListingRow,
  conditionMetadata: EbayItemConditionMetadata[],
): {
  conditionId: number | null;
  descriptors: TradingConditionDescriptorInput[];
  missing: PublishMissing[];
} {
  if (listing.card_type === "graded") {
    const gradedCondition = findConditionByKeywords(
      conditionMetadata,
      ["graded"],
      "2750",
    );

    if (!gradedCondition) {
      return {
        conditionId: null,
        descriptors: [],
        missing: [
          {
            code: "missing_graded_condition_policy",
            message: "eBay condition metadata for graded trading cards is unavailable.",
            scope: "listing",
          },
        ],
      };
    }

    const graderDescriptor = findDescriptor(gradedCondition.descriptors, [
      "grader",
    ]);
    const gradeDescriptor = findDescriptor(gradedCondition.descriptors, [
      "grade",
    ]);

    const descriptors: TradingConditionDescriptorInput[] = [];
    const missing: PublishMissing[] = [];

    if (!listing.grading_company || !graderDescriptor) {
      missing.push({
        code: "missing_grader",
        message: "Select a supported grader for this graded card.",
        scope: "listing",
      });
    } else {
      const graderValueId = findDescriptorValue(graderDescriptor, [
        listing.grading_company,
      ]);

      if (!graderValueId) {
        missing.push({
          code: "invalid_grader",
          message: "The selected grading company is not supported by eBay for this category.",
          scope: "listing",
        });
      } else {
        descriptors.push({
          Name: graderDescriptor.id,
          Value: [graderValueId],
        });
      }
    }

    if (!listing.grade || !gradeDescriptor) {
      missing.push({
        code: "missing_grade",
        message: "Enter a supported grade for this graded card.",
        scope: "listing",
      });
    } else {
      const gradeValueId = findDescriptorValue(gradeDescriptor, [listing.grade]);

      if (!gradeValueId) {
        missing.push({
          code: "invalid_grade",
          message: "The selected grade is not supported by eBay for this category.",
          scope: "listing",
        });
      } else {
        descriptors.push({
          Name: gradeDescriptor.id,
          Value: [gradeValueId],
        });
      }
    }

    return {
      conditionId: Number(gradedCondition.conditionId),
      descriptors,
      missing,
    };
  }

  const rawCondition = findConditionByKeywords(
    conditionMetadata,
    ["ungraded"],
    "4000",
  );

  if (!rawCondition) {
    return {
      conditionId: null,
      descriptors: [],
      missing: [
        {
          code: "missing_raw_condition_policy",
          message: "eBay condition metadata for ungraded trading cards is unavailable.",
          scope: "listing",
        },
      ],
    };
  }

  const cardConditionDescriptor = findDescriptor(rawCondition.descriptors, [
    "card condition",
  ]);

  if (!listing.condition) {
    return {
      conditionId: Number(rawCondition.conditionId),
      descriptors: [],
      missing: [
        {
          code: "missing_card_condition",
          message: "Select an ungraded card condition.",
          scope: "listing",
        },
      ],
    };
  }

  const descriptorId = cardConditionDescriptor?.id || "40001";
  const valueId = cardConditionDescriptor
    ? findDescriptorValue(
        cardConditionDescriptor,
        conditionCandidatesForRaw(listing.condition),
      ) ?? staticRawConditionDescriptorValue(listing.condition)
    : staticRawConditionDescriptorValue(listing.condition);

  if (!valueId) {
    return {
      conditionId: Number(rawCondition.conditionId),
      descriptors: [],
      missing: [
        {
          code: "invalid_card_condition",
          message: "The selected card condition is not supported by eBay for this category.",
          scope: "listing",
        },
      ],
    };
  }

  return {
    conditionId: Number(rawCondition.conditionId),
    descriptors: [
      {
        Name: descriptorId,
        Value: [valueId],
      },
    ],
    missing: [],
  };
}

function buildSellerProfileContainer(settings: EbaySellerSettings) {
  return {
    SellerShippingProfile: {
      ShippingProfileID: settings.fulfillment_policy_id ?? "",
    },
    SellerReturnProfile: {
      ReturnProfileID: settings.return_policy_id ?? "",
    },
    SellerPaymentProfile: {
      PaymentProfileID: settings.payment_policy_id ?? "",
    },
  };
}

function buildManualShippingDefaults(settings: EbaySellerSettings) {
  if (
    !settings.shipping_service ||
    settings.shipping_cost == null ||
    settings.handling_time_days == null
  ) {
    return null;
  }

  return {
    shipping_service: settings.shipping_service,
    shipping_cost: settings.shipping_cost,
    handling_time_days: settings.handling_time_days,
  };
}

function buildManualReturnPolicy(settings: EbaySellerSettings) {
  if (settings.returns_accepted == null) {
    return null;
  }

  if (!settings.returns_accepted) {
    return {
      returns_accepted: false,
    };
  }

  if (
    settings.return_period_days == null ||
    !settings.return_shipping_cost_payer
  ) {
    return null;
  }

  return {
    returns_accepted: true,
    return_period_days: settings.return_period_days,
    return_shipping_cost_payer: settings.return_shipping_cost_payer,
  };
}

async function loadListing(
  listingId: string,
  userId: string,
): Promise<ListingRow> {
  const { data, error } = await supabase
    .from("listings")
    .select("*")
    .eq("id", listingId)
    .eq("user_id", userId)
    .single();

  if (error || !data) {
    throw new Error("Listing not found.");
  }

  return data as ListingRow;
}

async function loadPhotos(listingId: string): Promise<PhotoRow[]> {
  const { data, error } = await supabase
    .from("photos")
    .select("file_url, ebay_url")
    .eq("listing_id", listingId)
    .order("position", { ascending: true });

  if (error) {
    throw new Error(`Failed to load listing photos: ${error.message}`);
  }

  return (data as PhotoRow[] | null) ?? [];
}

async function prepareListingContext(
  listingId: string,
  userId: string,
  photoUrlsOverride?: string[],
) {
  const listing = await loadListing(listingId, userId);
  const photoUrls =
    photoUrlsOverride ??
    (await loadPhotos(listingId))
      .map((photo) => photo.ebay_url ?? photo.file_url)
      .filter((url): url is string => Boolean(url));

  const marketplaceId = listing.marketplace_id ?? CANADA_BETA_MARKETPLACE_ID;
  const settingsState = await getEbayPublishSettingsState(userId, marketplaceId);
  const categoryId = getTradingCardCategoryId();

  const [aspects, listingTypes, returnPolicy, conditionMetadata] =
    await Promise.all([
      getCategoryAspectMetadata(marketplaceId, categoryId),
      getListingTypeMetadata(marketplaceId, categoryId),
      getReturnPolicyMetadata(marketplaceId, categoryId),
      getConditionMetadata(marketplaceId, categoryId),
    ]);

  return {
    listing,
    photoUrls,
    settingsState,
    marketplaceId,
    categoryId,
    aspects,
    listingTypes,
    returnPolicy,
    conditionMetadata,
  };
}

function buildUnsupportedMarketplaceReadiness(
  listing: ListingRow,
): PublishReadinessResult {
  return {
    ready: false,
    missing: [
      {
        code: "unsupported_marketplace",
        message: CANADA_BETA_ONLY_MESSAGE,
        scope: "listing",
      },
    ],
    warnings: [
      `This draft is set to ${listing.marketplace_id ?? "an unknown marketplace"}; the beta is locked to ${CANADA_BETA_MARKETPLACE_ID}.`,
    ],
    resolved_item_specifics: {},
    unresolved_required_aspects: [],
    allowed_listing_types: ["auction", "fixed_price"],
    allowed_auction_durations: [],
    current_listing_type: listing.listing_type,
    current_duration: listing.duration,
    display_duration: formatDuration(listing.listing_type, listing.duration),
  };
}

export async function getPublishReadiness(
  listingId: string,
  userId: string,
): Promise<PublishReadinessResult> {
  const betaListing = await loadListing(listingId, userId);
  if (!isCanadaBetaMarketplace(betaListing.marketplace_id)) {
    return buildUnsupportedMarketplaceReadiness(betaListing);
  }

  const {
    listing,
    photoUrls,
    settingsState,
    aspects,
    listingTypes,
    returnPolicy,
    conditionMetadata,
  } = await prepareListingContext(listingId, userId);

  const missing: PublishMissing[] = settingsState.readiness.missing.map(
    (message) => ({
      code: normalizeForLookup(message).replace(/\s+/g, "_"),
      message,
      scope: "seller" as const,
    }),
  );
  const warnings: string[] = [];

  if (!listing.title) {
    missing.push({
      code: "missing_title",
      message: "Generate or enter an eBay title before publishing.",
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

  if (!listing.price_cad || listing.price_cad <= 0) {
    missing.push({
      code: "missing_price",
      message: "Set a positive price before publishing.",
      scope: "listing",
    });
  }

  if (photoUrls.length === 0) {
    missing.push({
      code: "missing_photos",
      message: "Upload at least one card photo before publishing.",
      scope: "listing",
    });
  }

  if (
    listingTypes.allowedListingTypes.length > 0 &&
    !listingTypes.allowedListingTypes.includes(listing.listing_type)
  ) {
    missing.push({
      code: "invalid_listing_type",
      message: "Select a listing type that is supported for this eBay category.",
      scope: "listing",
    });
  }

  if (
    listing.listing_type === "auction" &&
    listingTypes.allowedAuctionDurations.length > 0 &&
    !listingTypes.allowedAuctionDurations.includes(listing.duration)
  ) {
    missing.push({
      code: "invalid_auction_duration",
      message: "Choose a valid auction duration for this category.",
      scope: "listing",
    });
  }

  const storedAspects = normalizeAspectValueMap(listing.ebay_aspects);
  const derivedCandidates = buildDerivedAspectCandidates(listing);
  const resolvedItemSpecifics: Record<string, string[]> = {};
  const unresolvedRequiredAspects: PublishAspectField[] = [];

  for (const aspect of aspects) {
    const resolution = resolveAspectValues(aspect, storedAspects, derivedCandidates);
    if (resolution.values.length > 0) {
      resolvedItemSpecifics[aspect.name] = resolution.values;
      continue;
    }

    if (aspect.required) {
      unresolvedRequiredAspects.push({
        name: aspect.name,
        required: true,
        mode: aspect.mode,
        multiple: aspect.multiple,
        values: aspect.values,
        value: resolution.currentValue,
        description: aspect.description,
      });
      missing.push({
        code: `missing_aspect_${normalizeForLookup(aspect.name).replace(/\s+/g, "_")}`,
        message: `Add the required eBay field "${aspect.name}".`,
        scope: "listing",
      });
    }
  }

  const sellerPublishStrategy = getSellerPublishStrategy(
    settingsState.settings,
    settingsState.available_policies,
  );

  if (
    returnPolicy.required &&
    sellerPublishStrategy === "incomplete" &&
    settingsState.settings?.returns_accepted == null
  ) {
    missing.push({
      code: "missing_required_return_policy",
      message:
        "Choose a return setup in eBay policies or SnapCard fallback defaults.",
      scope: "seller",
    });
  }

  const conditionInputs = buildConditionInputs(listing, conditionMetadata);
  missing.push(...conditionInputs.missing);

  return {
    ready: missing.length === 0,
    missing,
    warnings,
    resolved_item_specifics: resolvedItemSpecifics,
    unresolved_required_aspects: unresolvedRequiredAspects,
    allowed_listing_types:
      listingTypes.allowedListingTypes.length > 0
        ? listingTypes.allowedListingTypes
        : ["auction", "fixed_price"],
    allowed_auction_durations: listingTypes.allowedAuctionDurations,
    current_listing_type: listing.listing_type,
    current_duration: listing.duration,
    display_duration: formatDuration(listing.listing_type, listing.duration),
  };
}

export async function prepareListingForPublish(
  listingId: string,
  userId: string,
  photoUrlsOverride?: string[],
): Promise<PreparedPublishData> {
  const betaListing = await loadListing(listingId, userId);
  if (!isCanadaBetaMarketplace(betaListing.marketplace_id)) {
    throw new Error(CANADA_BETA_ONLY_MESSAGE);
  }

  const {
    listing,
    photoUrls,
    settingsState,
    marketplaceId,
    categoryId,
    aspects,
    listingTypes,
    conditionMetadata,
  } = await prepareListingContext(listingId, userId, photoUrlsOverride);

  const readiness = await getPublishReadiness(listingId, userId);
  if (!readiness.ready) {
    throw new Error(readiness.missing.map((entry) => entry.message).join(" "));
  }

  const settings = settingsState.settings;
  if (!settings) {
    throw new Error("eBay publish settings are missing.");
  }

  const sellerPublishStrategy = getSellerPublishStrategy(
    settings,
    settingsState.available_policies,
  );

  const storedAspects = normalizeAspectValueMap(listing.ebay_aspects);
  const derivedCandidates = buildDerivedAspectCandidates(listing);
  const resolvedItemSpecifics = Object.fromEntries(
    aspects
      .map((aspect) => [
        aspect.name,
        resolveAspectValues(aspect, storedAspects, derivedCandidates).values,
      ] as const)
      .filter((entry): entry is [string, string[]] => entry[1].length > 0),
  );

  const conditionInputs = buildConditionInputs(listing, conditionMetadata);
  if (!conditionInputs.conditionId) {
    throw new Error("eBay condition metadata could not be resolved for this listing.");
  }

  const listingDuration =
    listing.listing_type === "fixed_price"
      ? "GTC"
      : listingTypes.allowedAuctionDurations.includes(listing.duration)
        ? `Days_${listing.duration}`
        : `Days_${listingTypes.allowedAuctionDurations[0] ?? listing.duration}`;

  return {
    listingId: listing.id,
    marketplaceId,
    categoryId,
    title: listing.title ?? "",
    description: listing.description ?? "",
    price_cad: listing.price_cad ?? 0,
    listing_type: listing.listing_type,
    listing_duration: listingDuration,
    photo_urls: photoUrls,
    condition_id: conditionInputs.conditionId,
    item_specifics: Object.entries(resolvedItemSpecifics).map(([Name, Value]) => ({
      Name,
      Value,
    })),
    ...(sellerPublishStrategy === "business_policies"
      ? {
          seller_profiles: buildSellerProfileContainer(settings),
        }
      : {
          manual_shipping: buildManualShippingDefaults(settings) ?? undefined,
          manual_return_policy:
            buildManualReturnPolicy(settings) ?? undefined,
        }),
    location: settings.location ?? undefined,
    postal_code: settings.postal_code ?? undefined,
    condition_descriptors: conditionInputs.descriptors,
  };
}
