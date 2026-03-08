-- ══════════════════════════════════════════════════
-- Race condition fixes: atomic debits, advisory locks, dedup
-- ══════════════════════════════════════════════════

-- 1. Combined debit (base + GST) in a single transaction
--    Prevents split debits where base succeeds but GST fails or races with another debit.
create or replace function debit_wallet_with_gst(
  _org_id uuid,
  _base_amount numeric,
  _gst_amount numeric,
  _category wallet_tx_category,
  _description text default null,
  _reference_id text default null
) returns numeric as $$
declare
  _total numeric;
  _new_balance numeric;
begin
  _total := _base_amount + _gst_amount;

  -- Atomic check-and-debit with row lock
  update org_wallets
    set balance = balance - _total,
        total_debited = total_debited + _total,
        updated_at = now()
    where org_id = _org_id and balance >= _total
    returning balance into _new_balance;

  if _new_balance is null then
    return -1; -- insufficient balance
  end if;

  -- Log base transaction
  insert into wallet_transactions (org_id, type, category, amount, balance_after, description, reference_id)
  values (_org_id, 'debit', _category, _base_amount, _new_balance + _gst_amount, _description, _reference_id);

  -- Log GST transaction
  if _gst_amount > 0 then
    insert into wallet_transactions (org_id, type, category, amount, balance_after, description, reference_id)
    values (_org_id, 'debit', 'gst', _gst_amount, _new_balance, 'GST on ' || _description, _reference_id);
  end if;

  return _new_balance;
end;
$$ language plpgsql security definer;

-- 2. Atomic campaign status transition
--    Returns true only if status was actually changed, preventing double-launch.
create or replace function transition_campaign_status(
  _campaign_id uuid,
  _from_status text,
  _to_status text
) returns boolean as $$
declare
  _updated boolean;
begin
  update campaigns
    set status = _to_status, updated_at = now()
    where id = _campaign_id and status = _from_status;

  get diagnostics _updated = row_count;
  return _updated > 0;
end;
$$ language plpgsql security definer;

-- 3. Atomic claim of pending automation contacts (prevents daily limit bypass)
--    Claims up to N pending contacts by setting them to in_progress in one UPDATE.
create or replace function claim_automation_contacts(
  _automation_id uuid,
  _limit int
) returns setof uuid as $$
begin
  return query
  update automation_contacts
    set status = 'in_progress',
        step_entered_at = now(),
        current_step_order = 1
    where id in (
      select id from automation_contacts
        where automation_id = _automation_id
          and status = 'pending'
        order by created_at asc
        limit _limit
        for update skip locked
    )
    returning id;
end;
$$ language plpgsql security definer;

-- 4. Advisory lock wrapper for run-automations (prevents concurrent invocations)
create or replace function try_automation_lock()
returns boolean as $$
begin
  return pg_try_advisory_lock(8675309);
end;
$$ language plpgsql security definer;

create or replace function release_automation_lock()
returns void as $$
begin
  perform pg_advisory_unlock(8675309);
end;
$$ language plpgsql security definer;

-- 5. Unique index on exotel_message_id for webhook dedup (nulls allowed, only non-null must be unique)
create unique index if not exists idx_messages_exotel_msg_id
  on messages(exotel_message_id)
  where exotel_message_id is not null;
