-- ══════════════════════════════════════════════════
-- Remove platform fee, bill on delivery, ₹500 min recharge
-- ══════════════════════════════════════════════════

-- 1. Unschedule the monthly platform fee cron job
select cron.unschedule('monthly-platform-fee');

-- 2. Drop the charge function (no longer needed)
drop function if exists charge_monthly_platform_fee();

-- 3. Change default platform_fee on monthly_invoices from 1500 to 0
alter table monthly_invoices alter column platform_fee set default 0;

-- 4. Delivery-based billing: debit wallet when message is delivered
--    Unlike debit_wallet_with_gst, this allows negative balances so we
--    always charge for delivered messages.
create or replace function debit_wallet_on_delivery(
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

  -- Debit wallet (allow negative balance for delivery-based billing)
  update org_wallets
    set balance = balance - _total,
        total_debited = total_debited + _total,
        updated_at = now()
    where org_id = _org_id
    returning balance into _new_balance;

  if _new_balance is null then
    return -1; -- wallet not found
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

-- 5. Update message rates: utility/auth from 0.20 → 0.35
--    (compensates for platform fee removal; matches landing page pricing)
