-- Migration: Fix phone number limits in organization_limits view
-- Description: Ensures max_phone_numbers is properly exposed and only counts platform-purchased numbers
-- Verified/imported numbers (user-owned) do NOT count towards the plan limit

-- Drop existing view to handle column type changes
DROP VIEW IF EXISTS organization_limits CASCADE;

-- Recreate the organization_limits view with correct phone number counting
CREATE VIEW organization_limits AS
SELECT
  o.id AS organization_id,
  o.name AS organization_name,
  o.subscription_status,
  o.trial_ends_at,
  COALESCE(sp.slug, o.subscription_tier::text) AS plan_slug,
  COALESCE(sp.name, 'Free') AS plan_name,
  COALESCE(sp.name, 'Free') AS plan_display_name,
  COALESCE(sp.price_monthly, 0) AS price_monthly,
  -- Limits from subscription plan
  COALESCE((sp.features->>'max_agents')::INTEGER, 2) AS max_agents,
  COALESCE((sp.features->>'max_contacts')::INTEGER, 100) AS max_contacts,
  COALESCE((sp.features->>'max_call_minutes')::INTEGER, 0) AS max_call_minutes,
  COALESCE((sp.features->>'max_sms_messages')::INTEGER, 0) AS max_sms_messages,
  COALESCE((sp.features->>'max_campaigns')::INTEGER, 1) AS max_campaigns,
  COALESCE((sp.features->>'max_storage_gb')::INTEGER, 1) AS max_storage_gb,
  -- Phone numbers limit from plan features
  COALESCE((sp.features->>'max_phone_numbers')::INTEGER, 0) AS max_phone_numbers,
  COALESCE((sp.features->>'max_ai_tokens_per_month')::INTEGER, 0) AS max_ai_tokens_per_month,
  COALESCE((sp.features->>'max_transcription_minutes_per_month')::INTEGER, 0) AS max_transcription_minutes_per_month,
  COALESCE((sp.features->>'max_ai_analysis_per_month')::INTEGER, 0) AS max_ai_analysis_per_month,
  -- Features as JSONB
  COALESCE(sp.features, '{}'::jsonb) AS features,
  sp.badge_text,
  -- Current counts
  COALESCE(agent_count.count, 0)::INTEGER AS current_agents,
  COALESCE(contact_count.count, 0)::INTEGER AS current_contacts,
  COALESCE(campaign_count.count, 0)::INTEGER AS current_campaigns,
  -- Only count platform-purchased numbers (NOT verified/imported user-owned numbers)
  COALESCE(phone_count.count, 0)::INTEGER AS current_phone_numbers,
  -- Usage for current billing period
  COALESCE(call_usage.amount, 0)::NUMERIC AS used_call_minutes,
  COALESCE(sms_usage.amount, 0)::INTEGER AS used_sms_messages,
  COALESCE(ai_usage.amount, 0)::INTEGER AS used_ai_tokens,
  COALESCE(transcription_usage.amount, 0)::NUMERIC AS used_transcription_minutes,
  COALESCE(analysis_usage.amount, 0)::INTEGER AS used_ai_analysis,
  -- Percentage calculations
  CASE
    WHEN COALESCE((sp.features->>'max_call_minutes')::INTEGER, 0) > 0
    THEN ROUND((COALESCE(call_usage.amount, 0) / (sp.features->>'max_call_minutes')::NUMERIC) * 100, 2)
    ELSE 0
  END AS call_minutes_percentage,
  CASE
    WHEN COALESCE((sp.features->>'max_contacts')::INTEGER, 0) > 0
    THEN ROUND((COALESCE(contact_count.count, 0) / (sp.features->>'max_contacts')::NUMERIC) * 100, 2)
    ELSE 0
  END AS contacts_percentage,
  CASE
    WHEN COALESCE((sp.features->>'max_agents')::INTEGER, 0) > 0
    THEN ROUND((COALESCE(agent_count.count, 0) / (sp.features->>'max_agents')::NUMERIC) * 100, 2)
    ELSE 0
  END AS agents_percentage,
  -- Phone numbers percentage
  CASE
    WHEN COALESCE((sp.features->>'max_phone_numbers')::INTEGER, 0) > 0
    THEN ROUND((COALESCE(phone_count.count, 0) / (sp.features->>'max_phone_numbers')::NUMERIC) * 100, 2)
    ELSE 0
  END AS phone_numbers_percentage,
  CASE
    WHEN COALESCE((sp.features->>'max_ai_tokens_per_month')::INTEGER, 0) > 0
    THEN ROUND((COALESCE(ai_usage.amount, 0) / (sp.features->>'max_ai_tokens_per_month')::NUMERIC) * 100, 2)
    ELSE 0
  END AS ai_tokens_percentage,
  CASE
    WHEN COALESCE((sp.features->>'max_transcription_minutes_per_month')::INTEGER, 0) > 0
    THEN ROUND((COALESCE(transcription_usage.amount, 0) / (sp.features->>'max_transcription_minutes_per_month')::NUMERIC) * 100, 2)
    ELSE 0
  END AS transcription_percentage,
  CASE
    WHEN COALESCE((sp.features->>'max_ai_analysis_per_month')::INTEGER, 0) > 0
    THEN ROUND((COALESCE(analysis_usage.amount, 0) / (sp.features->>'max_ai_analysis_per_month')::NUMERIC) * 100, 2)
    ELSE 0
  END AS ai_analysis_percentage
FROM organizations o
LEFT JOIN subscription_plans sp ON o.subscription_plan_id = sp.id
-- Agent count
LEFT JOIN (
  SELECT organization_id, COUNT(*) as count
  FROM organization_members
  WHERE status IN ('active', 'invited')
  GROUP BY organization_id
) agent_count ON o.id = agent_count.organization_id
-- Contact count
LEFT JOIN (
  SELECT organization_id, COUNT(*) as count
  FROM contacts
  GROUP BY organization_id
) contact_count ON o.id = contact_count.organization_id
-- Campaign count
LEFT JOIN (
  SELECT organization_id, COUNT(*) as count
  FROM call_lists
  WHERE status != 'archived'
  GROUP BY organization_id
) campaign_count ON o.id = campaign_count.organization_id
-- Phone number count - ONLY platform-purchased numbers, NOT verified/imported
LEFT JOIN (
  SELECT organization_id, COUNT(*) as count
  FROM phone_numbers
  WHERE status = 'active'
    AND (number_source = 'platform' OR number_source IS NULL)
  GROUP BY organization_id
) phone_count ON o.id = phone_count.organization_id
-- Call minutes usage (current month)
LEFT JOIN (
  SELECT organization_id, SUM(amount) as amount
  FROM usage_events
  WHERE resource_type = 'call_minutes'
  AND created_at >= date_trunc('month', CURRENT_DATE)
  GROUP BY organization_id
) call_usage ON o.id = call_usage.organization_id
-- SMS usage (current month)
LEFT JOIN (
  SELECT organization_id, SUM(amount) as amount
  FROM usage_events
  WHERE resource_type = 'sms_messages'
  AND created_at >= date_trunc('month', CURRENT_DATE)
  GROUP BY organization_id
) sms_usage ON o.id = sms_usage.organization_id
-- AI tokens usage (current month)
LEFT JOIN (
  SELECT organization_id, SUM(amount) as amount
  FROM usage_events
  WHERE resource_type = 'ai_tokens'
  AND created_at >= date_trunc('month', CURRENT_DATE)
  GROUP BY organization_id
) ai_usage ON o.id = ai_usage.organization_id
-- Transcription usage (current month)
LEFT JOIN (
  SELECT organization_id, SUM(amount) as amount
  FROM usage_events
  WHERE resource_type = 'transcription_minutes'
  AND created_at >= date_trunc('month', CURRENT_DATE)
  GROUP BY organization_id
) transcription_usage ON o.id = transcription_usage.organization_id
-- AI analysis usage (current month)
LEFT JOIN (
  SELECT organization_id, SUM(amount) as amount
  FROM usage_events
  WHERE resource_type = 'ai_analysis_requests'
  AND created_at >= date_trunc('month', CURRENT_DATE)
  GROUP BY organization_id
) analysis_usage ON o.id = analysis_usage.organization_id;

-- Update the check_usage_limit function to handle phone_numbers correctly
CREATE OR REPLACE FUNCTION check_usage_limit(
  p_organization_id UUID,
  p_resource_type TEXT,
  p_amount INTEGER DEFAULT 1
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_limit INTEGER;
  v_used NUMERIC;
  v_available NUMERIC;
  v_can_use BOOLEAN;
  v_percentage NUMERIC;
BEGIN
  -- Get limit and current usage from the view
  SELECT
    CASE p_resource_type
      WHEN 'agents' THEN ol.max_agents
      WHEN 'contacts' THEN ol.max_contacts
      WHEN 'call_minutes' THEN ol.max_call_minutes
      WHEN 'sms_messages' THEN ol.max_sms_messages
      WHEN 'campaigns' THEN ol.max_campaigns
      WHEN 'phone_numbers' THEN ol.max_phone_numbers
      WHEN 'ai_tokens' THEN ol.max_ai_tokens_per_month
      WHEN 'transcription_minutes' THEN ol.max_transcription_minutes_per_month
      WHEN 'ai_analysis_requests' THEN ol.max_ai_analysis_per_month
      ELSE 0
    END,
    CASE p_resource_type
      WHEN 'agents' THEN ol.current_agents
      WHEN 'contacts' THEN ol.current_contacts
      WHEN 'call_minutes' THEN ol.used_call_minutes
      WHEN 'sms_messages' THEN ol.used_sms_messages
      WHEN 'campaigns' THEN ol.current_campaigns
      WHEN 'phone_numbers' THEN ol.current_phone_numbers
      WHEN 'ai_tokens' THEN ol.used_ai_tokens
      WHEN 'transcription_minutes' THEN ol.used_transcription_minutes
      WHEN 'ai_analysis_requests' THEN ol.used_ai_analysis
      ELSE 0
    END
  INTO v_limit, v_used
  FROM organization_limits ol
  WHERE ol.organization_id = p_organization_id;

  -- Calculate available and percentage
  v_available := GREATEST(0, v_limit - v_used);
  v_percentage := CASE
    WHEN v_limit > 0 THEN ROUND((v_used / v_limit) * 100, 2)
    ELSE 0
  END;

  -- Check if the requested amount can be used
  -- Unlimited plans have limits >= 999999
  v_can_use := v_limit >= 999999 OR (v_used + p_amount) <= v_limit;

  RETURN jsonb_build_object(
    'can_use', v_can_use,
    'limit', COALESCE(v_limit, 0),
    'used', COALESCE(v_used, 0),
    'available', COALESCE(v_available, 0),
    'requested', p_amount,
    'percentage', COALESCE(v_percentage, 0),
    'resource_type', p_resource_type
  );
END;
$$;

-- Grant permissions
GRANT SELECT ON organization_limits TO authenticated;
GRANT EXECUTE ON FUNCTION check_usage_limit(UUID, TEXT, INTEGER) TO authenticated;

-- Add comments
COMMENT ON VIEW organization_limits IS 'Organization limits view - phone number count only includes platform-purchased numbers, not verified/imported user-owned numbers';
