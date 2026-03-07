-- WhatsApp OTP tables

CREATE TABLE IF NOT EXISTS whatsapp_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exotel_sid TEXT,
  exotel_api_key TEXT,
  exotel_api_token TEXT,
  exotel_subdomain TEXT DEFAULT 'api.exotel.com',
  waba_id TEXT,
  whatsapp_source_number TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public_otp_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID DEFAULT gen_random_uuid(),
  identifier TEXT NOT NULL,
  identifier_type TEXT NOT NULL,
  otp_code TEXT NOT NULL,
  attempts INT DEFAULT 0,
  max_attempts INT DEFAULT 3,
  expires_at TIMESTAMPTZ DEFAULT (now() + interval '5 minutes'),
  verified_at TIMESTAMPTZ,
  ip_address INET,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_otp_session ON public_otp_verifications (session_id);
CREATE INDEX IF NOT EXISTS idx_otp_identifier ON public_otp_verifications (identifier, created_at);

-- RLS: these tables are accessed only via service role in edge functions
ALTER TABLE whatsapp_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public_otp_verifications ENABLE ROW LEVEL SECURITY;
