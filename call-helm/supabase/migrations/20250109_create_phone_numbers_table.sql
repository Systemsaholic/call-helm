-- Create phone_numbers table
CREATE TABLE IF NOT EXISTS phone_numbers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  number TEXT NOT NULL,
  friendly_name TEXT NOT NULL,
  capabilities JSONB DEFAULT '{"voice": true, "sms": false, "mms": false, "fax": false}'::jsonb,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'pending')),
  is_primary BOOLEAN DEFAULT false,
  provider TEXT DEFAULT 'signalwire',
  provider_id TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Ensure only one primary number per organization
  CONSTRAINT unique_primary_per_org EXCLUDE USING btree (organization_id WITH =) WHERE (is_primary = true),
  -- Ensure unique phone numbers per organization
  CONSTRAINT unique_phone_per_org UNIQUE (organization_id, number)
);

-- Create indexes
CREATE INDEX idx_phone_numbers_org ON phone_numbers(organization_id);
CREATE INDEX idx_phone_numbers_status ON phone_numbers(status);
CREATE INDEX idx_phone_numbers_primary ON phone_numbers(organization_id, is_primary) WHERE is_primary = true;

-- Add RLS policies
ALTER TABLE phone_numbers ENABLE ROW LEVEL SECURITY;

-- Policy for organization members to view phone numbers
CREATE POLICY "Organization members can view phone numbers"
  ON phone_numbers
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id 
      FROM organization_members 
      WHERE user_id = auth.uid()
    )
  );

-- Policy for org admins to manage phone numbers
CREATE POLICY "Organization admins can manage phone numbers"
  ON phone_numbers
  FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id 
      FROM organization_members 
      WHERE user_id = auth.uid() 
      AND role IN ('org_admin', 'super_admin')
    )
  );

-- Add default_caller_id to voice_integrations if not exists
ALTER TABLE voice_integrations 
ADD COLUMN IF NOT EXISTS default_caller_id TEXT;

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_phone_numbers_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at
CREATE TRIGGER update_phone_numbers_updated_at
  BEFORE UPDATE ON phone_numbers
  FOR EACH ROW
  EXECUTE FUNCTION update_phone_numbers_updated_at();

-- Function to ensure at least one primary number
CREATE OR REPLACE FUNCTION ensure_primary_phone_number()
RETURNS TRIGGER AS $$
BEGIN
  -- If this is the first number for the organization, make it primary
  IF NOT EXISTS (
    SELECT 1 FROM phone_numbers 
    WHERE organization_id = NEW.organization_id 
    AND id != NEW.id
  ) THEN
    NEW.is_primary = true;
  END IF;
  
  -- If deleting the primary number, make another one primary
  IF TG_OP = 'DELETE' AND OLD.is_primary = true THEN
    UPDATE phone_numbers 
    SET is_primary = true 
    WHERE organization_id = OLD.organization_id 
    AND id != OLD.id 
    LIMIT 1;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to ensure primary phone number
CREATE TRIGGER ensure_primary_phone_number_insert
  BEFORE INSERT ON phone_numbers
  FOR EACH ROW
  EXECUTE FUNCTION ensure_primary_phone_number();

CREATE TRIGGER ensure_primary_phone_number_delete
  AFTER DELETE ON phone_numbers
  FOR EACH ROW
  EXECUTE FUNCTION ensure_primary_phone_number();