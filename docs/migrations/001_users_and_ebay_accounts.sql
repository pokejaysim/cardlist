-- CardList: Phase 2 migration
-- Run this in the Supabase SQL Editor

-- ── Users ──────────────────────────────────────────────

CREATE TABLE users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  stripe_customer_id VARCHAR(255),
  plan VARCHAR(50) DEFAULT 'free'
);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own data"
  ON users FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own data"
  ON users FOR UPDATE
  USING (auth.uid() = id);

-- Allow service role to insert (backend creates users)
CREATE POLICY "Service role can insert users"
  ON users FOR INSERT
  WITH CHECK (true);

-- ── eBay Accounts ──────────────────────────────────────

CREATE TABLE ebay_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ebay_token VARCHAR(2048) NOT NULL,
  ebay_user_id VARCHAR(255) NOT NULL,
  site_id INT DEFAULT 2,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  refreshed_at TIMESTAMPTZ
);

ALTER TABLE ebay_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own eBay account"
  ON ebay_accounts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage eBay accounts"
  ON ebay_accounts FOR ALL
  WITH CHECK (true);
