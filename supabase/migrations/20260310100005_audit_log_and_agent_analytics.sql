-- Audit log for compliance and tracking
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),
  action TEXT NOT NULL, -- e.g., campaign.created, template.approved, contact.deleted, settings.updated
  resource_type TEXT, -- campaign, template, contact, conversation, settings, user
  resource_id TEXT,
  details JSONB DEFAULT '{}',
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_logs_org ON audit_logs(org_id, created_at DESC);
CREATE INDEX idx_audit_logs_action ON audit_logs(org_id, action);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org admins can view audit logs" ON audit_logs FOR SELECT
USING (is_org_member(auth.uid(), org_id));

-- Insert-only for non-admin users (via service role)
CREATE POLICY "System can insert audit logs" ON audit_logs FOR INSERT
WITH CHECK (true);

-- Agent performance analytics
CREATE TABLE agent_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  date DATE NOT NULL,
  conversations_handled INT NOT NULL DEFAULT 0,
  messages_sent INT NOT NULL DEFAULT 0,
  avg_response_time_sec INT,
  conversations_resolved INT NOT NULL DEFAULT 0,
  csat_score NUMERIC,
  UNIQUE(org_id, user_id, date)
);

CREATE INDEX idx_agent_metrics_org ON agent_metrics(org_id, date DESC);

ALTER TABLE agent_metrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org members can view agent metrics" ON agent_metrics FOR ALL
USING (is_org_member(auth.uid(), org_id));
