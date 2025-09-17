-- Usage Tracking Functions Migration
-- Creates functions for updating usage tracking and checking quotas

-- Function to update usage tracking when events are created
CREATE OR REPLACE FUNCTION update_usage_tracking(
  p_org_id UUID,
  p_resource_type VARCHAR,
  p_period_start DATE,
  p_period_end DATE,
  p_amount DECIMAL,
  p_cost DECIMAL
) RETURNS VOID AS $$
DECLARE
  v_tier subscription_tier;
  v_tier_limits JSONB;
BEGIN
  -- Get organization tier
  SELECT subscription_tier INTO v_tier
  FROM organizations
  WHERE id = p_org_id;
  
  -- Define tier limits
  v_tier_limits := CASE v_tier
    WHEN 'starter' THEN '{
      "llm_tokens": 0,
      "analytics_tokens": 0, 
      "call_minutes": 0,
      "sms_messages": 0
    }'::JSONB
    WHEN 'professional' THEN '{
      "llm_tokens": 100000,
      "analytics_tokens": 50000,
      "call_minutes": 500,
      "sms_messages": 1000
    }'::JSONB
    WHEN 'enterprise' THEN '{
      "llm_tokens": 1000000,
      "analytics_tokens": 500000,
      "call_minutes": 2000,
      "sms_messages": 5000
    }'::JSONB
    ELSE '{
      "llm_tokens": 0,
      "analytics_tokens": 0,
      "call_minutes": 0,
      "sms_messages": 0
    }'::JSONB
  END;
  
  -- Insert or update usage tracking
  INSERT INTO usage_tracking (
    organization_id,
    resource_type,
    billing_period_start,
    billing_period_end,
    tier_included,
    used_amount,
    overage_amount,
    overage_rate
  )
  VALUES (
    p_org_id,
    p_resource_type,
    p_period_start,
    p_period_end,
    (v_tier_limits->p_resource_type)::DECIMAL,
    p_amount,
    GREATEST(0, p_amount - (v_tier_limits->p_resource_type)::DECIMAL),
    CASE p_resource_type
      WHEN 'llm_tokens' THEN 0.000001
      WHEN 'analytics_tokens' THEN 0.0000005
      WHEN 'call_minutes' THEN 0.025
      WHEN 'sms_messages' THEN 0.03
      ELSE 0
    END
  )
  ON CONFLICT (organization_id, resource_type, billing_period_start)
  DO UPDATE SET
    used_amount = usage_tracking.used_amount + p_amount,
    overage_amount = GREATEST(0, usage_tracking.used_amount + p_amount - usage_tracking.tier_included),
    updated_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check quotas before performing actions
CREATE OR REPLACE FUNCTION check_quota(
  p_organization_id UUID,
  p_resource VARCHAR,
  p_count INTEGER DEFAULT 1
) RETURNS BOOLEAN AS $$
DECLARE
  v_tier subscription_tier;
  v_current_count INTEGER;
  v_limit INTEGER;
BEGIN
  -- Get organization subscription tier
  SELECT subscription_tier INTO v_tier
  FROM organizations 
  WHERE id = p_organization_id;
  
  -- Define limits based on tier and resource
  v_limit := CASE 
    WHEN p_resource = 'call_lists' THEN
      CASE v_tier
        WHEN 'starter' THEN 5
        WHEN 'professional' THEN 50
        WHEN 'enterprise' THEN 500
        ELSE 1
      END
    WHEN p_resource = 'contacts' THEN
      CASE v_tier
        WHEN 'starter' THEN 1000
        WHEN 'professional' THEN 50000
        WHEN 'enterprise' THEN 500000
        ELSE 100
      END
    WHEN p_resource = 'agents' THEN
      CASE v_tier
        WHEN 'starter' THEN 5
        WHEN 'professional' THEN 100
        WHEN 'enterprise' THEN 1000
        ELSE 2
      END
    WHEN p_resource = 'campaigns_active' THEN
      CASE v_tier
        WHEN 'starter' THEN 2
        WHEN 'professional' THEN 20
        WHEN 'enterprise' THEN 100
        ELSE 1
      END
    ELSE 0
  END;
  
  -- Get current count based on resource type
  v_current_count := CASE p_resource
    WHEN 'call_lists' THEN
      (SELECT COUNT(*) FROM call_lists WHERE organization_id = p_organization_id AND status != 'archived')
    WHEN 'contacts' THEN
      (SELECT COUNT(*) FROM contacts WHERE organization_id = p_organization_id)
    WHEN 'agents' THEN
      (SELECT COUNT(*) FROM organization_members WHERE organization_id = p_organization_id AND is_active = TRUE)
    WHEN 'campaigns_active' THEN
      (SELECT COUNT(*) FROM call_lists WHERE organization_id = p_organization_id AND status = 'active')
    ELSE 0
  END;
  
  -- Check if adding p_count would exceed the limit
  RETURN (v_current_count + p_count) <= v_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get usage statistics for an organization
CREATE OR REPLACE FUNCTION get_usage_stats(
  p_org_id UUID,
  p_period_start DATE DEFAULT NULL,
  p_period_end DATE DEFAULT NULL
) RETURNS TABLE (
  resource_type VARCHAR,
  tier_included DECIMAL,
  used_amount DECIMAL,
  overage_amount DECIMAL,
  overage_cost DECIMAL,
  total_cost DECIMAL,
  utilization_percent DECIMAL
) AS $$
DECLARE
  v_start_date DATE;
  v_end_date DATE;
BEGIN
  -- Set default dates if not provided (current month)
  v_start_date := COALESCE(p_period_start, date_trunc('month', CURRENT_DATE)::DATE);
  v_end_date := COALESCE(p_period_end, (date_trunc('month', CURRENT_DATE) + INTERVAL '1 month - 1 day')::DATE);
  
  RETURN QUERY
  SELECT 
    ut.resource_type::VARCHAR,
    ut.tier_included,
    ut.used_amount,
    ut.overage_amount,
    ut.overage_amount * ut.overage_rate AS overage_cost,
    COALESCE(event_costs.total_cost, 0) AS total_cost,
    CASE 
      WHEN ut.tier_included > 0 THEN ROUND((ut.used_amount / ut.tier_included) * 100, 2)
      ELSE 0
    END AS utilization_percent
  FROM usage_tracking ut
  LEFT JOIN (
    SELECT 
      resource_type,
      SUM(total_cost) as total_cost
    FROM usage_events
    WHERE organization_id = p_org_id
      AND created_at >= v_start_date
      AND created_at <= v_end_date
    GROUP BY resource_type
  ) event_costs ON ut.resource_type = event_costs.resource_type
  WHERE ut.organization_id = p_org_id
    AND ut.billing_period_start = v_start_date
  ORDER BY ut.resource_type;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to reset usage tracking for a new billing period
CREATE OR REPLACE FUNCTION reset_usage_tracking(
  p_org_id UUID,
  p_new_period_start DATE
) RETURNS VOID AS $$
DECLARE
  v_tier subscription_tier;
  v_tier_limits JSONB;
  v_resource_type VARCHAR;
BEGIN
  -- Get organization tier
  SELECT subscription_tier INTO v_tier
  FROM organizations
  WHERE id = p_org_id;
  
  -- Define tier limits
  v_tier_limits := CASE v_tier
    WHEN 'starter' THEN '{
      "llm_tokens": 0,
      "analytics_tokens": 0,
      "call_minutes": 0,
      "sms_messages": 0
    }'::JSONB
    WHEN 'professional' THEN '{
      "llm_tokens": 100000,
      "analytics_tokens": 50000,
      "call_minutes": 500,
      "sms_messages": 1000
    }'::JSONB
    WHEN 'enterprise' THEN '{
      "llm_tokens": 1000000,
      "analytics_tokens": 500000,
      "call_minutes": 2000,
      "sms_messages": 5000
    }'::JSONB
    ELSE '{
      "llm_tokens": 0,
      "analytics_tokens": 0,
      "call_minutes": 0,
      "sms_messages": 0
    }'::JSONB
  END;
  
  -- Create new usage tracking records for each resource type
  FOR v_resource_type IN SELECT jsonb_object_keys(v_tier_limits) LOOP
    INSERT INTO usage_tracking (
      organization_id,
      resource_type,
      billing_period_start,
      billing_period_end,
      tier_included,
      used_amount,
      overage_amount,
      overage_rate,
      last_reset_at
    )
    VALUES (
      p_org_id,
      v_resource_type,
      p_new_period_start,
      (p_new_period_start + INTERVAL '1 month - 1 day')::DATE,
      (v_tier_limits->v_resource_type)::DECIMAL,
      0,
      0,
      CASE v_resource_type
        WHEN 'llm_tokens' THEN 0.000001
        WHEN 'analytics_tokens' THEN 0.0000005
        WHEN 'call_minutes' THEN 0.025
        WHEN 'sms_messages' THEN 0.03
        ELSE 0
      END,
      NOW()
    )
    ON CONFLICT (organization_id, resource_type, billing_period_start)
    DO UPDATE SET
      used_amount = 0,
      overage_amount = 0,
      last_reset_at = NOW();
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to automatically track usage when events are created
CREATE OR REPLACE FUNCTION trigger_update_usage_tracking()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM update_usage_tracking(
    NEW.organization_id,
    NEW.resource_type,
    date_trunc('month', NEW.created_at)::DATE,
    (date_trunc('month', NEW.created_at) + INTERVAL '1 month - 1 day')::DATE,
    NEW.amount,
    NEW.total_cost
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger on usage_events
DROP TRIGGER IF EXISTS trigger_usage_events_tracking ON usage_events;
CREATE TRIGGER trigger_usage_events_tracking
  AFTER INSERT ON usage_events
  FOR EACH ROW
  EXECUTE FUNCTION trigger_update_usage_tracking();

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_usage_tracking_lookup 
  ON usage_tracking(organization_id, resource_type, billing_period_start);

CREATE INDEX IF NOT EXISTS idx_usage_events_billing 
  ON usage_events(organization_id, resource_type, created_at);

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION update_usage_tracking(UUID, VARCHAR, DATE, DATE, DECIMAL, DECIMAL) TO authenticated;
GRANT EXECUTE ON FUNCTION check_quota(UUID, VARCHAR, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION get_usage_stats(UUID, DATE, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION reset_usage_tracking(UUID, DATE) TO authenticated;

-- Add comments for documentation
COMMENT ON FUNCTION update_usage_tracking IS 'Updates usage tracking when resources are consumed';
COMMENT ON FUNCTION check_quota IS 'Checks if organization can perform action within tier limits';
COMMENT ON FUNCTION get_usage_stats IS 'Returns usage statistics for an organization and period';
COMMENT ON FUNCTION reset_usage_tracking IS 'Resets usage tracking for a new billing period';