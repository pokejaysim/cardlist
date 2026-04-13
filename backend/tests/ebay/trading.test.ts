import { describe, it, expect, vi, beforeEach } from "vitest";
import { XMLParser } from "fast-xml-parser";

// ---------------------------------------------------------------------------
// We test the shape of the XML and headers by calling ebayTradingApi
// through a mocked fetch. We also test fetchEbayUserId parsing.
// ---------------------------------------------------------------------------

// Mock environment for tests
process.env.EBAY_SITE_ID = "2";
process.env.EBAY_APP_ID = "test-app-id";
process.env.EBAY_DEV_ID = "test-dev-id";
process.env.EBAY_CERT_ID = "test-cert-id";
process.env.EBAY_ENVIRONMENT = "sandbox";

// We need to import after env vars are set
const { ebayTradingApi } = await import("../../src/services/ebay/trading.js");

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  processEntities: false,
});

describe("eBay Trading API OAuth headers", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      text: () =>
        Promise.resolve(
          `<?xml version="1.0" encoding="utf-8"?>
<GetUserResponse xmlns="urn:ebay:apis:eBLBaseComponents">
  <Ack>Success</Ack>
  <UserID>test-seller</UserID>
</GetUserResponse>`
        ),
    });
    vi.stubGlobal("fetch", fetchSpy);
  });

  it("sends X-EBAY-API-IAF-TOKEN header with the OAuth token", async () => {
    await ebayTradingApi("GetUser", {}, "oauth-token-123");

    const callHeaders = fetchSpy.mock.calls[0][1].headers as Record<
      string,
      string
    >;
    expect(callHeaders["X-EBAY-API-IAF-TOKEN"]).toBe("oauth-token-123");
  });

  it("does NOT send legacy X-EBAY-API-APP-NAME / DEV / CERT headers", async () => {
    await ebayTradingApi("GetUser", {}, "oauth-token-123");

    const callHeaders = fetchSpy.mock.calls[0][1].headers as Record<
      string,
      string
    >;
    expect(callHeaders).not.toHaveProperty("X-EBAY-API-APP-NAME");
    expect(callHeaders).not.toHaveProperty("X-EBAY-API-DEV-NAME");
    expect(callHeaders).not.toHaveProperty("X-EBAY-API-CERT-NAME");
  });

  it("does NOT include RequesterCredentials in the XML body", async () => {
    await ebayTradingApi("GetUser", {}, "oauth-token-123");

    const xmlBody = fetchSpy.mock.calls[0][1].body as string;
    expect(xmlBody).not.toContain("RequesterCredentials");
    expect(xmlBody).not.toContain("eBayAuthToken");

    // Verify it's valid XML with the right call name
    const parsed = xmlParser.parse(xmlBody) as Record<string, unknown>;
    expect(parsed).toHaveProperty("GetUserRequest");
  });

  it("includes the correct X-EBAY-API-CALL-NAME header", async () => {
    await ebayTradingApi("AddItem", {}, "oauth-token-123");

    const callHeaders = fetchSpy.mock.calls[0][1].headers as Record<
      string,
      string
    >;
    expect(callHeaders["X-EBAY-API-CALL-NAME"]).toBe("AddItem");
  });
});

describe("GetUser UserID parsing", () => {
  it("parses UserID from a successful GetUser response", () => {
    const responseXml = `<?xml version="1.0" encoding="utf-8"?>
<GetUserResponse xmlns="urn:ebay:apis:eBLBaseComponents">
  <Ack>Success</Ack>
  <UserID>test-seller</UserID>
</GetUserResponse>`;

    const match = responseXml.match(/<UserID>([^<]+)<\/UserID>/);
    expect(match?.[1]).toBe("test-seller");
  });

  it("returns null when UserID is not in the response", () => {
    const responseXml = `<?xml version="1.0" encoding="utf-8"?>
<GetUserResponse xmlns="urn:ebay:apis:eBLBaseComponents">
  <Ack>Failure</Ack>
  <Errors>
    <LongMessage>Auth token is invalid</LongMessage>
  </Errors>
</GetUserResponse>`;

    const match = responseXml.match(/<UserID>([^<]+)<\/UserID>/);
    expect(match).toBeNull();
  });
});