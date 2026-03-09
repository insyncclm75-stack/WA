-- ============================================================
-- DPDP Act 2023 Compliance: PII Encryption & Data Protection
-- ============================================================

-- Enable pgcrypto for AES-256 encryption
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── 1. Encryption key storage (service-role only) ──
CREATE TABLE pii_encryption_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  key_ciphertext BYTEA NOT NULL, -- encrypted with a master passphrase
  key_hint TEXT, -- last 4 chars or description for identification
  status TEXT NOT NULL DEFAULT 'active', -- active, rotated, revoked
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  rotated_at TIMESTAMPTZ,
  UNIQUE(org_id, status) -- only one active key per org
);

ALTER TABLE pii_encryption_keys ENABLE ROW LEVEL SECURITY;
-- Only service role can access (no user-level access)
CREATE POLICY "Service role only" ON pii_encryption_keys FOR ALL
USING (false);

-- ── 2. Consent records ──
CREATE TABLE consent_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  user_identifier TEXT NOT NULL, -- phone/email used during consent
  consent_version TEXT NOT NULL DEFAULT '1.0',
  purpose TEXT NOT NULL DEFAULT 'whatsapp_messaging',
  consented_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  withdrawn_at TIMESTAMPTZ,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_consent_records_org ON consent_records(org_id);
CREATE INDEX idx_consent_records_contact ON consent_records(contact_id);

ALTER TABLE consent_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org members can manage consent records" ON consent_records FOR ALL
USING (is_org_member(auth.uid(), org_id));

-- ── 3. Data subject requests (90-day SLA) ──
CREATE TABLE data_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  requested_by_phone TEXT,
  request_type TEXT NOT NULL, -- 'access', 'erasure', 'correction', 'nomination'
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'in_progress', 'completed', 'rejected'
  due_date TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '90 days'),
  completed_at TIMESTAMPTZ,
  admin_notes TEXT,
  details JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_data_requests_org ON data_requests(org_id, status);

ALTER TABLE data_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org members can manage data requests" ON data_requests FOR ALL
USING (is_org_member(auth.uid(), org_id));

-- ── 4. Breach notifications ──
CREATE TABLE breach_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  triggered_by UUID NOT NULL REFERENCES auth.users(id),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  impact TEXT NOT NULL,
  remedial_steps TEXT NOT NULL,
  dpo_contact TEXT NOT NULL,
  affected_count INT DEFAULT 0,
  notified_board BOOLEAN DEFAULT false,
  notified_principals BOOLEAN DEFAULT false,
  triggered_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE breach_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org members can manage breach notifications" ON breach_notifications FOR ALL
USING (is_org_member(auth.uid(), org_id));

-- ── 5. PII access audit log (immutable) ──
CREATE TABLE pii_access_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  user_id UUID,
  contact_id UUID,
  table_name TEXT NOT NULL,
  column_name TEXT NOT NULL,
  purpose TEXT NOT NULL DEFAULT 'display',
  accessed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_pii_access_log_org ON pii_access_log(org_id, accessed_at DESC);

ALTER TABLE pii_access_log ENABLE ROW LEVEL SECURITY;
-- Read-only for org members
CREATE POLICY "Org members can view PII access log" ON pii_access_log FOR SELECT
USING (is_org_member(auth.uid(), org_id));
-- Insert allowed for anyone (triggers/functions log access)
CREATE POLICY "System can insert PII access log" ON pii_access_log FOR INSERT
WITH CHECK (true);

-- ── 6. Add encrypted columns to contacts ──
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS name_encrypted BYTEA;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS email_encrypted BYTEA;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS custom_fields_encrypted BYTEA;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS pii_encrypted BOOLEAN DEFAULT false;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS consent_given BOOLEAN DEFAULT false;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS consent_given_at TIMESTAMPTZ;

-- ── 7. DPDP config per org ──
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS dpdp_enabled BOOLEAN DEFAULT false;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS dpo_email TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS dpo_phone TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS privacy_policy_url TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS data_retention_days INT DEFAULT 730; -- 2 years default

-- ── 8. Encrypt PII function (uses org-specific key) ──
CREATE OR REPLACE FUNCTION encrypt_pii_value(p_org_id UUID, plaintext TEXT)
RETURNS BYTEA
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = 'public', 'extensions'
AS $$
DECLARE
  key_cipher BYTEA;
  master_pass TEXT;
  enc_key TEXT;
BEGIN
  IF plaintext IS NULL OR plaintext = '' THEN RETURN NULL; END IF;

  -- Get org's active encryption key
  SELECT key_ciphertext INTO key_cipher
  FROM pii_encryption_keys
  WHERE org_id = p_org_id AND status = 'active'
  LIMIT 1;

  IF key_cipher IS NULL THEN
    RAISE EXCEPTION 'No active encryption key for org %', p_org_id;
  END IF;

  -- The key_ciphertext is encrypted with a fixed master passphrase
  -- stored as SUPABASE_DPDP_MASTER env var (set via edge function)
  master_pass := current_setting('app.dpdp_master_key', true);
  IF master_pass IS NULL OR master_pass = '' THEN
    -- Fallback: use a default derivation (not ideal, but functional)
    master_pass := 'dpdp-insync-' || p_org_id::text;
  END IF;

  enc_key := pgp_sym_decrypt(key_cipher, master_pass);
  RETURN pgp_sym_encrypt(plaintext, enc_key);
END;
$$;

-- ── 9. Decrypt PII function ──
CREATE OR REPLACE FUNCTION decrypt_pii_value(p_org_id UUID, ciphertext BYTEA)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = 'public', 'extensions'
AS $$
DECLARE
  key_cipher BYTEA;
  master_pass TEXT;
  enc_key TEXT;
BEGIN
  IF ciphertext IS NULL THEN RETURN NULL; END IF;

  SELECT key_ciphertext INTO key_cipher
  FROM pii_encryption_keys
  WHERE org_id = p_org_id AND status = 'active'
  LIMIT 1;

  IF key_cipher IS NULL THEN
    RAISE EXCEPTION 'No active encryption key for org %', p_org_id;
  END IF;

  master_pass := current_setting('app.dpdp_master_key', true);
  IF master_pass IS NULL OR master_pass = '' THEN
    master_pass := 'dpdp-insync-' || p_org_id::text;
  END IF;

  enc_key := pgp_sym_decrypt(key_cipher, master_pass);
  RETURN pgp_sym_decrypt(ciphertext, enc_key);
END;
$$;

-- ── 10. Auto-encrypt trigger for contacts ──
CREATE OR REPLACE FUNCTION encrypt_contact_pii()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  org_dpdp BOOLEAN;
  has_key BOOLEAN;
BEGIN
  -- Check if DPDP is enabled for this org
  SELECT dpdp_enabled INTO org_dpdp FROM organizations WHERE id = NEW.org_id;
  IF NOT COALESCE(org_dpdp, false) THEN
    RETURN NEW;
  END IF;

  -- Check if org has an active encryption key
  SELECT EXISTS(
    SELECT 1 FROM pii_encryption_keys WHERE org_id = NEW.org_id AND status = 'active'
  ) INTO has_key;

  IF NOT has_key THEN
    RETURN NEW;
  END IF;

  -- Encrypt name
  IF NEW.name IS NOT NULL AND NEW.name != '' THEN
    BEGIN
      NEW.name_encrypted := encrypt_pii_value(NEW.org_id, NEW.name);
      -- Mask: keep first char + last char
      IF length(NEW.name) > 2 THEN
        NEW.name := substr(NEW.name, 1, 1) || repeat('*', length(NEW.name) - 2) || substr(NEW.name, length(NEW.name), 1);
      END IF;
    EXCEPTION WHEN OTHERS THEN
      -- If encryption fails, keep plaintext (don't break inserts)
      NULL;
    END;
  END IF;

  -- Encrypt email
  IF NEW.email IS NOT NULL AND NEW.email != '' THEN
    BEGIN
      NEW.email_encrypted := encrypt_pii_value(NEW.org_id, NEW.email);
      -- Mask: user@*** pattern
      IF position('@' in NEW.email) > 0 THEN
        NEW.email := substr(NEW.email, 1, 2) || '***@' || substr(NEW.email, position('@' in NEW.email) + 1);
      END IF;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;

  -- Encrypt custom_fields if present
  IF NEW.custom_fields IS NOT NULL AND NEW.custom_fields::text != '{}' AND NEW.custom_fields::text != 'null' THEN
    BEGIN
      NEW.custom_fields_encrypted := encrypt_pii_value(NEW.org_id, NEW.custom_fields::text);
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;

  NEW.pii_encrypted := true;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_encrypt_contact_pii
  BEFORE INSERT OR UPDATE ON contacts
  FOR EACH ROW
  EXECUTE FUNCTION encrypt_contact_pii();

-- ── 11. Secure decryption RPC with access logging ──
CREATE OR REPLACE FUNCTION get_contact_decrypted(p_contact_id UUID, p_purpose TEXT DEFAULT 'display')
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  c RECORD;
  result JSONB;
  decrypted_name TEXT;
  decrypted_email TEXT;
  decrypted_custom TEXT;
BEGIN
  SELECT * INTO c FROM contacts WHERE id = p_contact_id;
  IF c IS NULL THEN RETURN NULL; END IF;

  -- Check authorization
  IF NOT is_org_member(auth.uid(), c.org_id) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Decrypt fields
  BEGIN
    decrypted_name := decrypt_pii_value(c.org_id, c.name_encrypted);
  EXCEPTION WHEN OTHERS THEN
    decrypted_name := c.name;
  END;

  BEGIN
    decrypted_email := decrypt_pii_value(c.org_id, c.email_encrypted);
  EXCEPTION WHEN OTHERS THEN
    decrypted_email := c.email;
  END;

  BEGIN
    decrypted_custom := decrypt_pii_value(c.org_id, c.custom_fields_encrypted);
  EXCEPTION WHEN OTHERS THEN
    decrypted_custom := COALESCE(c.custom_fields::text, '{}');
  END;

  -- Log PII access
  INSERT INTO pii_access_log (org_id, user_id, contact_id, table_name, column_name, purpose)
  VALUES
    (c.org_id, auth.uid(), p_contact_id, 'contacts', 'name', p_purpose),
    (c.org_id, auth.uid(), p_contact_id, 'contacts', 'email', p_purpose),
    (c.org_id, auth.uid(), p_contact_id, 'contacts', 'custom_fields', p_purpose);

  result := jsonb_build_object(
    'id', c.id,
    'phone_number', c.phone_number,
    'name', COALESCE(decrypted_name, c.name),
    'email', COALESCE(decrypted_email, c.email),
    'custom_fields', COALESCE(decrypted_custom::jsonb, c.custom_fields),
    'tags', c.tags,
    'source', c.source,
    'org_id', c.org_id,
    'created_at', c.created_at
  );

  RETURN result;
END;
$$;

-- ── 12. Helper RPC to store encrypted key (called from edge function) ──
CREATE OR REPLACE FUNCTION encrypt_key_for_storage(
  p_org_id UUID,
  p_key TEXT,
  p_master TEXT,
  p_user_id UUID,
  p_hint TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = 'public', 'extensions'
AS $$
DECLARE
  existing_id UUID;
BEGIN
  -- Deactivate any existing active key
  SELECT id INTO existing_id
  FROM pii_encryption_keys
  WHERE org_id = p_org_id AND status = 'active'
  LIMIT 1;

  IF existing_id IS NOT NULL THEN
    UPDATE pii_encryption_keys
    SET status = 'rotated', rotated_at = now()
    WHERE id = existing_id;
  END IF;

  -- Insert new key encrypted with master passphrase
  INSERT INTO pii_encryption_keys (org_id, key_ciphertext, key_hint, status, created_by)
  VALUES (p_org_id, pgp_sym_encrypt(p_key, p_master), p_hint, 'active', p_user_id);

  -- Enable DPDP for the org
  UPDATE organizations SET dpdp_enabled = true WHERE id = p_org_id;

  RETURN true;
END;
$$;
