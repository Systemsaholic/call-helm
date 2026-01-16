-- Migration: Fix trial users not getting plan features
-- Description: Update organization_limits view to use subscription_tier as fallback
-- when subscription_plan_id is null (which happens for trial users)

-- Drop and recreate the organization_limits view with the fix
DROP VIEW IF EXISTS organization_limits;

CREATE OR REPLACE VIEW organization_limits AS
SELECT
  o.id AS organization_id,
  o.name AS organization_name,
  o.subscription_status,
  o.trial_ends_at,
  COALESCE(sp.slug, o.subscription_tier) AS plan_slug,
  COALESCE(sp.name, INITCAP(COALESCE(o.subscription_tier, 'Free'))) AS plan_name,
  COALESCE(sp.name, INITCAP(COALESCE(o.subscription_tier, 'Free'))) AS plan_display_name,
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
-- FIX: Join on subscription_plan_id first, but fallback to subscription_tier slug
LEFT JOIN subscription_plans sp ON
  sp.id = COALESCE(
    o.subscription_plan_id,
    (SELECT id FROM subscription_plans WHERE slug = o.subscription_tier LIMIT 1)
  )
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

-- Re-grant permissions
GRANT SELECT ON organization_limits TO authenticated;

-- Add comment explaining the fix
COMMENT ON VIEW organization_limits IS 'Combines organization data with plan limits and current usage. Uses subscription_tier as fallback when subscription_plan_id is null (trial users).';
