-- Migration 005: Add onboarding_complete to users, refresh_token and token_expires_at to ebay_accounts

-- Add onboarding_complete to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_complete BOOLEAN DEFAULT false;

-- Add refresh_token to ebay_accounts table
ALTER TABLE ebay_accounts ADD COLUMN IF NOT EXISTS refresh_token VARCHAR(2048);

-- Add token_expires_at to ebay_accounts table
ALTER TABLE ebay_accounts ADD COLUMN IF NOT EXISTS token_expires_at TIMESTAMPTZ;