/**
 * eBay API URL configuration — switches between sandbox and production
 * based on the EBAY_ENVIRONMENT env var (defaults to "sandbox").
 */
export function getEbayUrls() {
  const env = process.env.EBAY_ENVIRONMENT ?? "sandbox";
  return env === "production"
    ? { apiBase: "https://api.ebay.com", authBase: "https://auth.ebay.com" }
    : { apiBase: "https://api.sandbox.ebay.com", authBase: "https://auth.sandbox.ebay.com" };
}

export function isMockMode(): boolean {
  return process.env.EBAY_MOCK_MODE === "true" || !process.env.EBAY_APP_ID;
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
