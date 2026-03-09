-- Visual chatbot flow builder
CREATE TABLE chatbot_flows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  trigger_type TEXT NOT NULL DEFAULT 'keyword', -- keyword, first_message, all_messages
  trigger_value TEXT, -- keyword(s) to match, comma-separated
  status TEXT NOT NULL DEFAULT 'draft', -- draft, active, paused
  nodes JSONB NOT NULL DEFAULT '[]',
  edges JSONB NOT NULL DEFAULT '[]',
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_chatbot_flows_org ON chatbot_flows(org_id);
CREATE INDEX idx_chatbot_flows_status ON chatbot_flows(org_id, status);

ALTER TABLE chatbot_flows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org members can manage chatbot flows" ON chatbot_flows FOR ALL
USING (is_org_member(auth.uid(), org_id));

-- Track active flow sessions per contact
CREATE TABLE chatbot_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id UUID NOT NULL REFERENCES chatbot_flows(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  current_node_id TEXT NOT NULL,
  variables JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'active', -- active, completed, expired
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ DEFAULT now() + INTERVAL '24 hours'
);

CREATE INDEX idx_chatbot_sessions_active ON chatbot_sessions(org_id, contact_id, status);

ALTER TABLE chatbot_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org members can view chatbot sessions" ON chatbot_sessions FOR ALL
USING (is_org_member(auth.uid(), org_id));
