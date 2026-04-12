import { XMLBuilder, XMLParser } from "fast-xml-parser";
import { getEbayUrls } from "./config.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ListingData {
  title: string;
  description: string;
  price_cad: number;
  condition: string;
  photo_urls: string[];
  listing_type: "auction" | "fixed_price";
  duration: number;
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
// Condition mapping
// ---------------------------------------------------------------------------

const CONDITION_MAP: Record<string, number> = {
  NM: 4000,
  LP: 5000,
  MP: 6000,
  HP: 7000,
  DMG: 7000,
};

// ---------------------------------------------------------------------------
// Core API call
// ---------------------------------------------------------------------------

export async function ebayTradingApi(
  callName: string,
  requestBody: Record<string, unknown>,
  token: string,
): Promise<Record<string, unknown>> {
  const envelope: Record<string, unknown> = {
    [`${callName}Request`]: {
      "@_xmlns": "urn:ebay:apis:eBLBaseComponents",
      RequesterCredentials: {
        eBayAuthToken: token,
      },
      ...requestBody,
    },
  };

  const xmlBody = `<?xml version="1.0" encoding="utf-8"?>\n${xmlBuilder.build(envelope) as string}`;

  const siteId = process.env.EBAY_SITE_ID ?? "2"; // 2 = Canada

  const { apiBase } = getEbayUrls();

  const response = await fetch(`${apiBase}/ws/api.dll`, {
    method: "POST",
    headers: {
      "Content-Type": "text/xml",
      "X-EBAY-API-SITEID": siteId,
      "X-EBAY-API-COMPATIBILITY-LEVEL": "967",
      "X-EBAY-API-CALL-NAME": callName,
      "X-EBAY-API-APP-NAME": process.env.EBAY_APP_ID ?? "",
      "X-EBAY-API-DEV-NAME": process.env.EBAY_DEV_ID ?? "",
      "X-EBAY-API-CERT-NAME": process.env.EBAY_CERT_ID ?? "",
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

function buildItemPayload(listing: ListingData): Record<string, unknown> {
  const conditionId = CONDITION_MAP[listing.condition] ?? 4000;

  return {
    Item: {
      Title: listing.title,
      Description: listing.description,
      PrimaryCategory: {
        CategoryID: "183454",
      },
      StartPrice: listing.price_cad,
      Currency: "CAD",
      Country: "CA",
      ListingType:
        listing.listing_type === "auction" ? "Chinese" : "FixedPriceItem",
      ListingDuration: `Days_${String(listing.duration)}`,
      PictureDetails: {
        PictureURL: listing.photo_urls,
      },
      ConditionID: conditionId,
      Site: "Canada",
      DispatchTimeMax: 3,
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
): Promise<{ fees: Record<string, number>; warnings: string[] }> {
  const itemPayload = buildItemPayload(listing);
  const response = await ebayTradingApi("VerifyAddItem", itemPayload, token);

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
): Promise<{ itemId: string; fees: Record<string, number> }> {
  const itemPayload = buildItemPayload(listing);
  const response = await ebayTradingApi("AddItem", itemPayload, token);

  const itemId = response["ItemID"];
  if (typeof itemId !== "string") {
    throw new Error("eBay AddItem: missing ItemID in response");
  }

  return {
    itemId,
    fees: parseFees(response),
  };
}
