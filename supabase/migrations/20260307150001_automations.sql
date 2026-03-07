-- ══════════════════════════════════════════════════
-- Automations / Drip Campaign Engine
-- ══════════════════════════════════════════════════

-- 1. Automations: the top-level container
create table automations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  daily_limit int not null default 10,
  status text not null default 'draft' check (status in ('draft', 'active', 'paused', 'completed')),
  total_contacts int not null default 0,
  processed_contacts int not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index idx_automations_org on automations(org_id, status);
alter table automations enable row level security;

create policy "Org members can view automations"
  on automations for select to authenticated
  using (is_org_member(auth.uid(), org_id));

create policy "Org members can manage automations"
  on automations for all to authenticated
  using (is_org_member(auth.uid(), org_id));

create policy "Service role manages automations"
  on automations for all to service_role
  using (true) with check (true);

-- 2. Automation steps: linear sequence with branching via conditions
--    step_type: 'send_template' | 'wait' | 'condition'
--    For send_template: template_id is required
--    For wait: wait_hours specifies how long to wait before evaluating next step
--    For condition: rules jsonb defines branches based on message status
create table automation_steps (
  id uuid primary key default gen_random_uuid(),
  automation_id uuid not null references automations(id) on delete cascade,
  step_order int not null,
  step_type text not null check (step_type in ('send_template', 'wait', 'condition')),
  template_id uuid references templates(id) on delete set null,
  template_name text,          -- denormalized for display
  wait_hours int default 24,
  -- For condition steps: array of {status: 'read'|'delivered'|'replied'|'no_response', goto_step: int}
  rules jsonb,
  created_at timestamptz default now(),
  unique(automation_id, step_order)
);

create index idx_automation_steps on automation_steps(automation_id, step_order);
alter table automation_steps enable row level security;

create policy "Steps inherit automation access"
  on automation_steps for select to authenticated
  using (exists (
    select 1 from automations a where a.id = automation_id and is_org_member(auth.uid(), a.org_id)
  ));

create policy "Steps writable by org members"
  on automation_steps for all to authenticated
  using (exists (
    select 1 from automations a where a.id = automation_id and is_org_member(auth.uid(), a.org_id)
  ));

create policy "Service role manages steps"
  on automation_steps for all to service_role
  using (true) with check (true);

-- 3. Automation contacts: tracks each contact's position in the automation
create table automation_contacts (
  id uuid primary key default gen_random_uuid(),
  automation_id uuid not null references automations(id) on delete cascade,
  contact_id uuid not null references contacts(id) on delete cascade,
  current_step_order int not null default 1,
  status text not null default 'pending' check (status in ('pending', 'in_progress', 'waiting', 'completed', 'failed')),
  last_message_id uuid references messages(id) on delete set null,
  last_message_status text,   -- cached: sent/delivered/read/failed
  step_entered_at timestamptz,
  next_action_at timestamptz,  -- when the wait period expires
  completed_at timestamptz,
  created_at timestamptz default now(),
  unique(automation_id, contact_id)
);

create index idx_automation_contacts_status on automation_contacts(automation_id, status);
create index idx_automation_contacts_next on automation_contacts(next_action_at) where status in ('pending', 'waiting');
alter table automation_contacts enable row level security;

create policy "Automation contacts inherit access"
  on automation_contacts for select to authenticated
  using (exists (
    select 1 from automations a where a.id = automation_id and is_org_member(auth.uid(), a.org_id)
  ));

create policy "Automation contacts writable by org members"
  on automation_contacts for all to authenticated
  using (exists (
    select 1 from automations a where a.id = automation_id and is_org_member(auth.uid(), a.org_id)
  ));

create policy "Service role manages automation contacts"
  on automation_contacts for all to service_role
  using (true) with check (true);

-- 4. pg_cron job: process automations every 30 minutes
-- The actual processing is done by the edge function run-automations
-- We use pg_net to call the edge function
select cron.schedule(
  'run-automations',
  '*/30 * * * *',
  $$
  select net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/run-automations',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);
