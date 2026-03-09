-- Saved audience segments for campaign targeting
CREATE TABLE contact_segments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  filters JSONB NOT NULL DEFAULT '{}',
  contact_count INT NOT NULL DEFAULT 0,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_contact_segments_org ON contact_segments(org_id);

ALTER TABLE contact_segments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org members can manage segments" ON contact_segments FOR ALL USING (is_org_member(auth.uid(), org_id));
