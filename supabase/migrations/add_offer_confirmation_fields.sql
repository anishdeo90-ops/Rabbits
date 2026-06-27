-- Run once in Supabase Dashboard → SQL Editor
-- Adds CTC confirmation method + offer written-confirmation notes to candidate_offers

ALTER TABLE candidate_offers
  ADD COLUMN IF NOT EXISTS ctc_confirm_method text
    CHECK (ctc_confirm_method IN ('physical_sign','email','whatsapp','verbal')),
  ADD COLUMN IF NOT EXISTS offer_confirm_notes text;
