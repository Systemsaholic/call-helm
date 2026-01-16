-- Add ein_encrypted column to campaign_registry_brands table
-- This tracks whether the EIN is stored encrypted (using AES-256-GCM)

ALTER TABLE campaign_registry_brands
ADD COLUMN IF NOT EXISTS ein_encrypted BOOLEAN DEFAULT false;

-- Add comment explaining the column
COMMENT ON COLUMN campaign_registry_brands.ein_encrypted IS 'Whether the ein_tax_id is encrypted. If true, value is in format iv:authTag:ciphertext (base64)';

-- Update any existing records to mark them as unencrypted
UPDATE campaign_registry_brands
SET ein_encrypted = false
WHERE ein_encrypted IS NULL;

-- Make the column NOT NULL after setting defaults
ALTER TABLE campaign_registry_brands
ALTER COLUMN ein_encrypted SET NOT NULL;
