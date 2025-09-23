-- Fix ambiguous resource_type column reference in get_usage_stats function

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
      ue.resource_type,
      SUM(ue.total_cost) as total_cost
    FROM usage_events ue
    WHERE ue.organization_id = p_org_id
      AND ue.created_at >= v_start_date
      AND ue.created_at <= v_end_date
    GROUP BY ue.resource_type
  ) event_costs ON ut.resource_type = event_costs.resource_type
  WHERE ut.organization_id = p_org_id
    AND ut.billing_period_start = v_start_date
  ORDER BY ut.resource_type;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION get_usage_stats IS 'Returns usage statistics for an organization and period (fixed ambiguous column)';