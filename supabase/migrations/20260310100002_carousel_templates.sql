-- Support carousel (multi-product) templates
ALTER TABLE templates ADD COLUMN IF NOT EXISTS carousel_cards JSONB;
-- Each card: { header_url, body_text, buttons: [{type, text, url/phone}] }

-- Track CTWA (Click-to-WhatsApp Ads) attribution
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS ctwa_source TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS ctwa_ad_id TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS ctwa_clid TEXT;

ALTER TABLE conversations ADD COLUMN IF NOT EXISTS ctwa_source TEXT;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS ctwa_ad_id TEXT;
