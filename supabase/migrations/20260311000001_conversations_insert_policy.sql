-- Allow org members to insert conversations (needed for "New Message" feature)
CREATE POLICY "Org members can insert conversations"
  ON conversations FOR INSERT
  TO authenticated
  WITH CHECK (is_org_member(auth.uid(), org_id));

-- Allow org members (not just admins) to insert contacts from Communications page
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'contacts' AND policyname = 'Org members can insert contacts'
  ) THEN
    NULL; -- already exists
  ELSE
    EXECUTE 'CREATE POLICY "Org members can insert contacts" ON contacts FOR INSERT TO authenticated WITH CHECK (is_org_member(auth.uid(), org_id))';
    IF EXISTS (
      SELECT 1 FROM pg_policies
      WHERE tablename = 'contacts' AND policyname = 'Org admins can insert contacts'
    ) THEN
      EXECUTE 'DROP POLICY "Org admins can insert contacts" ON contacts';
    END IF;
  END IF;
END $$;

-- Fix status check constraint: app uses 'resolved' but DB only allows 'open','closed'
ALTER TABLE conversations DROP CONSTRAINT IF EXISTS conversations_status_check;
ALTER TABLE conversations ADD CONSTRAINT conversations_status_check
  CHECK (status IN ('open', 'closed', 'resolved'));
