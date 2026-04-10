-- CardList: Phase 3 migration — Listings + Photos
-- Run this in the Supabase SQL Editor (after 001)

-- ── Listings ───────────────────────────────────────────

CREATE TABLE listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ebay_item_id BIGINT,
  status VARCHAR(50) DEFAULT 'draft',

  -- Card details
  card_name VARCHAR(255) NOT NULL,
  set_name VARCHAR(255),
  card_number VARCHAR(20),
  rarity VARCHAR(50),
  language VARCHAR(50) DEFAULT 'English',
  condition VARCHAR(50),

  -- Listing details
  title VARCHAR(80),
  description TEXT,
  price_cad DECIMAL(10, 2),
  listing_type VARCHAR(50) DEFAULT 'auction',
  duration INT DEFAULT 7,

  -- Photos (eBay hosted URLs after upload)
  photo_urls TEXT[] DEFAULT '{}',

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  published_at TIMESTAMPTZ,
  ebay_error TEXT,
  research_notes TEXT
);

CREATE INDEX idx_listings_user_id ON listings(user_id);
CREATE INDEX idx_listings_status ON listings(status);

ALTER TABLE listings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own listings"
  ON listings FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own listings"
  ON listings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own listings"
  ON listings FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own listings"
  ON listings FOR DELETE
  USING (auth.uid() = user_id);

-- Service role needs full access for background jobs
CREATE POLICY "Service role full access on listings"
  ON listings FOR ALL
  USING (true)
  WITH CHECK (true);

-- ── Photos ─────────────────────────────────────────────

CREATE TABLE photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  file_url VARCHAR(1024),
  ebay_url VARCHAR(1024),
  position INT DEFAULT 1,
  uploaded_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_photos_listing_id ON photos(listing_id);

ALTER TABLE photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read photos of own listings"
  ON photos FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM listings
      WHERE listings.id = photos.listing_id
      AND listings.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert photos for own listings"
  ON photos FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM listings
      WHERE listings.id = photos.listing_id
      AND listings.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete photos of own listings"
  ON photos FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM listings
      WHERE listings.id = photos.listing_id
      AND listings.user_id = auth.uid()
    )
  );

-- Service role needs full access for background jobs
CREATE POLICY "Service role full access on photos"
  ON photos FOR ALL
  USING (true)
  WITH CHECK (true);
