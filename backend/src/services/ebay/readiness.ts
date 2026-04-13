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
  getEbayMarketplaceId,
  getTradingCardCategoryId,
} from "./config.js";
import {
  getEbayPublishSettingsState,
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
  seller_profiles: {
    SellerShippingProfile: { ShippingProfileID: string };
    SellerReturnProfile: { ReturnProfileID: string };
    SellerPaymentProfile: { PaymentProfileID: string };
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
  listing_type: "auction" | "fixed_price";
  duration: number;
  ebay_aspects: Record<string, unknown> | null;
}

interface PhotoRow {
  file_url: string | null;
  ebay_url: string | null;
}

const MANUFACTURER_DEFAULT = "Nintendo";

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
      return ["Lightly Played", "Light Play"];
    case "MP":
      return ["Moderately Played", "Moderate Play"];
    case "HP":
      return ["Heavily Played", "Heavy Play"];
    case "DMG":
      return ["Damaged", "Poor"];
    default:
      return [condition];
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

  if (!cardConditionDescriptor || !listing.condition) {
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

  const valueId = findDescriptorValue(
    cardConditionDescriptor,
    conditionCandidatesForRaw(listing.condition),
  );

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
        Name: cardConditionDescriptor.id,
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

  const settingsState = await getEbayPublishSettingsState(userId);
  const marketplaceId =
    settingsState.settings?.marketplace_id ?? getEbayMarketplaceId();
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

export async function getPublishReadiness(
  listingId: string,
  userId: string,
): Promise<PublishReadinessResult> {
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

  if (returnPolicy.required && !settingsState.settings?.return_policy_id) {
    missing.push({
      code: "missing_required_return_policy",
      message: "Select a default return policy for this category.",
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
    seller_profiles: buildSellerProfileContainer(settings),
    location: settings.location ?? undefined,
    postal_code: settings.postal_code ?? undefined,
    condition_descriptors: conditionInputs.descriptors,
  };
}
