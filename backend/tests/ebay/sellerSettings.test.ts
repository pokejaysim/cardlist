import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/lib/supabase.js", () => ({
  supabase: {},
}));

vi.mock("../../src/services/ebay/tokenManager.js", () => ({
  getValidEbayToken: vi.fn(),
}));

import {
  getSellerPublishStrategy,
  type EbayBusinessPolicyBundle,
  type EbaySellerSettings,
} from "../../src/services/ebay/sellerSettings.js";

const EMPTY_POLICIES: EbayBusinessPolicyBundle = {
  fulfillment: [],
  payment: [],
  return: [],
};

function buildSettings(
  overrides: Partial<EbaySellerSettings> = {},
): EbaySellerSettings {
  const timestamp = new Date(0).toISOString();
  return {
    user_id: "user-1",
    marketplace_id: "EBAY_CA",
    location: "Vancouver, BC",
    postal_code: "V5V 1A1",
    fulfillment_policy_id: null,
    fulfillment_policy_name: null,
    payment_policy_id: null,
    payment_policy_name: null,
    return_policy_id: null,
    return_policy_name: null,
    shipping_service: "CA_PostLettermail",
    shipping_cost: 0,
    handling_time_days: 2,
    returns_accepted: false,
    return_period_days: null,
    return_shipping_cost_payer: null,
    last_synced_at: null,
    created_at: timestamp,
    updated_at: timestamp,
    ...overrides,
  };
}

describe("getSellerPublishStrategy", () => {
  it("accepts Canada fallback defaults with supported Trading API shipping services", () => {
    expect(
      getSellerPublishStrategy(buildSettings(), EMPTY_POLICIES),
    ).toBe("snapcard_defaults");
  });

  it("rejects unsupported fallback shipping service codes", () => {
    expect(
      getSellerPublishStrategy(
        buildSettings({ shipping_service: "MadeUpShippingService" }),
        EMPTY_POLICIES,
      ),
    ).toBe("incomplete");
  });

  it("does not treat US fallback defaults as beta-ready", () => {
    expect(
      getSellerPublishStrategy(
        buildSettings({
          marketplace_id: "EBAY_US",
          shipping_service: "USPSGround",
        }),
        EMPTY_POLICIES,
      ),
    ).toBe("incomplete");
  });
});
