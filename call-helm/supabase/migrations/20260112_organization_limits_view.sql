-- Migration: Create organization_limits view and related functions
-- Description: Provides billing service with usage data and limit checking capabilities

-- 1. Create the organization_limits view
-- This view combines organization data with plan limits and current usage
CREATE OR REPLACE VIEW organization_limits AS
SELECT
  o.id AS organization_id,
  o.name AS organization_name,
  o.subscription_status,
  o.trial_ends_at,
  COALESCE(sp.slug, o.subscription_tier) AS plan_slug,
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
  COALESCE((sp.features->>'max_phone_numbers')::INTEGER, 1) AS max_phone_numbers,
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
-- Phone number count
LEFT JOIN (
  SELECT organization_id, COUNT(*) as count
  FROM phone_numbers
  WHERE status = 'active'
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

-- 2. Create the get_organization_limits function (used by trial check function)
CREATE OR REPLACE FUNCTION get_organization_limits(org_id UUID)
RETURNS TABLE (
  organization_id UUID,
  organization_name TEXT,
  subscription_status TEXT,
  trial_ends_at TIMESTAMPTZ,
  plan_slug TEXT,
  plan_name TEXT,
  plan_display_name TEXT,
  price_monthly NUMERIC,
  max_agents INTEGER,
  max_contacts INTEGER,
  max_call_minutes INTEGER,
  max_sms_messages INTEGER,
  max_campaigns INTEGER,
  max_storage_gb INTEGER,
  max_phone_numbers INTEGER,
  max_ai_tokens_per_month INTEGER,
  max_transcription_minutes_per_month INTEGER,
  max_ai_analysis_per_month INTEGER,
  features JSONB,
  badge_text TEXT,
  current_agents INTEGER,
  current_contacts INTEGER,
  current_campaigns INTEGER,
  current_phone_numbers INTEGER,
  used_call_minutes NUMERIC,
  used_sms_messages INTEGER,
  used_ai_tokens INTEGER,
  used_transcription_minutes NUMERIC,
  used_ai_analysis INTEGER,
  call_minutes_percentage NUMERIC,
  contacts_percentage NUMERIC,
  agents_percentage NUMERIC,
  phone_numbers_percentage NUMERIC,
  ai_tokens_percentage NUMERIC,
  transcription_percentage NUMERIC,
  ai_analysis_percentage NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ol.organization_id,
    ol.organization_name,
    ol.subscription_status,
    ol.trial_ends_at,
    ol.plan_slug,
    ol.plan_name,
    ol.plan_display_name,
    ol.price_monthly,
    ol.max_agents,
    ol.max_contacts,
    ol.max_call_minutes,
    ol.max_sms_messages,
    ol.max_campaigns,
    ol.max_storage_gb,
    ol.max_phone_numbers,
    ol.max_ai_tokens_per_month,
    ol.max_transcription_minutes_per_month,
    ol.max_ai_analysis_per_month,
    ol.features,
    ol.badge_text,
    ol.current_agents,
    ol.current_contacts,
    ol.current_campaigns,
    ol.current_phone_numbers,
    ol.used_call_minutes,
    ol.used_sms_messages,
    ol.used_ai_tokens,
    ol.used_transcription_minutes,
    ol.used_ai_analysis,
    ol.call_minutes_percentage,
    ol.contacts_percentage,
    ol.agents_percentage,
    ol.phone_numbers_percentage,
    ol.ai_tokens_percentage,
    ol.transcription_percentage,
    ol.ai_analysis_percentage
  FROM organization_limits ol
  WHERE ol.organization_id = org_id;
END;
$$;

-- 3. Create check_feature_access function
CREATE OR REPLACE FUNCTION check_feature_access(
  p_organization_id UUID,
  p_feature_name TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_features JSONB;
BEGIN
  -- Get the organization's plan features
  SELECT COALESCE(sp.features, '{}'::jsonb)
  INTO v_features
  FROM organizations o
  LEFT JOIN subscription_plans sp ON o.subscription_plan_id = sp.id
  WHERE o.id = p_organization_id;

  -- If no organization found, return false
  IF v_features IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Check if the feature exists and is true
  RETURN COALESCE((v_features->>p_feature_name)::BOOLEAN, FALSE);
END;
$$;

-- 4. Create check_usage_limit function
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

-- 5. Enable RLS on the view (views inherit from underlying tables)
-- Grant select on the view to authenticated users
GRANT SELECT ON organization_limits TO authenticated;

-- 6. Grant execute on functions
GRANT EXECUTE ON FUNCTION get_organization_limits(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION check_feature_access(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION check_usage_limit(UUID, TEXT, INTEGER) TO authenticated;

-- 7. Add comments
COMMENT ON VIEW organization_limits IS 'Combines organization data with plan limits and current usage for billing UI';
COMMENT ON FUNCTION get_organization_limits IS 'Returns organization limits and usage data as a table row';
COMMENT ON FUNCTION check_feature_access IS 'Checks if an organization has access to a specific feature based on their plan';
COMMENT ON FUNCTION check_usage_limit IS 'Checks if an organization can use more of a resource within their plan limits';
