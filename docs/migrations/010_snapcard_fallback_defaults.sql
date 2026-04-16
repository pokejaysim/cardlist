-- Migration 010: SnapCard fallback shipping and return defaults

ALTER TABLE ebay_seller_settings
  ADD COLUMN IF NOT EXISTS shipping_service VARCHAR(128),
  ADD COLUMN IF NOT EXISTS shipping_cost NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS handling_time_days INTEGER,
  ADD COLUMN IF NOT EXISTS returns_accepted BOOLEAN,
  ADD COLUMN IF NOT EXISTS return_period_days INTEGER,
  ADD COLUMN IF NOT EXISTS return_shipping_cost_payer VARCHAR(16);
