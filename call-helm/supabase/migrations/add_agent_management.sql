-- Update organization_members table with status and invitation tracking
ALTER TABLE organization_members ADD COLUMN IF NOT EXISTS
  status VARCHAR(50) DEFAULT 'pending_invitation' 
  CHECK (status IN ('pending_invitation', 'invited', 'active', 'inactive', 'suspended'));

ALTER TABLE organization_members ADD COLUMN IF NOT EXISTS
  invited_at TIMESTAMPTZ;

ALTER TABLE organization_members ADD COLUMN IF NOT EXISTS
  joined_at TIMESTAMPTZ;

ALTER TABLE organization_members ADD COLUMN IF NOT EXISTS
  full_name VARCHAR(255);

ALTER TABLE organization_members ADD COLUMN IF NOT EXISTS
  email VARCHAR(255);

ALTER TABLE organization_members ADD COLUMN IF NOT EXISTS
  phone VARCHAR(50);

ALTER TABLE organization_members ADD COLUMN IF NOT EXISTS
  bio TEXT;

ALTER TABLE organization_members ADD COLUMN IF NOT EXISTS
  avatar_url TEXT;

-- Track invitation history
CREATE TABLE IF NOT EXISTS agent_invitations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_member_id UUID REFERENCES organization_members(id) ON DELETE CASCADE,
  invited_by UUID REFERENCES organization_members(id),
  invitation_token TEXT,
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  accepted_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '7 days',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Departments table
CREATE TABLE IF NOT EXISTS departments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add department foreign key to organization_members if not exists
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'organization_members' 
    AND column_name = 'department_id'
  ) THEN
    ALTER TABLE organization_members 
    ADD COLUMN department_id UUID REFERENCES departments(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_org_members_status ON organization_members(status);
CREATE INDEX IF NOT EXISTS idx_org_members_email ON organization_members(email);
CREATE INDEX IF NOT EXISTS idx_agent_invitations_member ON agent_invitations(organization_member_id);

-- RLS Policies for agent_invitations
ALTER TABLE agent_invitations ENABLE ROW LEVEL SECURITY;

-- Org admins and team leads can view invitations for their organization
CREATE POLICY "View organization invitations" ON agent_invitations
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.user_id = auth.uid()
      AND om.organization_id = (
        SELECT organization_id FROM organization_members
        WHERE id = agent_invitations.organization_member_id
      )
      AND om.role IN ('org_admin', 'team_lead')
    )
  );

-- Org admins can create invitations
CREATE POLICY "Create invitations" ON agent_invitations
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.user_id = auth.uid()
      AND om.organization_id = (
        SELECT organization_id FROM organization_members
        WHERE id = agent_invitations.organization_member_id
      )
      AND om.role = 'org_admin'
    )
  );

-- RLS for departments
ALTER TABLE departments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View departments" ON departments
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM organization_members
      WHERE user_id = auth.uid()
      AND organization_id = departments.organization_id
    )
  );

CREATE POLICY "Manage departments" ON departments
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM organization_members
      WHERE user_id = auth.uid()
      AND organization_id = departments.organization_id
      AND role IN ('org_admin', 'team_lead')
    )
  );

-- Update RLS for organization_members to handle pending agents
DROP POLICY IF EXISTS "View organization members" ON organization_members;
CREATE POLICY "View organization members" ON organization_members
  FOR SELECT
  USING (
    -- Users can see members of their organization
    organization_id IN (
      SELECT organization_id FROM organization_members 
      WHERE user_id = auth.uid()
    )
    OR
    -- Users can see their own membership
    user_id = auth.uid()
  );

-- Org admins can manage all members
DROP POLICY IF EXISTS "Manage organization members" ON organization_members;
CREATE POLICY "Manage organization members" ON organization_members
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.user_id = auth.uid()
      AND om.organization_id = organization_members.organization_id
      AND om.role = 'org_admin'
    )
  );