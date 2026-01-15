-- Add broadcast permission to organization_members
-- By default, only org_admin and team_lead have broadcast access
-- Individual users can be granted permission via can_broadcast = true

-- Add the can_broadcast column
ALTER TABLE organization_members
ADD COLUMN IF NOT EXISTS can_broadcast BOOLEAN DEFAULT FALSE;

-- Grant broadcast permission to existing org_admins and team_leads
UPDATE organization_members
SET can_broadcast = TRUE
WHERE role IN ('org_admin', 'team_lead');

-- Add comment for documentation
COMMENT ON COLUMN organization_members.can_broadcast IS 'Whether this member can create and send SMS broadcasts. Defaults to TRUE for org_admin and team_lead roles.';

-- Create index for faster permission lookups
CREATE INDEX IF NOT EXISTS idx_organization_members_can_broadcast
ON organization_members(organization_id, can_broadcast)
WHERE can_broadcast = TRUE;
