-- Fix RLS policies on call_list_contacts to allow org_admin to manage contacts
-- The original policies only allowed team_lead role, but org_admin should also have access

-- Drop existing management policies
DROP POLICY IF EXISTS "Team leads can insert contacts" ON call_list_contacts;
DROP POLICY IF EXISTS "Team leads can update contacts" ON call_list_contacts;
DROP POLICY IF EXISTS "Team leads can delete contacts" ON call_list_contacts;

-- Create new policies that include both org_admin and team_lead
CREATE POLICY "Admins and team leads can insert contacts" ON call_list_contacts
  FOR INSERT
  WITH CHECK (
    call_list_id IN (
      SELECT cl.id FROM call_lists cl
      WHERE has_role_in_org(auth.uid(), cl.organization_id, 'org_admin'::user_role)
         OR has_role_in_org(auth.uid(), cl.organization_id, 'team_lead'::user_role)
    )
  );

CREATE POLICY "Admins and team leads can update contacts" ON call_list_contacts
  FOR UPDATE
  USING (
    call_list_id IN (
      SELECT cl.id FROM call_lists cl
      WHERE has_role_in_org(auth.uid(), cl.organization_id, 'org_admin'::user_role)
         OR has_role_in_org(auth.uid(), cl.organization_id, 'team_lead'::user_role)
    )
  )
  WITH CHECK (
    call_list_id IN (
      SELECT cl.id FROM call_lists cl
      WHERE has_role_in_org(auth.uid(), cl.organization_id, 'org_admin'::user_role)
         OR has_role_in_org(auth.uid(), cl.organization_id, 'team_lead'::user_role)
    )
  );

CREATE POLICY "Admins and team leads can delete contacts" ON call_list_contacts
  FOR DELETE
  USING (
    call_list_id IN (
      SELECT cl.id FROM call_lists cl
      WHERE has_role_in_org(auth.uid(), cl.organization_id, 'org_admin'::user_role)
         OR has_role_in_org(auth.uid(), cl.organization_id, 'team_lead'::user_role)
    )
  );
