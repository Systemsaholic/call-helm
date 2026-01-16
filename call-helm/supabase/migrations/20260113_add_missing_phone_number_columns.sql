-- Migration: Add missing columns to phone_numbers table
-- Description: Adds number_type, forwarding_enabled, forwarding_destination, and grace_period_ends_at columns
-- Required by PhoneNumberManagement.tsx

-- Add missing columns to phone_numbers table
ALTER TABLE phone_numbers
ADD COLUMN IF NOT EXISTS number_type TEXT DEFAULT 'purchased' CHECK (number_type IN ('purchased', 'ported', 'verified', 'toll_free', 'local', 'mobile')),
ADD COLUMN IF NOT EXISTS forwarding_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS forwarding_destination TEXT,
ADD COLUMN IF NOT EXISTS grace_period_ends_at TIMESTAMPTZ;

-- Add index for forwarding queries
CREATE INDEX IF NOT EXISTS idx_phone_numbers_forwarding ON phone_numbers(forwarding_enabled) WHERE forwarding_enabled = true;

-- Add comment
COMMENT ON COLUMN phone_numbers.number_type IS 'Type of phone number: purchased, ported, verified, toll_free, local, mobile';
COMMENT ON COLUMN phone_numbers.forwarding_enabled IS 'Whether call forwarding is enabled for this number';
COMMENT ON COLUMN phone_numbers.forwarding_destination IS 'Phone number to forward calls to when forwarding is enabled';
COMMENT ON COLUMN phone_numbers.grace_period_ends_at IS 'End date of grace period before number is released after cancellation';
