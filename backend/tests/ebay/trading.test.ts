import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ebayTradingApi,
  getEbayUserId,
  verifyAddItem,
} from "../../src/services/ebay/trading.js";
import type { ListingData } from "../../src/services/ebay/trading.js";

function buildListingData(
  overrides: Partial<ListingData> = {},
): ListingData {
  return {
    categoryId: "183454",
    title: "Test listing",
    description: "Card description",
    price_cad: 10,
    photo_urls: ["https://example.com/card.jpg"],
    listing_type: "auction",
    listing_duration: "Days_7",
    condition_id: 4000,
    postal_code: "V5V1A1",
    location: undefined,
    item_specifics: [
      {
        Name: "Game",
        Value: ["Pokemon TCG"],
      },
    ],
    seller_profiles: {
      SellerShippingProfile: { ShippingProfileID: "ship-1" },
      SellerReturnProfile: { ReturnProfileID: "return-1" },
      SellerPaymentProfile: { PaymentProfileID: "payment-1" },
    },
    condition_descriptors: [
      {
        Name: "27501",
        Value: ["40001"],
      },
    ],
    ...overrides,
  };
}

describe("ebayTradingApi OAuth transport", () => {
  const originalEnvironment = process.env.EBAY_ENVIRONMENT;
  const originalSiteId = process.env.EBAY_SITE_ID;
  const originalLocation = process.env.EBAY_LOCATION;
  const originalPostalCode = process.env.EBAY_POSTAL_CODE;

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();

    if (originalEnvironment === undefined) {
      delete process.env.EBAY_ENVIRONMENT;
    } else {
      process.env.EBAY_ENVIRONMENT = originalEnvironment;
    }

    if (originalSiteId === undefined) {
      delete process.env.EBAY_SITE_ID;
    } else {
      process.env.EBAY_SITE_ID = originalSiteId;
    }

    if (originalLocation === undefined) {
      delete process.env.EBAY_LOCATION;
    } else {
      process.env.EBAY_LOCATION = originalLocation;
    }

    if (originalPostalCode === undefined) {
      delete process.env.EBAY_POSTAL_CODE;
    } else {
      process.env.EBAY_POSTAL_CODE = originalPostalCode;
    }
  });

  it("sends the OAuth token in X-EBAY-API-IAF-TOKEN and omits RequesterCredentials", async () => {
    process.env.EBAY_ENVIRONMENT = "sandbox";
    process.env.EBAY_SITE_ID = "2";

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        `<?xml version="1.0" encoding="utf-8"?>
<VerifyAddItemResponse xmlns="urn:ebay:apis:eBLBaseComponents">
  <Ack>Success</Ack>
</VerifyAddItemResponse>`,
        {
          status: 200,
          headers: { "Content-Type": "text/xml" },
        },
      ),
    );

    vi.stubGlobal("fetch", fetchMock);

    await ebayTradingApi(
      "VerifyAddItem",
      {
        Item: {
          Title: "Test listing",
        },
      },
      "oauth-user-token",
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, request] = fetchMock.mock.calls[0] as [
      string,
      RequestInit,
    ];

    expect(url).toBe("https://api.sandbox.ebay.com/ws/api.dll");
    expect(request.headers).toEqual(
      expect.objectContaining({
        "Content-Type": "text/xml",
        "X-EBAY-API-CALL-NAME": "VerifyAddItem",
        "X-EBAY-API-COMPATIBILITY-LEVEL": "967",
        "X-EBAY-API-IAF-TOKEN": "oauth-user-token",
        "X-EBAY-API-SITEID": "2",
      }),
    );
    expect(request.headers).not.toHaveProperty("X-EBAY-API-APP-NAME");
    expect(request.headers).not.toHaveProperty("X-EBAY-API-CERT-NAME");
    expect(request.headers).not.toHaveProperty("X-EBAY-API-DEV-NAME");
    expect(request.body).not.toContain("RequesterCredentials");
    expect(request.body).not.toContain("eBayAuthToken");
  });

  it("reads the seller UserID from a GetUser Trading API response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        `<?xml version="1.0" encoding="utf-8"?>
<GetUserResponse xmlns="urn:ebay:apis:eBLBaseComponents">
  <Ack>Success</Ack>
  <User>
    <UserID>sandbox-seller</UserID>
  </User>
</GetUserResponse>`,
        {
          status: 200,
          headers: { "Content-Type": "text/xml" },
        },
      ),
    );

    vi.stubGlobal("fetch", fetchMock);

    await expect(getEbayUserId("oauth-user-token")).resolves.toBe(
      "sandbox-seller",
    );
  });

  it("includes the configured postal code in listing verification requests", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        `<?xml version="1.0" encoding="utf-8"?>
<VerifyAddItemResponse xmlns="urn:ebay:apis:eBLBaseComponents">
  <Ack>Success</Ack>
</VerifyAddItemResponse>`,
        {
          status: 200,
          headers: { "Content-Type": "text/xml" },
        },
      ),
    );

    vi.stubGlobal("fetch", fetchMock);

    await verifyAddItem(buildListingData(), "oauth-user-token");

    const [, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(request.body).toContain("<PostalCode>V5V1A1</PostalCode>");
    expect(request.body).not.toContain("<Location></Location>");
    expect(request.body).not.toContain("<PostalCode></PostalCode>");
  });

  it("includes seller profiles, item specifics, and condition descriptors in the XML payload", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        `<?xml version="1.0" encoding="utf-8"?>
<VerifyAddItemResponse xmlns="urn:ebay:apis:eBLBaseComponents">
  <Ack>Success</Ack>
</VerifyAddItemResponse>`,
        {
          status: 200,
          headers: { "Content-Type": "text/xml" },
        },
      ),
    );

    vi.stubGlobal("fetch", fetchMock);

    await verifyAddItem(
      buildListingData({
        location: "Vancouver, BC",
        postal_code: undefined,
      }),
      "oauth-user-token",
    );

    const [, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(request.body).toContain("<SellerProfiles>");
    expect(request.body).toContain("<ShippingProfileID>ship-1</ShippingProfileID>");
    expect(request.body).toContain("<ItemSpecifics>");
    expect(request.body).toContain("<Name>Game</Name>");
    expect(request.body).toContain("<Value>Pokemon TCG</Value>");
    expect(request.body).toContain("<ConditionDescriptors>");
    expect(request.body).toContain("<ConditionDescriptor>");
  });

  it("falls back to inline shipping and return settings when seller profiles are not provided", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        `<?xml version="1.0" encoding="utf-8"?>
<VerifyAddItemResponse xmlns="urn:ebay:apis:eBLBaseComponents">
  <Ack>Success</Ack>
</VerifyAddItemResponse>`,
        {
          status: 200,
          headers: { "Content-Type": "text/xml" },
        },
      ),
    );

    vi.stubGlobal("fetch", fetchMock);

    await verifyAddItem(
      buildListingData({
        seller_profiles: undefined,
        manual_shipping: {
          shipping_service: "CA_PostExpeditedParcel",
          shipping_cost: 2.5,
          handling_time_days: 2,
        },
        manual_return_policy: {
          returns_accepted: true,
          return_period_days: 30,
          return_shipping_cost_payer: "Buyer",
        },
      }),
      "oauth-user-token",
      "EBAY_CA",
    );

    const [, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(request.body).not.toContain("<SellerProfiles>");
    expect(request.body).toContain("<ShippingDetails>");
    expect(request.body).toContain("<ShippingService>CA_PostExpeditedParcel</ShippingService>");
    expect(request.body).toContain("<ShippingServiceCost>2.5</ShippingServiceCost>");
    expect(request.body).toContain("<DispatchTimeMax>2</DispatchTimeMax>");
    expect(request.body).toContain("<ReturnPolicy>");
    expect(request.body).toContain("<ReturnsAcceptedOption>ReturnsAccepted</ReturnsAcceptedOption>");
    expect(request.body).toContain("<ReturnsWithinOption>Days_30</ReturnsWithinOption>");
    expect(request.body).toContain("<ShippingCostPaidByOption>Buyer</ShippingCostPaidByOption>");
  });

  it("fails early when no seller location is provided", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      verifyAddItem(
        buildListingData({
          location: undefined,
          postal_code: undefined,
        }),
        "oauth-user-token",
      ),
    ).rejects.toThrow(
      "eBay seller location is missing. Save a location or postal code in eBay publish settings.",
    );

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
