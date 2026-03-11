-- Set search path explicitly
SET search_path TO public;

-- Allow org members to insert conversations (needed for "New Message" feature)
CREATE POLICY "Org members can insert conversations"
  ON public.conversations FOR INSERT
  TO authenticated
  WITH CHECK (public.is_org_member(auth.uid(), org_id));

-- Allow org members (not just admins) to insert contacts from Communications page
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'contacts' AND policyname = 'Org members can insert contacts'
  ) THEN
    NULL; -- already exists
  ELSE
    EXECUTE 'CREATE POLICY "Org members can insert contacts" ON public.contacts FOR INSERT TO authenticated WITH CHECK (public.is_org_member(auth.uid(), org_id))';
    IF EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'contacts' AND policyname = 'Org admins can insert contacts'
    ) THEN
      EXECUTE 'DROP POLICY "Org admins can insert contacts" ON public.contacts';
    END IF;
  END IF;
END $$;

-- Fix status check constraint: app uses 'resolved' but DB only allows 'open','closed'
ALTER TABLE public.conversations DROP CONSTRAINT IF EXISTS conversations_status_check;
ALTER TABLE public.conversations ADD CONSTRAINT conversations_status_check
  CHECK (status IN ('open', 'closed', 'resolved'));
