-- Conversation labels
CREATE TABLE conversation_labels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#6366f1',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(org_id, name)
);

ALTER TABLE conversation_labels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org members can manage labels" ON conversation_labels FOR ALL USING (is_org_member(auth.uid(), org_id));

-- Junction table: conversation <-> label
CREATE TABLE conversation_label_assignments (
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  label_id UUID NOT NULL REFERENCES conversation_labels(id) ON DELETE CASCADE,
  PRIMARY KEY (conversation_id, label_id)
);

ALTER TABLE conversation_label_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org members can manage label assignments" ON conversation_label_assignments FOR ALL
USING (EXISTS (SELECT 1 FROM conversations c WHERE c.id = conversation_id AND is_org_member(auth.uid(), c.org_id)));

-- Conversation assignment: assigned_to already exists on conversations table
-- Add resolved_at for tracking resolution time
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;

-- Free utility messages in service window:
-- Update the billing logic in send-campaign to check if within 24h window
-- No schema changes needed — this is a code-level change
