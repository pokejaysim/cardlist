-- Migration 004: Add card_game and identification tracking
-- Supports manual entry and freemium model

-- Track which card game a listing belongs to (Pokemon, Yu-Gi-Oh, MTG, etc.)
ALTER TABLE listings ADD COLUMN card_game VARCHAR(50);

-- Track whether listing was created via AI identification or manual entry
ALTER TABLE listings ADD COLUMN identified_by VARCHAR(20) DEFAULT 'manual';
