-- Migration 008: seller-level eBay publish settings and per-listing eBay aspects

CREATE TABLE IF NOT EXISTS ebay_seller_settings (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  marketplace_id VARCHAR(32) NOT NULL DEFAULT 'EBAY_CA',
  location TEXT,
  postal_code VARCHAR(32),
  fulfillment_policy_id VARCHAR(64),
  fulfillment_policy_name VARCHAR(255),
  payment_policy_id VARCHAR(64),
  payment_policy_name VARCHAR(255),
  return_policy_id VARCHAR(64),
  return_policy_name VARCHAR(255),
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE ebay_seller_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own eBay seller settings"
  ON ebay_seller_settings FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own eBay seller settings"
  ON ebay_seller_settings FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own eBay seller settings"
  ON ebay_seller_settings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role full access on eBay seller settings"
  ON ebay_seller_settings FOR ALL
  USING (true)
  WITH CHECK (true);

ALTER TABLE listings
  ADD COLUMN IF NOT EXISTS ebay_aspects JSONB DEFAULT '{}'::jsonb;
