-- Migration 015: Seller logo URL for description templates

ALTER TABLE listing_preferences
  ADD COLUMN IF NOT EXISTS seller_logo_url TEXT;
