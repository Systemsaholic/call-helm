-- Add payment failure tracking columns to organizations table
-- These columns track payment failures, grace periods, and account suspension

-- Add payment_failed_at column (timestamp of first payment failure)
ALTER TABLE organizations
ADD COLUMN IF NOT EXISTS payment_failed_at TIMESTAMPTZ;

-- Add suspension_scheduled_at column (when account will be suspended if payment not received)
ALTER TABLE organizations
ADD COLUMN IF NOT EXISTS suspension_scheduled_at TIMESTAMPTZ;

-- Add suspended_at column (when account was actually suspended)
ALTER TABLE organizations
ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ;

-- Add index for efficient querying of accounts needing suspension
CREATE INDEX IF NOT EXISTS idx_organizations_suspension_scheduled
ON organizations (suspension_scheduled_at)
WHERE subscription_status = 'past_due' AND suspension_scheduled_at IS NOT NULL;

-- Add 'suspended' to the subscription_status check constraint if not already present
-- First, check if the constraint exists and what values it allows
DO $$
BEGIN
  -- Drop the existing constraint if it exists
  ALTER TABLE organizations DROP CONSTRAINT IF EXISTS organizations_subscription_status_check;

  -- Add the new constraint with 'suspended' included
  ALTER TABLE organizations ADD CONSTRAINT organizations_subscription_status_check
    CHECK (subscription_status IN ('active', 'trialing', 'past_due', 'canceled', 'unpaid', 'suspended', 'incomplete', 'incomplete_expired'));
EXCEPTION
  WHEN others THEN
    -- If constraint doesn't exist or can't be modified, just continue
    RAISE NOTICE 'Could not modify subscription_status constraint: %', SQLERRM;
END $$;

-- Add comment explaining the columns
COMMENT ON COLUMN organizations.payment_failed_at IS 'Timestamp of the first payment failure in the current past_due period';
COMMENT ON COLUMN organizations.suspension_scheduled_at IS 'When the account will be suspended if payment is not received (grace period end)';
COMMENT ON COLUMN organizations.suspended_at IS 'When the account was actually suspended due to non-payment';
