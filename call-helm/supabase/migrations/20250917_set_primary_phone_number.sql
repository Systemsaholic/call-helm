-- Migration: Add RPC to atomically set primary phone number for an organization
-- This function is used by server code to avoid two-step race conditions when
-- setting or changing the primary phone number.

CREATE OR REPLACE FUNCTION set_primary_phone_number(
  p_organization_id UUID,
  p_number_id UUID DEFAULT NULL,
  p_is_primary BOOLEAN DEFAULT true,
  p_number TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_target_id UUID;
  v_exists INT;
  v_result JSONB;
BEGIN
  -- Determine target phone_number id: prefer p_number_id, fall back to lookup by p_number
  IF p_number_id IS NOT NULL THEN
    v_target_id := p_number_id;
  ELSIF p_number IS NOT NULL THEN
    SELECT id INTO v_target_id FROM phone_numbers
    WHERE organization_id = p_organization_id AND number = p_number
    LIMIT 1;
  ELSE
    -- Nothing to do
    RETURN jsonb_build_object('success', false, 'error', 'No target provided');
  END IF;

  IF v_target_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Phone number not found');
  END IF;

  -- Ensure the target belongs to the organization
  SELECT COUNT(1) INTO v_exists FROM phone_numbers
  WHERE id = v_target_id AND organization_id = p_organization_id;

  IF v_exists = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Phone number does not belong to organization');
  END IF;

  -- Perform the update atomically
  BEGIN
    UPDATE phone_numbers
    SET is_primary = FALSE
    WHERE organization_id = p_organization_id AND is_primary = TRUE;

    UPDATE phone_numbers
    SET is_primary = p_is_primary
    WHERE id = v_target_id;

    -- Optionally update voice_integrations.default_caller_id to the selected number
    UPDATE voice_integrations
    SET default_caller_id = (SELECT number FROM phone_numbers WHERE id = v_target_id)
    WHERE organization_id = p_organization_id;

    v_result := jsonb_build_object('success', true, 'phone_id', v_target_id);
    RETURN v_result;
  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
  END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION set_primary_phone_number(UUID, UUID, BOOLEAN, TEXT) TO authenticated;
