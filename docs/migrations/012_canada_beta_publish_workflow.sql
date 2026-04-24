-- Migration 012: Canada beta publish workflow timestamps

ALTER TABLE listings ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS publish_started_at TIMESTAMPTZ;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS publish_attempted_at TIMESTAMPTZ;
