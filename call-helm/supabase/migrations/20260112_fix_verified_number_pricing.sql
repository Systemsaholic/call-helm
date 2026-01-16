-- Fix verified number pricing
-- User-owned verified numbers should not have platform fees

-- Update verify_phone_number function to set monthly_cost = 0
CREATE OR REPLACE FUNCTION verify_phone_number(
  p_org_id UUID,
  p_code TEXT
)
RETURNS JSONB AS $$
DECLARE
  v_integration RECORD;
  v_result JSONB;
BEGIN
  -- Get current verification details
  SELECT * INTO v_integration
  FROM voice_integrations
  WHERE organization_id = p_org_id
    AND verification_code = p_code
    AND verification_status = 'pending'
    AND verification_expires_at > NOW();

  IF v_integration IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Invalid or expired verification code'
    );
  END IF;

  -- Mark as verified
  UPDATE voice_integrations
  SET
    verification_status = 'verified',
    verification_code = NULL,
    verification_expires_at = NULL,
    number_type = 'own',
    updated_at = NOW()
  WHERE organization_id = p_org_id;

  -- Create phone number record for verified number
  -- Note: User-owned verified numbers have no platform fee (monthly_cost = 0)
  INSERT INTO phone_numbers (
    organization_id,
    number,
    friendly_name,
    capabilities,
    status,
    verification_status,
    is_primary,
    number_source,
    monthly_cost,
    verification_date
  ) VALUES (
    p_org_id,
    v_integration.verified_number,
    'Verified Business Number',
    '{"voice": true, "sms": true}'::jsonb,
    'active',
    'verified',
    true,
    'verified',
    0,  -- No platform fee for user-owned numbers
    NOW()
  )
  ON CONFLICT (organization_id, number) DO UPDATE SET
    verification_date = NOW(),
    number_source = 'verified',
    verification_status = 'verified',
    monthly_cost = 0,  -- No platform fee for user-owned numbers
    status = 'active';

  -- Return success
  SELECT jsonb_build_object(
    'success', true,
    'verified_number', v_integration.verified_number,
    'message', 'Phone number verified successfully'
  ) INTO v_result;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update any existing verified/imported numbers to have correct pricing
UPDATE phone_numbers
SET
  monthly_cost = 0,
  number_source = COALESCE(number_source, 'verified')
WHERE
  number_source IN ('verified', 'imported')
  OR (number_source IS NULL AND verification_date IS NOT NULL);

-- Ensure new verified numbers always have $0 cost
COMMENT ON COLUMN phone_numbers.monthly_cost IS 'Monthly platform fee. $0 for verified/imported (user-owned) numbers, actual cost for platform-purchased numbers.';
