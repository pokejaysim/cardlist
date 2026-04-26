-- Migration 016: Optional graded card certification number

ALTER TABLE listings
  ADD COLUMN IF NOT EXISTS cert_number TEXT;
