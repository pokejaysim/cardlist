CREATE TABLE price_research (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  pricechart_data JSONB,
  ebay_comps JSONB,
  suggested_price_cad DECIMAL(10, 2),
  researched_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_price_research_listing_id ON price_research(listing_id);

ALTER TABLE price_research ENABLE ROW LEVEL SECURITY;

-- Users can read price research for their own listings
CREATE POLICY "Users can read own price research"
  ON price_research FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM listings
      WHERE listings.id = price_research.listing_id
      AND listings.user_id = auth.uid()
    )
  );

-- Service role full access
CREATE POLICY "Service role full access on price_research"
  ON price_research FOR ALL
  USING (true)
  WITH CHECK (true);
