import { XMLBuilder, XMLParser } from "fast-xml-parser";
import { getEbayUrls, getEbayMarketplaceConfig } from "./config.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ListingData {
  categoryId: string;
  title: string;
  description: string;
  price_cad: number;
  photo_urls: string[];
  listing_type: "auction" | "fixed_price";
  listing_duration: string;
  condition_id: number;
  item_specifics?: Array<{
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
  condition_descriptors?: Array<{
    Name: string;
    Value?: string[];
    AdditionalInfo?: string;
  }>;
}

interface EbayFee {
  Name?: string;
  Fee?: number | string;
}

interface EbayError {
  SeverityCode?: string;
  ShortMessage?: string;
  LongMessage?: string;
}

// ---------------------------------------------------------------------------
// XML helpers
// ---------------------------------------------------------------------------

const xmlBuilder = new XMLBuilder({
  ignoreAttributes: false,
  processEntities: false,
  suppressBooleanAttributes: false,
  cdataPropName: "__cdata",
});

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  processEntities: false,
  isArray: (tagName: string) => {
    // Force arrays for tags that can appear multiple times
    return tagName === "Fee" || tagName === "Errors" || tagName === "PictureURL";
  },
});

// ---------------------------------------------------------------------------
// Core API call
// ---------------------------------------------------------------------------

export async function ebayTradingApi(
  callName: string,
  requestBody: Record<string, unknown>,
  token: string,
  marketplaceId?: string,
): Promise<Record<string, unknown>> {
  const envelope: Record<string, unknown> = {
    [`${callName}Request`]: {
      "@_xmlns": "urn:ebay:apis:eBLBaseComponents",
      ...requestBody,
    },
  };

  const xmlBody = `<?xml version="1.0" encoding="utf-8"?>\n${xmlBuilder.build(envelope) as string}`;

  const mc = getEbayMarketplaceConfig(marketplaceId);
  const siteId = mc.siteId;
  const { apiBase } = getEbayUrls();

  const response = await fetch(`${apiBase}/ws/api.dll`, {
    method: "POST",
    headers: {
      "Content-Type": "text/xml",
      "X-EBAY-API-SITEID": siteId,
      "X-EBAY-API-COMPATIBILITY-LEVEL": "967",
      "X-EBAY-API-CALL-NAME": callName,
      "X-EBAY-API-IAF-TOKEN": token,
    },
    body: xmlBody,
  });

  if (!response.ok) {
    throw new Error(
      `eBay API HTTP error: ${String(response.status)} ${response.statusText}`,
    );
  }

  const responseText = await response.text();
  const parsed = xmlParser.parse(responseText) as Record<string, unknown>;

  // The response is nested under `{callName}Response`
  const responseKey = `${callName}Response`;
  const body = (parsed[responseKey] ?? parsed) as Record<string, unknown>;

  // Check for errors with SeverityCode = Error
  if (body["Errors"]) {
    const errors = body["Errors"] as EbayError[];
    const hardErrors = errors.filter((e) => e.SeverityCode === "Error");
    if (hardErrors.length > 0) {
      const messages = hardErrors.map(
        (e) => e.LongMessage ?? e.ShortMessage ?? "Unknown eBay error",
      );
      throw new Error(`eBay API error: ${messages.join("; ")}`);
    }
  }

  return body;
}

export async function getEbayUserId(token: string): Promise<string> {
  const response = await ebayTradingApi(
    "GetUser",
    {
      DetailLevel: "ReturnAll",
    },
    token,
  );

  const user = response["User"];
  if (!user || typeof user !== "object") {
    throw new Error("eBay GetUser: missing User in response");
  }

  const userId = (user as Record<string, unknown>)["UserID"];
  if (typeof userId !== "string") {
    throw new Error("eBay GetUser: missing UserID in response");
  }

  return userId;
}

// ---------------------------------------------------------------------------
// Upload picture
// ---------------------------------------------------------------------------

export async function uploadSiteHostedPictures(
  imageUrl: string,
  token: string,
): Promise<string> {
  const response = await ebayTradingApi(
    "UploadSiteHostedPictures",
    { ExternalPictureURL: imageUrl },
    token,
  );

  const details = response["SiteHostedPictureDetails"] as
    | Record<string, unknown>
    | undefined;
  if (!details) {
    throw new Error(
      "eBay UploadSiteHostedPictures: missing SiteHostedPictureDetails in response",
    );
  }

  const fullUrl = details["FullURL"];
  if (typeof fullUrl !== "string") {
    throw new Error(
      "eBay UploadSiteHostedPictures: missing FullURL in response",
    );
  }

  return fullUrl;
}

// ---------------------------------------------------------------------------
// Build Item payload from ListingData
// ---------------------------------------------------------------------------

function buildItemPayload(listing: ListingData, marketplaceId?: string): Record<string, unknown> {
  if (!listing.location && !listing.postal_code) {
    throw new Error(
      "eBay seller location is missing. Save a location or postal code in eBay publish settings.",
    );
  }

  const mc = getEbayMarketplaceConfig(marketplaceId);
  const dispatchTimeMax =
    listing.manual_shipping?.handling_time_days != null
      ? listing.manual_shipping.handling_time_days
      : 3;

  return {
    Item: {
      Title: listing.title,
      Description: { __cdata: listing.description },
      PrimaryCategory: {
        CategoryID: listing.categoryId,
      },
      StartPrice: listing.price_cad,
      Currency: mc.currency,
      Country: mc.country,
      ...(listing.location ? { Location: listing.location } : {}),
      ...(listing.postal_code ? { PostalCode: listing.postal_code } : {}),
      ListingType:
        listing.listing_type === "auction" ? "Chinese" : "FixedPriceItem",
      ListingDuration: listing.listing_duration,
      PictureDetails: {
        PictureURL: listing.photo_urls,
      },
      ConditionID: listing.condition_id,
      ...(listing.condition_descriptors &&
      listing.condition_descriptors.length > 0
        ? {
            ConditionDescriptors: {
              ConditionDescriptor: listing.condition_descriptors,
            },
          }
        : {}),
      ...(listing.item_specifics && listing.item_specifics.length > 0
        ? {
            ItemSpecifics: {
              NameValueList: listing.item_specifics,
            },
          }
        : {}),
      ...(listing.seller_profiles
        ? {
            SellerProfiles: listing.seller_profiles,
          }
        : listing.manual_shipping
          ? {
              ShippingDetails: {
                ShippingType: "Flat",
                ShippingServiceOptions: {
                  ShippingServicePriority: 1,
                  ShippingService: listing.manual_shipping.shipping_service,
                  ShippingServiceCost: listing.manual_shipping.shipping_cost,
                  ...(listing.manual_shipping.shipping_cost === 0
                    ? { FreeShipping: true }
                    : {}),
                },
              },
            }
          : {}),
      ...(listing.manual_return_policy
        ? {
            ReturnPolicy: listing.manual_return_policy.returns_accepted
              ? {
                  ReturnsAcceptedOption: "ReturnsAccepted",
                  ReturnsWithinOption: `Days_${String(
                    listing.manual_return_policy.return_period_days ?? 30,
                  )}`,
                  ShippingCostPaidByOption:
                    listing.manual_return_policy.return_shipping_cost_payer ??
                    "Buyer",
                }
              : {
                  ReturnsAcceptedOption: "ReturnsNotAccepted",
                },
          }
        : {}),
      Site: mc.country === "CA" ? "Canada" : "US",
      DispatchTimeMax: dispatchTimeMax,
    },
  };
}

// ---------------------------------------------------------------------------
// Parse fees from eBay response
// ---------------------------------------------------------------------------

function parseFees(response: Record<string, unknown>): Record<string, number> {
  const fees: Record<string, number> = {};

  const feesObj = response["Fees"] as Record<string, unknown> | undefined;
  if (!feesObj) return fees;

  const feeArr = feesObj["Fee"] as EbayFee[] | undefined;
  if (!Array.isArray(feeArr)) return fees;

  for (const fee of feeArr) {
    if (fee.Name && fee.Fee != null) {
      fees[fee.Name] = typeof fee.Fee === "number" ? fee.Fee : Number(fee.Fee);
    }
  }

  return fees;
}

// ---------------------------------------------------------------------------
// Parse warnings from eBay response
// ---------------------------------------------------------------------------

function parseWarnings(response: Record<string, unknown>): string[] {
  const warnings: string[] = [];

  if (!response["Errors"]) return warnings;

  const errors = response["Errors"] as EbayError[];
  for (const err of errors) {
    if (err.SeverityCode === "Warning") {
      warnings.push(err.LongMessage ?? err.ShortMessage ?? "Unknown warning");
    }
  }

  return warnings;
}

// ---------------------------------------------------------------------------
// VerifyAddItem (dry-run)
// ---------------------------------------------------------------------------

export async function verifyAddItem(
  listing: ListingData,
  token: string,
  marketplaceId?: string,
): Promise<{ fees: Record<string, number>; warnings: string[] }> {
  const itemPayload = buildItemPayload(listing, marketplaceId);
  const response = await ebayTradingApi("VerifyAddItem", itemPayload, token, marketplaceId);

  return {
    fees: parseFees(response),
    warnings: parseWarnings(response),
  };
}

// ---------------------------------------------------------------------------
// AddItem (actual publish)
// ---------------------------------------------------------------------------

export async function addItem(
  listing: ListingData,
  token: string,
  marketplaceId?: string,
): Promise<{ itemId: string; fees: Record<string, number> }> {
  const itemPayload = buildItemPayload(listing, marketplaceId);
  const response = await ebayTradingApi("AddItem", itemPayload, token, marketplaceId);

  const itemId = response["ItemID"];
  if (typeof itemId !== "string" && typeof itemId !== "number") {
    throw new Error("eBay AddItem: missing ItemID in response");
  }

  return {
    itemId: String(itemId),
    fees: parseFees(response),
  };
}
