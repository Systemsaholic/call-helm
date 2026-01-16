-- Fix RLS policies on call_list_contacts using SECURITY DEFINER function
-- The original policies fail on upsert because call_list_id isn't in the payload

-- Create a function to check if user can manage call list contacts
CREATE OR REPLACE FUNCTION user_can_manage_call_list(p_call_list_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM call_lists cl
    JOIN organization_members om ON om.organization_id = cl.organization_id
    WHERE cl.id = p_call_list_id
    AND om.user_id = auth.uid()
    AND om.is_active = true
    AND om.role IN ('org_admin', 'team_lead')
  );
$$;

GRANT EXECUTE ON FUNCTION user_can_manage_call_list(UUID) TO authenticated;

-- Also create a function to get call_list_id from a call_list_contact id
CREATE OR REPLACE FUNCTION get_call_list_id_for_contact(p_contact_id UUID)
RETURNS UUID
LANGUAGE SQL
SECURITY DEFINER
STABLE
AS $$
  SELECT call_list_id FROM call_list_contacts WHERE id = p_contact_id;
$$;

GRANT EXECUTE ON FUNCTION get_call_list_id_for_contact(UUID) TO authenticated;

-- Drop the new policies we just created
DROP POLICY IF EXISTS "Admins and team leads can insert contacts" ON call_list_contacts;
DROP POLICY IF EXISTS "Admins and team leads can update contacts" ON call_list_contacts;
DROP POLICY IF EXISTS "Admins and team leads can delete contacts" ON call_list_contacts;

-- Create simpler policies using the SECURITY DEFINER functions
CREATE POLICY "Admins and team leads can insert contacts" ON call_list_contacts
  FOR INSERT
  WITH CHECK (user_can_manage_call_list(call_list_id));

CREATE POLICY "Admins and team leads can update contacts" ON call_list_contacts
  FOR UPDATE
  USING (user_can_manage_call_list(call_list_id))
  WITH CHECK (user_can_manage_call_list(COALESCE(call_list_id, get_call_list_id_for_contact(id))));

CREATE POLICY "Admins and team leads can delete contacts" ON call_list_contacts
  FOR DELETE
  USING (user_can_manage_call_list(call_list_id));
