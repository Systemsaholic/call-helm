-- Missing Call Tracking Tables Migration
-- Creates only the tables that don't exist yet

-- CDR uploads for manual tracking
CREATE TABLE IF NOT EXISTS cdr_uploads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES call_lists(id) ON DELETE SET NULL,
  uploaded_by UUID REFERENCES organization_members(id) ON DELETE SET NULL,
  file_name VARCHAR(255) NOT NULL,
  file_size INTEGER,
  file_url TEXT,
  record_count INTEGER DEFAULT 0,
  processed_count INTEGER DEFAULT 0,
  matched_count INTEGER DEFAULT 0,
  failed_count INTEGER DEFAULT 0,
  status VARCHAR(50) DEFAULT 'pending', -- pending, processing, completed, failed
  field_mapping JSONB DEFAULT '{}', -- Maps CSV columns to our schema
  error_log JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

-- Usage tracking for billing
CREATE TABLE IF NOT EXISTS usage_tracking (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  resource_type VARCHAR(50) NOT NULL, -- llm_tokens, analytics_tokens, call_minutes, sms_messages
  billing_period_start DATE NOT NULL,
  billing_period_end DATE NOT NULL,
  tier_included DECIMAL(12,2) NOT NULL DEFAULT 0, -- Amount included in subscription tier
  used_amount DECIMAL(12,2) DEFAULT 0,
  overage_amount DECIMAL(12,2) DEFAULT 0,
  overage_rate DECIMAL(10,6), -- Cost per unit over limit
  last_reset_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, resource_type, billing_period_start)
);

-- Detailed usage events for audit and analytics
CREATE TABLE IF NOT EXISTS usage_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  resource_type VARCHAR(50) NOT NULL, -- llm_tokens, analytics_tokens, call_minutes, sms_messages
  amount DECIMAL(12,4) NOT NULL,
  unit_cost DECIMAL(10,6),
  total_cost DECIMAL(10,4),
  campaign_id UUID REFERENCES call_lists(id) ON DELETE SET NULL,
  agent_id UUID REFERENCES organization_members(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  call_attempt_id UUID REFERENCES call_attempts(id) ON DELETE SET NULL,
  description TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Voice/SMS integration configuration (white-labeled)
CREATE TABLE IF NOT EXISTS voice_integrations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE UNIQUE,
  provider VARCHAR(50) DEFAULT 'internal', -- Hide actual provider (SignalWire)
  is_active BOOLEAN DEFAULT FALSE,
  -- SignalWire specific fields (encrypted)
  space_url VARCHAR(255),
  project_id VARCHAR(255),
  api_token_encrypted TEXT, -- Encrypted with org-specific key
  -- Phone numbers
  phone_numbers JSONB DEFAULT '[]', -- Array of provisioned numbers
  default_caller_id VARCHAR(50),
  -- Webhooks
  webhook_url VARCHAR(255),
  webhook_secret VARCHAR(255),
  status_callback_url VARCHAR(255),
  -- Settings
  recording_enabled BOOLEAN DEFAULT TRUE,
  transcription_enabled BOOLEAN DEFAULT FALSE,
  voicemail_enabled BOOLEAN DEFAULT TRUE,
  voicemail_greeting_url TEXT,
  settings JSONB DEFAULT '{}',
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_verified_at TIMESTAMPTZ
);

-- Add balance and billing fields to organizations if not exists
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS 
  balance DECIMAL(10,2) DEFAULT 0;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS 
  low_balance_threshold DECIMAL(10,2) DEFAULT 10;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS 
  auto_recharge_enabled BOOLEAN DEFAULT FALSE;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS 
  auto_recharge_amount DECIMAL(10,2) DEFAULT 100;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS 
  negative_balance_limit DECIMAL(10,2) DEFAULT -10;

-- Add fields to call_lists for better campaign management
ALTER TABLE call_lists ADD COLUMN IF NOT EXISTS 
  calling_hours_start TIME DEFAULT '09:00:00';
ALTER TABLE call_lists ADD COLUMN IF NOT EXISTS 
  calling_hours_end TIME DEFAULT '17:00:00';
ALTER TABLE call_lists ADD COLUMN IF NOT EXISTS 
  max_attempts_per_contact INTEGER DEFAULT 3;
ALTER TABLE call_lists ADD COLUMN IF NOT EXISTS 
  hours_between_attempts INTEGER DEFAULT 24;
ALTER TABLE call_lists ADD COLUMN IF NOT EXISTS 
  allow_voicemail BOOLEAN DEFAULT TRUE;
ALTER TABLE call_lists ADD COLUMN IF NOT EXISTS 
  voicemail_script TEXT;
ALTER TABLE call_lists ADD COLUMN IF NOT EXISTS 
  script_template TEXT;
ALTER TABLE call_lists ADD COLUMN IF NOT EXISTS 
  tags TEXT[] DEFAULT '{}';

-- Add tracking fields to call_list_contacts
ALTER TABLE call_list_contacts ADD COLUMN IF NOT EXISTS 
  total_attempts INTEGER DEFAULT 0;
ALTER TABLE call_list_contacts ADD COLUMN IF NOT EXISTS 
  successful_attempts INTEGER DEFAULT 0;
ALTER TABLE call_list_contacts ADD COLUMN IF NOT EXISTS 
  first_attempt_at TIMESTAMPTZ;
ALTER TABLE call_list_contacts ADD COLUMN IF NOT EXISTS 
  last_attempt_at TIMESTAMPTZ;
ALTER TABLE call_list_contacts ADD COLUMN IF NOT EXISTS 
  next_attempt_at TIMESTAMPTZ;
ALTER TABLE call_list_contacts ADD COLUMN IF NOT EXISTS 
  completed_at TIMESTAMPTZ;
ALTER TABLE call_list_contacts ADD COLUMN IF NOT EXISTS 
  final_disposition VARCHAR(50);
ALTER TABLE call_list_contacts ADD COLUMN IF NOT EXISTS 
  outcome_notes TEXT;

-- Add missing columns to call_attempts if they don't exist
ALTER TABLE call_attempts ADD COLUMN IF NOT EXISTS campaign_id UUID REFERENCES call_lists(id) ON DELETE SET NULL;
ALTER TABLE call_attempts ADD COLUMN IF NOT EXISTS call_list_contact_id UUID REFERENCES call_list_contacts(id) ON DELETE SET NULL;
ALTER TABLE call_attempts ADD COLUMN IF NOT EXISTS contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL;
ALTER TABLE call_attempts ADD COLUMN IF NOT EXISTS direction VARCHAR(20) DEFAULT 'outbound';
ALTER TABLE call_attempts ADD COLUMN IF NOT EXISTS start_time TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE call_attempts ADD COLUMN IF NOT EXISTS end_time TIMESTAMPTZ;
ALTER TABLE call_attempts ADD COLUMN IF NOT EXISTS duration_seconds INTEGER;
ALTER TABLE call_attempts ADD COLUMN IF NOT EXISTS disposition_notes TEXT;
ALTER TABLE call_attempts ADD COLUMN IF NOT EXISTS recording_sid VARCHAR(255);
ALTER TABLE call_attempts ADD COLUMN IF NOT EXISTS ai_keywords TEXT[];
ALTER TABLE call_attempts ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE call_attempts ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_call_attempts_org_campaign 
  ON call_attempts(organization_id, campaign_id);
CREATE INDEX IF NOT EXISTS idx_call_attempts_agent 
  ON call_attempts(agent_id);
CREATE INDEX IF NOT EXISTS idx_call_attempts_contact 
  ON call_attempts(contact_id);
CREATE INDEX IF NOT EXISTS idx_call_attempts_disposition 
  ON call_attempts(disposition);
CREATE INDEX IF NOT EXISTS idx_call_attempts_created 
  ON call_attempts(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_cdr_uploads_org 
  ON cdr_uploads(organization_id);
CREATE INDEX IF NOT EXISTS idx_cdr_uploads_campaign 
  ON cdr_uploads(campaign_id);
CREATE INDEX IF NOT EXISTS idx_cdr_uploads_status 
  ON cdr_uploads(status);

CREATE INDEX IF NOT EXISTS idx_usage_tracking_org_period 
  ON usage_tracking(organization_id, billing_period_start);
CREATE INDEX IF NOT EXISTS idx_usage_tracking_resource 
  ON usage_tracking(resource_type);

CREATE INDEX IF NOT EXISTS idx_usage_events_org_created 
  ON usage_events(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_events_resource 
  ON usage_events(resource_type);
CREATE INDEX IF NOT EXISTS idx_usage_events_campaign 
  ON usage_events(campaign_id);

-- Enable RLS
ALTER TABLE cdr_uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE voice_integrations ENABLE ROW LEVEL SECURITY;

-- RLS Policies for call_attempts (if not exists)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'call_attempts' 
        AND policyname = 'Users can view call attempts in their organization'
    ) THEN
        CREATE POLICY "Users can view call attempts in their organization"
          ON call_attempts FOR SELECT
          USING (organization_id IN (SELECT get_user_organizations(auth.uid())));
    END IF;
END $$;

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'call_attempts' 
        AND policyname = 'Users can create call attempts in their organization'
    ) THEN
        CREATE POLICY "Users can create call attempts in their organization"
          ON call_attempts FOR INSERT
          WITH CHECK (organization_id IN (SELECT get_user_organizations(auth.uid())));
    END IF;
END $$;

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'call_attempts' 
        AND policyname = 'Users can update call attempts in their organization'
    ) THEN
        CREATE POLICY "Users can update call attempts in their organization"
          ON call_attempts FOR UPDATE
          USING (organization_id IN (SELECT get_user_organizations(auth.uid())));
    END IF;
END $$;

-- RLS Policies for cdr_uploads
CREATE POLICY "Users can view CDR uploads in their organization"
  ON cdr_uploads FOR SELECT
  USING (organization_id IN (SELECT get_user_organizations(auth.uid())));

CREATE POLICY "Users can create CDR uploads in their organization"
  ON cdr_uploads FOR INSERT
  WITH CHECK (organization_id IN (SELECT get_user_organizations(auth.uid())));

CREATE POLICY "Users can update CDR uploads in their organization"
  ON cdr_uploads FOR UPDATE
  USING (organization_id IN (SELECT get_user_organizations(auth.uid())));

-- RLS Policies for usage_tracking
CREATE POLICY "Users can view usage tracking in their organization"
  ON usage_tracking FOR SELECT
  USING (organization_id IN (SELECT get_user_organizations(auth.uid())));

CREATE POLICY "System can manage usage tracking"
  ON usage_tracking FOR ALL
  USING (auth.uid() IS NOT NULL); -- Will be managed by service role

-- RLS Policies for usage_events
CREATE POLICY "Users can view usage events in their organization"
  ON usage_events FOR SELECT
  USING (organization_id IN (SELECT get_user_organizations(auth.uid())));

CREATE POLICY "System can create usage events"
  ON usage_events FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL); -- Will be managed by service role

-- RLS Policies for voice_integrations
CREATE POLICY "Org admins can view voice integrations"
  ON voice_integrations FOR SELECT
  USING (has_role_in_org(auth.uid(), organization_id, 'org_admin'));

CREATE POLICY "Org admins can manage voice integrations"
  ON voice_integrations FOR ALL
  USING (has_role_in_org(auth.uid(), organization_id, 'org_admin'));

-- Triggers for updated_at
CREATE TRIGGER update_usage_tracking_updated_at 
  BEFORE UPDATE ON usage_tracking
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_voice_integrations_updated_at 
  BEFORE UPDATE ON voice_integrations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Function to calculate usage for a period
CREATE OR REPLACE FUNCTION calculate_usage_for_period(
  p_org_id UUID,
  p_resource_type VARCHAR,
  p_start_date DATE,
  p_end_date DATE
) RETURNS TABLE (
  total_usage DECIMAL,
  included_usage DECIMAL,
  overage_usage DECIMAL,
  overage_cost DECIMAL
) AS $$
DECLARE
  v_tier_included DECIMAL;
  v_used_amount DECIMAL;
  v_overage_rate DECIMAL;
BEGIN
  -- Get tracking record
  SELECT tier_included, used_amount, overage_rate
  INTO v_tier_included, v_used_amount, v_overage_rate
  FROM usage_tracking
  WHERE organization_id = p_org_id
    AND resource_type = p_resource_type
    AND billing_period_start = p_start_date;
  
  -- Calculate overage
  IF v_used_amount > v_tier_included THEN
    RETURN QUERY SELECT 
      v_used_amount,
      v_tier_included,
      v_used_amount - v_tier_included,
      (v_used_amount - v_tier_included) * v_overage_rate;
  ELSE
    RETURN QUERY SELECT 
      v_used_amount,
      v_used_amount,
      0::DECIMAL,
      0::DECIMAL;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if organization can make calls
CREATE OR REPLACE FUNCTION can_make_call(p_org_id UUID) RETURNS BOOLEAN AS $$
DECLARE
  v_balance DECIMAL;
  v_negative_limit DECIMAL;
  v_subscription_tier subscription_tier;
BEGIN
  SELECT balance, negative_balance_limit, subscription_tier
  INTO v_balance, v_negative_limit, v_subscription_tier
  FROM organizations
  WHERE id = p_org_id;
  
  -- Free tier cannot make integrated calls
  IF v_subscription_tier = 'starter' OR v_subscription_tier IS NULL THEN
    RETURN FALSE;
  END IF;
  
  -- Check if balance is above negative limit
  RETURN v_balance > (v_negative_limit * -1);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add comment for documentation
COMMENT ON TABLE cdr_uploads IS 'Stores CDR file uploads for manual call tracking';
COMMENT ON TABLE usage_tracking IS 'Tracks resource usage per organization for billing purposes';
COMMENT ON TABLE usage_events IS 'Detailed log of all usage events for audit and analytics';
COMMENT ON TABLE voice_integrations IS 'Voice and SMS provider configuration (white-labeled)';