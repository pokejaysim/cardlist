/**
 * eBay API URL configuration — switches between sandbox and production
 * based on the EBAY_ENVIRONMENT env var (defaults to "sandbox").
 */

export interface EbayMarketplaceConfig {
  marketplaceId: string;
  siteId: string;
  country: string;
  currency: string;
  label: string;
  categoryDefault: string;
}

export const CANADA_BETA_MARKETPLACE_ID = "EBAY_CA";
export const CANADA_BETA_CURRENCY_CODE = "CAD";

export const EBAY_MARKETPLACES: Record<string, EbayMarketplaceConfig> = {
  EBAY_CA: {
    marketplaceId: "EBAY_CA",
    siteId: "2",
    country: "CA",
    currency: "CAD",
    label: "eBay Canada",
    categoryDefault: "183454",
  },
  EBAY_US: {
    marketplaceId: "EBAY_US",
    siteId: "0",
    country: "US",
    currency: "USD",
    label: "eBay US",
    categoryDefault: "183454",
  },
};

export const SUPPORTED_MARKETPLACES = Object.keys(EBAY_MARKETPLACES);

export function isCanadaBetaMarketplace(marketplaceId?: string | null): boolean {
  return (marketplaceId ?? CANADA_BETA_MARKETPLACE_ID) === CANADA_BETA_MARKETPLACE_ID;
}

export function getEbayUrls() {
  const env = process.env.EBAY_ENVIRONMENT ?? "sandbox";
  return env === "production"
    ? { apiBase: "https://api.ebay.com", authBase: "https://auth.ebay.com" }
    : { apiBase: "https://api.sandbox.ebay.com", authBase: "https://auth.sandbox.ebay.com" };
}

export function isMockMode(): boolean {
  return process.env.EBAY_MOCK_MODE === "true" || !process.env.EBAY_APP_ID;
}

export function getEbayMarketplaceConfig(marketplaceId?: string): EbayMarketplaceConfig {
  const id = marketplaceId ?? process.env.EBAY_MARKETPLACE_ID ?? getEbayMarketplaceId();
  const config = EBAY_MARKETPLACES[id];
  if (!config) {
    throw new Error(`Unsupported eBay marketplace: ${id}. Supported: ${SUPPORTED_MARKETPLACES.join(", ")}`);
  }
  return config;
}

export function getEbayMarketplaceId(): string {
  if (process.env.EBAY_MARKETPLACE_ID) {
    return process.env.EBAY_MARKETPLACE_ID;
  }

  const siteId = process.env.EBAY_SITE_ID ?? "2";

  switch (siteId) {
    case "0":
      return "EBAY_US";
    case "2":
      return "EBAY_CA";
    case "3":
      return "EBAY_GB";
    case "15":
      return "EBAY_AU";
    default:
      return "EBAY_CA";
  }
}

export function getTradingCardCategoryId(): string {
  return process.env.EBAY_TRADING_CARD_CATEGORY_ID ?? "183454";
}
