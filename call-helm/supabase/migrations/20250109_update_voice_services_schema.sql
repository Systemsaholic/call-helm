-- Update voice_integrations table for white-label voice services
ALTER TABLE voice_integrations 
ADD COLUMN IF NOT EXISTS voice_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS verified_number TEXT,
ADD COLUMN IF NOT EXISTS forwarding_number TEXT,
ADD COLUMN IF NOT EXISTS verification_status TEXT DEFAULT 'not_verified' CHECK (verification_status IN ('not_verified', 'pending', 'verified')),
ADD COLUMN IF NOT EXISTS verification_code TEXT,
ADD COLUMN IF NOT EXISTS verification_expires_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS number_type TEXT DEFAULT 'own' CHECK (number_type IN ('own', 'platform')),
ADD COLUMN IF NOT EXISTS platform_number_sid TEXT,
ADD COLUMN IF NOT EXISTS enabled_at TIMESTAMPTZ;

-- Create index for verification lookups
CREATE INDEX IF NOT EXISTS idx_voice_verification ON voice_integrations(verification_code, verification_expires_at) 
WHERE verification_status = 'pending';

-- Update phone_numbers table to track platform vs verified numbers
ALTER TABLE phone_numbers
ADD COLUMN IF NOT EXISTS number_source TEXT DEFAULT 'platform' CHECK (number_source IN ('platform', 'verified', 'imported')),
ADD COLUMN IF NOT EXISTS verification_date TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS forwarding_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS forwarding_destination TEXT;

-- Function to enable voice services for an organization
CREATE OR REPLACE FUNCTION enable_voice_services(
  p_org_id UUID,
  p_enabled BOOLEAN DEFAULT true
)
RETURNS JSONB AS $$
DECLARE
  v_result JSONB;
BEGIN
  -- Insert or update voice integration
  INSERT INTO voice_integrations (
    organization_id,
    voice_enabled,
    provider,
    is_active,
    enabled_at,
    recording_enabled,
    voicemail_enabled,
    webhook_url,
    status_callback_url
  ) VALUES (
    p_org_id,
    p_enabled,
    'internal', -- Hide the actual provider
    p_enabled,
    CASE WHEN p_enabled THEN NOW() ELSE NULL END,
    true, -- Recording enabled by default
    true, -- Voicemail enabled by default
    current_setting('app.base_url', true) || '/api/voice/webhook',
    current_setting('app.base_url', true) || '/api/voice/status'
  )
  ON CONFLICT (organization_id) DO UPDATE SET
    voice_enabled = p_enabled,
    is_active = p_enabled,
    enabled_at = CASE WHEN p_enabled AND voice_integrations.enabled_at IS NULL THEN NOW() ELSE voice_integrations.enabled_at END,
    updated_at = NOW();

  -- Return status
  SELECT jsonb_build_object(
    'success', true,
    'enabled', p_enabled,
    'message', CASE WHEN p_enabled THEN 'Voice services enabled' ELSE 'Voice services disabled' END
  ) INTO v_result;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to start phone number verification
CREATE OR REPLACE FUNCTION start_phone_verification(
  p_org_id UUID,
  p_phone_number TEXT
)
RETURNS JSONB AS $$
DECLARE
  v_code TEXT;
  v_result JSONB;
BEGIN
  -- Generate 6-digit verification code
  v_code := LPAD(FLOOR(RANDOM() * 999999)::TEXT, 6, '0');

  -- Update voice integration with verification details
  UPDATE voice_integrations
  SET 
    verified_number = p_phone_number,
    verification_code = v_code,
    verification_status = 'pending',
    verification_expires_at = NOW() + INTERVAL '10 minutes',
    updated_at = NOW()
  WHERE organization_id = p_org_id;

  -- Return verification started status
  SELECT jsonb_build_object(
    'success', true,
    'phone_number', p_phone_number,
    'expires_in_minutes', 10,
    'message', 'Verification code sent'
  ) INTO v_result;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to verify phone number
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
  INSERT INTO phone_numbers (
    organization_id,
    number,
    friendly_name,
    capabilities,
    status,
    is_primary,
    number_source,
    verification_date
  ) VALUES (
    p_org_id,
    v_integration.verified_number,
    'Verified Business Number',
    '{"voice": true, "sms": true}'::jsonb,
    'active',
    true,
    'verified',
    NOW()
  )
  ON CONFLICT (organization_id, number) DO UPDATE SET
    verification_date = NOW(),
    number_source = 'verified',
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

-- Function to get voice services status
CREATE OR REPLACE FUNCTION get_voice_services_status(p_org_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_integration RECORD;
  v_numbers JSONB;
  v_result JSONB;
BEGIN
  -- Get integration details
  SELECT * INTO v_integration
  FROM voice_integrations
  WHERE organization_id = p_org_id;

  -- Get phone numbers
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', id,
      'number', number,
      'friendly_name', friendly_name,
      'is_primary', is_primary,
      'number_source', number_source,
      'status', status
    )
  ) INTO v_numbers
  FROM phone_numbers
  WHERE organization_id = p_org_id
  AND status = 'active';

  -- Build response
  IF v_integration IS NULL THEN
    v_result := jsonb_build_object(
      'enabled', false,
      'configured', false,
      'message', 'Voice services not configured'
    );
  ELSE
    v_result := jsonb_build_object(
      'enabled', v_integration.voice_enabled,
      'configured', true,
      'verified_number', v_integration.verified_number,
      'forwarding_number', v_integration.forwarding_number,
      'verification_status', v_integration.verification_status,
      'number_type', v_integration.number_type,
      'recording_enabled', v_integration.recording_enabled,
      'voicemail_enabled', v_integration.voicemail_enabled,
      'phone_numbers', COALESCE(v_numbers, '[]'::jsonb)
    );
  END IF;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION enable_voice_services TO authenticated;
GRANT EXECUTE ON FUNCTION start_phone_verification TO authenticated;
GRANT EXECUTE ON FUNCTION verify_phone_number TO authenticated;
GRANT EXECUTE ON FUNCTION get_voice_services_status TO authenticated;