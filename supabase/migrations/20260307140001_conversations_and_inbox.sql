-- ══════════════════════════════════════════════════
-- Conversations, Inbox, AI Config, Campaign & Contact enhancements
-- ══════════════════════════════════════════════════

-- 1. Conversations table
create table conversations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  contact_id uuid not null references contacts(id) on delete cascade,
  phone_number text not null,
  last_message_at timestamptz default now(),
  last_message_preview text,
  last_inbound_at timestamptz, -- tracks 24hr free reply window
  unread_count int not null default 0,
  status text not null default 'open' check (status in ('open', 'closed')),
  assigned_to uuid references auth.users(id) on delete set null,
  ai_enabled boolean not null default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(org_id, contact_id)
);

create index idx_conversations_org on conversations(org_id, last_message_at desc);
create index idx_conversations_phone on conversations(org_id, phone_number);

alter table conversations enable row level security;

create policy "Org members can view conversations"
  on conversations for select to authenticated
  using (is_org_member(auth.uid(), org_id));

create policy "Org members can update conversations"
  on conversations for update to authenticated
  using (is_org_member(auth.uid(), org_id));

create policy "Service role manages conversations"
  on conversations for all to service_role
  using (true) with check (true);

-- 2. AI Config per org
create table ai_config (
  id uuid primary key default gen_random_uuid(),
  org_id uuid unique not null references organizations(id) on delete cascade,
  system_prompt text default 'You are a helpful customer support agent. Be concise and friendly.',
  knowledge_base text default '',
  enabled boolean not null default true,
  model text not null default 'claude-haiku-4-5-20251001',
  max_history int not null default 20,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table ai_config enable row level security;

create policy "Org members can view ai_config"
  on ai_config for select to authenticated
  using (is_org_member(auth.uid(), org_id));

create policy "Org admins can manage ai_config"
  on ai_config for all to authenticated
  using (is_org_member(auth.uid(), org_id));

create policy "Service role manages ai_config"
  on ai_config for all to service_role
  using (true) with check (true);

-- Auto-create ai_config when org is created
create or replace function create_org_ai_config()
returns trigger as $$
begin
  insert into ai_config (org_id) values (new.id) on conflict do nothing;
  return new;
end;
$$ language plpgsql security definer;

create trigger trg_create_org_ai_config
  after insert on organizations
  for each row execute function create_org_ai_config();

-- Create ai_config for existing orgs
insert into ai_config (org_id)
select id from organizations
on conflict do nothing;

-- 3. Messages: add direction, make campaign_id nullable, add conversation_id
alter table messages
  add column if not exists direction text not null default 'outbound'
    check (direction in ('inbound', 'outbound'));

alter table messages
  add column if not exists conversation_id uuid references conversations(id) on delete set null;

-- Make campaign_id nullable (inbound messages have no campaign)
alter table messages alter column campaign_id drop not null;

-- Make contact_id nullable (inbound from unknown contacts initially)
-- Actually keep contact_id required - we create contacts for inbound too

create index idx_messages_conversation on messages(conversation_id, created_at);
create index idx_messages_direction on messages(org_id, direction, created_at desc);

-- 4. Contacts: add custom_fields for CSV variables
alter table contacts
  add column if not exists custom_fields jsonb default '{}';

-- Unique constraint on phone_number + org_id for upsert support
create unique index if not exists idx_contacts_phone_org
  on contacts(phone_number, org_id);

-- 5. Campaigns: add variable_mapping
alter table campaigns
  add column if not exists variable_mapping jsonb;
