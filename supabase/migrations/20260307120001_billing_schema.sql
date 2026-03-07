-- ══════════════════════════════════════════════════
-- Billing: wallets, transactions, invoices
-- ══════════════════════════════════════════════════

-- Wallet per org (prepaid balance)
create table org_wallets (
  id uuid primary key default gen_random_uuid(),
  org_id uuid unique not null references organizations(id) on delete cascade,
  balance numeric(12,2) not null default 0,
  total_credited numeric(12,2) not null default 0,
  total_debited numeric(12,2) not null default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table org_wallets enable row level security;

create policy "Org members can view their wallet"
  on org_wallets for select to authenticated
  using (is_org_member(auth.uid(), org_id));

create policy "Service role manages wallets"
  on org_wallets for all to service_role
  using (true) with check (true);

-- Transaction log
create type wallet_tx_type as enum ('credit', 'debit');
create type wallet_tx_category as enum (
  'topup', 'marketing_message', 'utility_message', 'auth_message',
  'platform_fee', 'gst', 'refund', 'adjustment'
);

create table wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  type wallet_tx_type not null,
  category wallet_tx_category not null,
  amount numeric(12,2) not null,
  balance_after numeric(12,2) not null,
  description text,
  reference_id text, -- razorpay_payment_id, campaign_id, etc.
  created_at timestamptz default now()
);

create index idx_wallet_tx_org_created on wallet_transactions(org_id, created_at desc);

alter table wallet_transactions enable row level security;

create policy "Org members can view their transactions"
  on wallet_transactions for select to authenticated
  using (is_org_member(auth.uid(), org_id));

create policy "Service role manages transactions"
  on wallet_transactions for all to service_role
  using (true) with check (true);

-- Monthly invoices
create table monthly_invoices (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  month text not null, -- '2026-03'
  platform_fee numeric(12,2) not null default 1500,
  marketing_count int not null default 0,
  marketing_cost numeric(12,2) not null default 0,
  utility_count int not null default 0,
  utility_cost numeric(12,2) not null default 0,
  auth_count int not null default 0,
  auth_cost numeric(12,2) not null default 0,
  subtotal numeric(12,2) not null default 0,
  gst_amount numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  status text not null default 'generated' check (status in ('generated', 'paid')),
  created_at timestamptz default now(),
  unique(org_id, month)
);

alter table monthly_invoices enable row level security;

create policy "Org members can view their invoices"
  on monthly_invoices for select to authenticated
  using (is_org_member(auth.uid(), org_id));

create policy "Service role manages invoices"
  on monthly_invoices for all to service_role
  using (true) with check (true);

-- Add message_category to campaigns table for billing classification
alter table campaigns
  add column if not exists message_category text default 'marketing'
  check (message_category in ('marketing', 'utility', 'authentication'));

-- Auto-create wallet when org is created
create or replace function create_org_wallet()
returns trigger as $$
begin
  insert into org_wallets (org_id) values (new.id) on conflict do nothing;
  return new;
end;
$$ language plpgsql security definer;

create trigger trg_create_org_wallet
  after insert on organizations
  for each row execute function create_org_wallet();

-- Create wallets for existing orgs
insert into org_wallets (org_id)
select id from organizations
on conflict do nothing;

-- Helper function: debit wallet atomically, returns new balance or -1 if insufficient
create or replace function debit_wallet(
  _org_id uuid,
  _amount numeric,
  _category wallet_tx_category,
  _description text default null,
  _reference_id text default null
) returns numeric as $$
declare
  _new_balance numeric;
begin
  -- Lock and debit
  update org_wallets
    set balance = balance - _amount,
        total_debited = total_debited + _amount,
        updated_at = now()
    where org_id = _org_id and balance >= _amount
    returning balance into _new_balance;

  if _new_balance is null then
    return -1; -- insufficient balance
  end if;

  -- Log transaction
  insert into wallet_transactions (org_id, type, category, amount, balance_after, description, reference_id)
  values (_org_id, 'debit', _category, _amount, _new_balance, _description, _reference_id);

  return _new_balance;
end;
$$ language plpgsql security definer;

-- Helper function: credit wallet
create or replace function credit_wallet(
  _org_id uuid,
  _amount numeric,
  _category wallet_tx_category,
  _description text default null,
  _reference_id text default null
) returns numeric as $$
declare
  _new_balance numeric;
begin
  update org_wallets
    set balance = balance + _amount,
        total_credited = total_credited + _amount,
        updated_at = now()
    where org_id = _org_id
    returning balance into _new_balance;

  insert into wallet_transactions (org_id, type, category, amount, balance_after, description, reference_id)
  values (_org_id, 'credit', _category, _amount, _new_balance, _description, _reference_id);

  return _new_balance;
end;
$$ language plpgsql security definer;
