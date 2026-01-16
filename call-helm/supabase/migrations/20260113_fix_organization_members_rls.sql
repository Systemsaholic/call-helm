-- Fix RLS policy for organization_members to properly show pending agents
-- The original policy caused infinite recursion when checking organization membership

-- Create a security definer function to get user's organization_id without triggering RLS
CREATE OR REPLACE FUNCTION get_user_organization_id(user_uuid UUID)
RETURNS UUID
LANGUAGE SQL
SECURITY DEFINER
STABLE
AS $$
  SELECT organization_id
  FROM organization_members
  WHERE user_id = user_uuid
  LIMIT 1;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION get_user_organization_id(UUID) TO authenticated;

-- Create a function to check if user has admin role in their org
CREATE OR REPLACE FUNCTION user_is_org_admin(user_uuid UUID)
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM organization_members
    WHERE user_id = user_uuid
    AND role IN ('org_admin', 'team_lead', 'billing_admin')
  );
$$;

GRANT EXECUTE ON FUNCTION user_is_org_admin(UUID) TO authenticated;

-- Drop and recreate the SELECT policy using the security definer function
DROP POLICY IF EXISTS "View organization members" ON organization_members;

CREATE POLICY "View organization members" ON organization_members
  FOR SELECT
  USING (
    -- Check if the record belongs to the user's organization
    organization_id = get_user_organization_id(auth.uid())
    OR
    -- Users can always see their own record
    user_id = auth.uid()
  );

-- Drop and recreate the management policy
DROP POLICY IF EXISTS "Manage organization members" ON organization_members;

CREATE POLICY "Manage organization members" ON organization_members
  FOR ALL
  USING (
    organization_id = get_user_organization_id(auth.uid())
    AND user_is_org_admin(auth.uid())
  )
  WITH CHECK (
    organization_id = get_user_organization_id(auth.uid())
    AND user_is_org_admin(auth.uid())
  );
