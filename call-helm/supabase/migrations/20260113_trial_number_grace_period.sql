-- Migration: Trial Number Grace Period System
-- Description: Adds support for trial numbers with 30-day grace period after trial expiration
-- - Trial numbers are receive-only during grace period
-- - Numbers are released back to SignalWire after grace period ends
-- - Email notifications are triggered at key milestones

-- 1. Add new columns to phone_numbers table
ALTER TABLE phone_numbers
ADD COLUMN IF NOT EXISTS number_type TEXT DEFAULT 'purchased'
  CHECK (number_type IN ('purchased', 'ported', 'trial', 'verified_caller_id')),
ADD COLUMN IF NOT EXISTS grace_period_ends_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS trial_assigned_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS released_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS release_reason TEXT;

-- 2. Update status constraint to include new statuses
-- First drop the old constraint, then add the new one
ALTER TABLE phone_numbers DROP CONSTRAINT IF EXISTS phone_numbers_status_check;
ALTER TABLE phone_numbers ADD CONSTRAINT phone_numbers_status_check
  CHECK (status IN ('active', 'inactive', 'pending', 'grace_period', 'released', 'suspended'));

-- 3. Create index for grace period queries
CREATE INDEX IF NOT EXISTS idx_phone_numbers_grace_period
  ON phone_numbers(grace_period_ends_at)
  WHERE status = 'grace_period';

CREATE INDEX IF NOT EXISTS idx_phone_numbers_number_type
  ON phone_numbers(number_type);

-- 4. Create table for tracking grace period notifications
CREATE TABLE IF NOT EXISTS grace_period_notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  phone_number_id UUID NOT NULL REFERENCES phone_numbers(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  notification_type TEXT NOT NULL CHECK (notification_type IN (
    'trial_ended',
    'grace_14_days',
    'grace_7_days',
    'grace_3_days',
    'grace_1_day',
    'number_released'
  )),
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  email_sent_to TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,

  -- Prevent duplicate notifications
  CONSTRAINT unique_notification_per_number UNIQUE (phone_number_id, notification_type)
);

CREATE INDEX IF NOT EXISTS idx_grace_notifications_org ON grace_period_notifications(organization_id);
CREATE INDEX IF NOT EXISTS idx_grace_notifications_phone ON grace_period_notifications(phone_number_id);

-- Enable RLS
ALTER TABLE grace_period_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Organization members can view grace period notifications"
  ON grace_period_notifications
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id
      FROM organization_members
      WHERE user_id = auth.uid()
    )
  );

-- 5. Function to transition trial numbers to grace period when trial ends
CREATE OR REPLACE FUNCTION transition_trial_numbers_to_grace_period()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  transitioned_count INTEGER := 0;
  phone_record RECORD;
BEGIN
  -- Find all trial numbers belonging to organizations whose trial just ended
  FOR phone_record IN
    SELECT pn.id, pn.number, pn.organization_id, o.name as org_name
    FROM phone_numbers pn
    JOIN organizations o ON pn.organization_id = o.id
    WHERE pn.number_type = 'trial'
    AND pn.status = 'active'
    AND o.subscription_status = 'active'  -- Trial just ended (status changed from 'trialing')
    AND o.subscription_tier = 'free'      -- Downgraded to free tier
    AND pn.grace_period_ends_at IS NULL   -- Not already in grace period
  LOOP
    -- Transition to grace period (30 days)
    UPDATE phone_numbers
    SET
      status = 'grace_period',
      grace_period_ends_at = NOW() + INTERVAL '30 days',
      updated_at = NOW()
    WHERE id = phone_record.id;

    -- Record the notification (will trigger email via webhook/edge function)
    INSERT INTO grace_period_notifications (phone_number_id, organization_id, notification_type, metadata)
    VALUES (
      phone_record.id,
      phone_record.organization_id,
      'trial_ended',
      jsonb_build_object(
        'phone_number', phone_record.number,
        'org_name', phone_record.org_name,
        'grace_period_ends', NOW() + INTERVAL '30 days'
      )
    )
    ON CONFLICT (phone_number_id, notification_type) DO NOTHING;

    transitioned_count := transitioned_count + 1;
    RAISE NOTICE 'Transitioned trial number % to grace period for org %', phone_record.number, phone_record.org_name;
  END LOOP;

  RETURN transitioned_count;
END;
$$;

-- 6. Function to check and send grace period reminder notifications
CREATE OR REPLACE FUNCTION check_grace_period_notifications()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  notification_count INTEGER := 0;
  phone_record RECORD;
  days_remaining INTEGER;
  notification_type TEXT;
BEGIN
  -- Find all numbers in grace period
  FOR phone_record IN
    SELECT pn.id, pn.number, pn.organization_id, pn.grace_period_ends_at, o.name as org_name
    FROM phone_numbers pn
    JOIN organizations o ON pn.organization_id = o.id
    WHERE pn.status = 'grace_period'
    AND pn.grace_period_ends_at IS NOT NULL
  LOOP
    days_remaining := EXTRACT(DAY FROM (phone_record.grace_period_ends_at - NOW()));

    -- Determine which notification to send based on days remaining
    notification_type := NULL;

    IF days_remaining <= 1 AND days_remaining > 0 THEN
      notification_type := 'grace_1_day';
    ELSIF days_remaining <= 3 AND days_remaining > 1 THEN
      notification_type := 'grace_3_days';
    ELSIF days_remaining <= 7 AND days_remaining > 3 THEN
      notification_type := 'grace_7_days';
    ELSIF days_remaining <= 14 AND days_remaining > 7 THEN
      notification_type := 'grace_14_days';
    END IF;

    -- Insert notification if we have one and it hasn't been sent
    IF notification_type IS NOT NULL THEN
      INSERT INTO grace_period_notifications (phone_number_id, organization_id, notification_type, metadata)
      VALUES (
        phone_record.id,
        phone_record.organization_id,
        notification_type,
        jsonb_build_object(
          'phone_number', phone_record.number,
          'org_name', phone_record.org_name,
          'days_remaining', days_remaining,
          'grace_period_ends', phone_record.grace_period_ends_at
        )
      )
      ON CONFLICT (phone_number_id, notification_type) DO NOTHING;

      -- Check if insert actually happened (wasn't a duplicate)
      IF FOUND THEN
        notification_count := notification_count + 1;
      END IF;
    END IF;
  END LOOP;

  RETURN notification_count;
END;
$$;

-- 7. Function to release expired grace period numbers
-- This marks them for release - actual SignalWire API call happens via edge function
CREATE OR REPLACE FUNCTION release_expired_grace_period_numbers()
RETURNS TABLE (
  phone_number_id UUID,
  phone_number TEXT,
  organization_id UUID,
  signalwire_sid TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH released AS (
    UPDATE phone_numbers pn
    SET
      status = 'released',
      released_at = NOW(),
      release_reason = 'grace_period_expired',
      updated_at = NOW()
    WHERE pn.status = 'grace_period'
    AND pn.grace_period_ends_at IS NOT NULL
    AND pn.grace_period_ends_at < NOW()
    RETURNING pn.id, pn.number, pn.organization_id, pn.signalwire_phone_number_sid
  )
  SELECT r.id, r.number, r.organization_id, r.signalwire_phone_number_sid
  FROM released r;

  -- Record release notifications for each released number
  INSERT INTO grace_period_notifications (phone_number_id, organization_id, notification_type, metadata)
  SELECT
    pn.id,
    pn.organization_id,
    'number_released',
    jsonb_build_object(
      'phone_number', pn.number,
      'released_at', NOW()
    )
  FROM phone_numbers pn
  WHERE pn.status = 'released'
  AND pn.released_at = NOW()::DATE  -- Only for numbers just released
  ON CONFLICT (phone_number_id, notification_type) DO NOTHING;
END;
$$;

-- 8. Function to check if a number can send outbound (blocked during grace period)
CREATE OR REPLACE FUNCTION can_phone_number_send_outbound(p_phone_number_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_status TEXT;
  v_number_type TEXT;
BEGIN
  SELECT status, number_type
  INTO v_status, v_number_type
  FROM phone_numbers
  WHERE id = p_phone_number_id;

  -- Can't send if:
  -- 1. Number doesn't exist
  -- 2. Status is not 'active'
  -- 3. Number type is 'verified_caller_id' (voice only)
  IF v_status IS NULL THEN
    RETURN FALSE;
  END IF;

  IF v_status != 'active' THEN
    RETURN FALSE;
  END IF;

  IF v_number_type = 'verified_caller_id' THEN
    RETURN FALSE;
  END IF;

  RETURN TRUE;
END;
$$;

-- 9. Function to check if a number can receive inbound (allowed during grace period)
CREATE OR REPLACE FUNCTION can_phone_number_receive_inbound(p_phone_number_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_status TEXT;
  v_number_type TEXT;
BEGIN
  SELECT status, number_type
  INTO v_status, v_number_type
  FROM phone_numbers
  WHERE id = p_phone_number_id;

  -- Can receive if:
  -- 1. Number exists
  -- 2. Status is 'active' OR 'grace_period'
  -- 3. Not a verified_caller_id (those are outbound voice only)
  IF v_status IS NULL THEN
    RETURN FALSE;
  END IF;

  IF v_status NOT IN ('active', 'grace_period') THEN
    RETURN FALSE;
  END IF;

  IF v_number_type = 'verified_caller_id' THEN
    RETURN FALSE;
  END IF;

  RETURN TRUE;
END;
$$;

-- 10. Update the trial expiration function to also transition numbers
CREATE OR REPLACE FUNCTION check_and_downgrade_expired_trials()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  downgraded_count INTEGER := 0;
  numbers_transitioned INTEGER := 0;
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
    RAISE NOTICE 'Downgraded organization % (%) from trial to free plan', org_record.name, org_record.id;
  END LOOP;

  -- Now transition any trial numbers to grace period
  SELECT transition_trial_numbers_to_grace_period() INTO numbers_transitioned;
  RAISE NOTICE 'Transitioned % trial numbers to grace period', numbers_transitioned;

  RETURN downgraded_count;
END;
$$;

-- 11. Grant permissions
GRANT SELECT ON grace_period_notifications TO authenticated;
GRANT EXECUTE ON FUNCTION transition_trial_numbers_to_grace_period() TO authenticated;
GRANT EXECUTE ON FUNCTION check_grace_period_notifications() TO authenticated;
GRANT EXECUTE ON FUNCTION release_expired_grace_period_numbers() TO authenticated;
GRANT EXECUTE ON FUNCTION can_phone_number_send_outbound(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION can_phone_number_receive_inbound(UUID) TO authenticated;

-- 12. Comments
COMMENT ON COLUMN phone_numbers.number_type IS 'Type of phone number: purchased (from SignalWire), ported (transferred in), trial (temporary for trial users), verified_caller_id (outbound voice only)';
COMMENT ON COLUMN phone_numbers.grace_period_ends_at IS 'When the grace period ends for trial numbers. Number will be released back to SignalWire after this date.';
COMMENT ON COLUMN phone_numbers.trial_assigned_at IS 'When this trial number was assigned to the organization';
COMMENT ON COLUMN phone_numbers.released_at IS 'When this number was released back to the provider';
COMMENT ON TABLE grace_period_notifications IS 'Tracks notifications sent during the grace period to help users retain their trial numbers';
