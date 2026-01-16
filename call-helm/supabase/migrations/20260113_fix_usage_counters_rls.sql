-- Fix RLS policy for usage_counters table
-- This migration adds proper RLS policies to allow authenticated users to
-- manage usage counters for their organization

-- First, check if RLS is enabled and enable it if not
ALTER TABLE usage_counters ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "Users can view own org usage counters" ON usage_counters;
DROP POLICY IF EXISTS "Users can insert own org usage counters" ON usage_counters;
DROP POLICY IF EXISTS "Users can update own org usage counters" ON usage_counters;
DROP POLICY IF EXISTS "Service role can manage all usage counters" ON usage_counters;

-- Create policy for SELECT - users can view their organization's usage counters
CREATE POLICY "Users can view own org usage counters"
ON usage_counters
FOR SELECT
TO authenticated
USING (
  organization_id IN (
    SELECT organization_id FROM organization_members
    WHERE user_id = auth.uid()
  )
);

-- Create policy for INSERT - users can insert usage counters for their organization
CREATE POLICY "Users can insert own org usage counters"
ON usage_counters
FOR INSERT
TO authenticated
WITH CHECK (
  organization_id IN (
    SELECT organization_id FROM organization_members
    WHERE user_id = auth.uid()
  )
);

-- Create policy for UPDATE - users can update usage counters for their organization
CREATE POLICY "Users can update own org usage counters"
ON usage_counters
FOR UPDATE
TO authenticated
USING (
  organization_id IN (
    SELECT organization_id FROM organization_members
    WHERE user_id = auth.uid()
  )
)
WITH CHECK (
  organization_id IN (
    SELECT organization_id FROM organization_members
    WHERE user_id = auth.uid()
  )
);

-- Also create a policy for service role (full access)
CREATE POLICY "Service role can manage all usage counters"
ON usage_counters
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Add unique constraint if it doesn't exist (needed for upsert operations)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'usage_counters_org_period_unique'
  ) THEN
    ALTER TABLE usage_counters
    ADD CONSTRAINT usage_counters_org_period_unique
    UNIQUE (organization_id, current_period_start);
  END IF;
EXCEPTION
  WHEN duplicate_table THEN
    NULL; -- Constraint already exists
END $$;

-- Grant permissions to authenticated users
GRANT SELECT, INSERT, UPDATE ON usage_counters TO authenticated;

-- Add comment
COMMENT ON TABLE usage_counters IS 'Tracks current usage metrics per organization per billing period';
