-- Add onboarding progress tracking to organizations
-- Migration: Add onboarding_progress column to track setup completion

-- Add JSONB column to store onboarding progress
ALTER TABLE organizations
ADD COLUMN IF NOT EXISTS onboarding_progress JSONB DEFAULT '{
  "invite_team": false,
  "add_contacts": false,
  "create_campaign": false,
  "make_first_call": false,
  "dismissed": false,
  "dismissed_at": null
}'::jsonb;

-- Add comment to document the column
COMMENT ON COLUMN organizations.onboarding_progress IS 'Tracks organization onboarding checklist progress';

-- Create function to check if onboarding is complete
CREATE OR REPLACE FUNCTION is_onboarding_complete(progress JSONB)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN (
    (progress->>'invite_team')::boolean = true AND
    (progress->>'add_contacts')::boolean = true AND
    (progress->>'create_campaign')::boolean = true AND
    (progress->>'make_first_call')::boolean = true
  );
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Create index for organizations that haven't completed onboarding
CREATE INDEX IF NOT EXISTS idx_organizations_onboarding_incomplete
ON organizations((onboarding_progress->>'dismissed'))
WHERE (onboarding_progress->>'dismissed')::boolean = false;
