SET search_path TO public;

-- Add scheduled_time column to automations (HH:MM format, e.g. '09:00')
-- NULL means run on every cron cycle (backwards compatible)
ALTER TABLE public.automations
  ADD COLUMN IF NOT EXISTS scheduled_time TIME DEFAULT NULL;

COMMENT ON COLUMN public.automations.scheduled_time IS 'Time of day (IST) when this automation should run. NULL = run on every cron cycle.';
