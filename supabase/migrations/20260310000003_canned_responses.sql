-- Canned (saved) responses for quick replies in inbox
CREATE TABLE canned_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  shortcut TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_canned_responses_org ON canned_responses(org_id);

-- RLS
ALTER TABLE canned_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can read canned responses"
ON canned_responses FOR SELECT
USING (is_org_member(auth.uid(), org_id));

CREATE POLICY "Org admins can manage canned responses"
ON canned_responses FOR ALL
USING (is_org_member(auth.uid(), org_id));
