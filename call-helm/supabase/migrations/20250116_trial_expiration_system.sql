-- Migration: Set up trial expiration system
-- Description: Sets trial end dates and creates automatic downgrade functionality

-- 1. Update existing trialing organizations to have trial_ends_at set to 14 days from creation
UPDATE organizations 
SET trial_ends_at = created_at + INTERVAL '14 days'
WHERE subscription_status = 'trialing' 
AND trial_ends_at IS NULL;

-- 2. Create function to check and downgrade expired trials
CREATE OR REPLACE FUNCTION check_and_downgrade_expired_trials()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  downgraded_count INTEGER := 0;
  org_record RECORD;
  free_plan_id UUID;
BEGIN
  -- Get the free plan ID
  SELECT id INTO free_plan_id 
  FROM subscription_plans 
  WHERE slug = 'free' 
  LIMIT 1;
  
  -- Check if free plan exists
  IF free_plan_id IS NULL THEN
    RAISE EXCEPTION 'Free plan not found in subscription_plans table';
  END IF;
  
  -- Find all organizations with expired trials
  FOR org_record IN 
    SELECT id, name, trial_ends_at 
    FROM organizations 
    WHERE subscription_status = 'trialing' 
    AND trial_ends_at IS NOT NULL 
    AND trial_ends_at < NOW()
  LOOP
    -- Downgrade to free plan
    UPDATE organizations 
    SET 
      subscription_plan_id = free_plan_id,
      subscription_tier = 'free',
      subscription_status = 'active',
      updated_at = NOW()
    WHERE id = org_record.id;
    
    downgraded_count := downgraded_count + 1;
    
    -- Log the downgrade (optional - you can create an audit table for this)
    RAISE NOTICE 'Downgraded organization % (%) from trial to free plan', org_record.name, org_record.id;
  END LOOP;
  
  RETURN downgraded_count;
END;
$$;

-- 3. Create a trigger to set trial_ends_at when organization is created with trial status
CREATE OR REPLACE FUNCTION set_trial_end_date()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- If creating a new organization with trialing status and no trial_ends_at
  IF NEW.subscription_status = 'trialing' AND NEW.trial_ends_at IS NULL THEN
    NEW.trial_ends_at := NOW() + INTERVAL '14 days';
  END IF;
  RETURN NEW;
END;
$$;

-- Create trigger for new organizations
DROP TRIGGER IF EXISTS set_trial_end_date_trigger ON organizations;
CREATE TRIGGER set_trial_end_date_trigger
BEFORE INSERT ON organizations
FOR EACH ROW
EXECUTE FUNCTION set_trial_end_date();

-- 4. Create a function that can be called from your application periodically
-- This checks trials on every call to organization limits
CREATE OR REPLACE FUNCTION get_organization_limits_with_trial_check(org_id UUID)
RETURNS TABLE (
  organization_id UUID,
  plan_slug TEXT,
  plan_display_name TEXT,
  subscription_status TEXT,
  badge_text TEXT,
  max_agents INTEGER,
  max_contacts INTEGER,
  max_call_minutes INTEGER,
  max_sms_messages INTEGER,
  max_campaigns INTEGER,
  max_storage_gb INTEGER,
  current_agents BIGINT,
  current_contacts BIGINT,
  current_campaigns BIGINT,
  used_call_minutes NUMERIC,
  used_sms_messages BIGINT,
  agents_percentage NUMERIC,
  contacts_percentage NUMERIC,
  call_minutes_percentage NUMERIC,
  balance NUMERIC,
  low_balance_threshold NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  free_plan_id UUID;
BEGIN
  -- First check if this organization's trial has expired
  IF EXISTS (
    SELECT 1 FROM organizations 
    WHERE id = org_id 
    AND subscription_status = 'trialing' 
    AND trial_ends_at IS NOT NULL 
    AND trial_ends_at < NOW()
  ) THEN
    -- Get free plan ID
    SELECT id INTO free_plan_id FROM subscription_plans WHERE slug = 'free' LIMIT 1;
    
    -- Downgrade to free plan
    UPDATE organizations 
    SET 
      subscription_plan_id = free_plan_id,
      subscription_tier = 'free',
      subscription_status = 'active',
      updated_at = NOW()
    WHERE id = org_id;
  END IF;
  
  -- Return the organization limits (existing function logic)
  RETURN QUERY
  SELECT * FROM get_organization_limits(org_id);
END;
$$;

-- 5. Optional: Create a scheduled job using pg_cron (requires pg_cron extension)
-- Note: pg_cron needs to be enabled by Supabase support for your project
-- Uncomment if pg_cron is available:
/*
SELECT cron.schedule(
  'check-expired-trials',
  '0 0 * * *', -- Run daily at midnight
  $$SELECT check_and_downgrade_expired_trials();$$
);
*/

-- 6. Add comment explaining the trial system
COMMENT ON COLUMN organizations.trial_ends_at IS 
'The date and time when the trial period ends. Organizations are automatically downgraded to free plan when this date passes.';