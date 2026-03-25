-- Link automations to campaigns so they appear in the campaigns list
-- When an automation fires, it auto-creates a campaign row

alter table automations add column if not exists campaign_id uuid references campaigns(id) on delete set null;
