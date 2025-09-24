-- Add organization-level control for agent recording toggle
-- This setting determines if agents can toggle recording on/off themselves

-- Add column to organization_settings table
ALTER TABLE organization_settings 
ADD COLUMN IF NOT EXISTS allow_agents_toggle_recording BOOLEAN DEFAULT false;

-- Add comment to document the column
COMMENT ON COLUMN organization_settings.allow_agents_toggle_recording IS 'Controls whether agents can toggle call recording on/off. If false, only admins can change recording settings.';

-- Set default value for existing organizations (allow by default for backward compatibility)
UPDATE organization_settings 
SET allow_agents_toggle_recording = true
WHERE allow_agents_toggle_recording IS NULL;