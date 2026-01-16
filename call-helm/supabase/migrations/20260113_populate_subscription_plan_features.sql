-- Migration: Populate subscription_plans features with proper limits
-- Description: Sets up all plan features and limits for proper billing display
-- Each plan should have consistent feature keys for the BillingDashboard

-- Free Trial Plan
UPDATE subscription_plans
SET features = jsonb_build_object(
  -- Limits
  'max_agents', 2,
  'max_phone_numbers', 0,
  'max_call_minutes', 30,
  'max_sms_messages', 50,
  'max_contacts', 50,
  'max_campaigns', 1,
  'max_storage_gb', 1,
  'max_ai_tokens_per_month', 0,
  'max_transcription_minutes_per_month', 0,
  'max_ai_analysis_per_month', 0,
  -- Feature flags
  'phone_number_management', true,
  'voice_calls', true,
  'sms_messaging', true,
  'call_recording', false,
  'call_forwarding', true,
  'voicemail', true,
  'contact_management', true,
  'call_transcription', false,
  'ai_analysis', false,
  'sentiment_analysis', false,
  'speaker_diarization', false,
  'action_items', false,
  'call_summaries', false,
  'api_access', false,
  'webhooks', false,
  'crm_integration', false,
  'zapier_integration', false,
  'white_label', false,
  'priority_support', false
),
  name = 'Free Trial',
  description = '14-day trial with limited features',
  badge_text = NULL,
  price_monthly = 0,
  price_yearly = 0
WHERE slug = 'free';

-- Pro Starter Plan
UPDATE subscription_plans
SET features = jsonb_build_object(
  -- Limits
  'max_agents', 5,
  'max_phone_numbers', 3,
  'max_call_minutes', 500,
  'max_sms_messages', 500,
  'max_contacts', 1000,
  'max_campaigns', 5,
  'max_storage_gb', 5,
  'max_ai_tokens_per_month', 50000,
  'max_transcription_minutes_per_month', 60,
  'max_ai_analysis_per_month', 50,
  -- Feature flags
  'phone_number_management', true,
  'voice_calls', true,
  'sms_messaging', true,
  'call_recording', true,
  'call_forwarding', true,
  'voicemail', true,
  'contact_management', true,
  'call_transcription', true,
  'ai_analysis', true,
  'sentiment_analysis', true,
  'speaker_diarization', true,
  'action_items', true,
  'call_summaries', true,
  'api_access', true,
  'webhooks', true,
  'crm_integration', false,
  'zapier_integration', false,
  'white_label', false,
  'priority_support', false
),
  name = 'Pro Starter',
  description = 'Perfect for small teams getting started',
  badge_text = 'Most Popular',
  price_monthly = 49,
  price_yearly = 470
WHERE slug = 'starter';

-- Professional Plan
UPDATE subscription_plans
SET features = jsonb_build_object(
  -- Limits
  'max_agents', 15,
  'max_phone_numbers', 10,
  'max_call_minutes', 2000,
  'max_sms_messages', 2000,
  'max_contacts', 10000,
  'max_campaigns', 20,
  'max_storage_gb', 25,
  'max_ai_tokens_per_month', 200000,
  'max_transcription_minutes_per_month', 300,
  'max_ai_analysis_per_month', 200,
  -- Feature flags
  'phone_number_management', true,
  'voice_calls', true,
  'sms_messaging', true,
  'call_recording', true,
  'call_forwarding', true,
  'voicemail', true,
  'contact_management', true,
  'call_transcription', true,
  'ai_analysis', true,
  'sentiment_analysis', true,
  'speaker_diarization', true,
  'action_items', true,
  'call_summaries', true,
  'api_access', true,
  'webhooks', true,
  'crm_integration', true,
  'zapier_integration', true,
  'white_label', false,
  'priority_support', true
),
  name = 'Professional',
  description = 'Ideal for growing businesses',
  badge_text = NULL,
  price_monthly = 99,
  price_yearly = 950
WHERE slug = 'professional';

-- Enterprise Plan
UPDATE subscription_plans
SET features = jsonb_build_object(
  -- Limits (999999 = unlimited)
  'max_agents', 999999,
  'max_phone_numbers', 999,
  'max_call_minutes', 999999,
  'max_sms_messages', 999999,
  'max_contacts', 999999,
  'max_campaigns', 999999,
  'max_storage_gb', 999,
  'max_ai_tokens_per_month', 999999,
  'max_transcription_minutes_per_month', 999999,
  'max_ai_analysis_per_month', 999999,
  -- Feature flags
  'phone_number_management', true,
  'voice_calls', true,
  'sms_messaging', true,
  'call_recording', true,
  'call_forwarding', true,
  'voicemail', true,
  'contact_management', true,
  'call_transcription', true,
  'ai_analysis', true,
  'sentiment_analysis', true,
  'speaker_diarization', true,
  'action_items', true,
  'call_summaries', true,
  'api_access', true,
  'webhooks', true,
  'crm_integration', true,
  'zapier_integration', true,
  'white_label', true,
  'priority_support', true
),
  name = 'Enterprise',
  description = 'Advanced features for large organizations',
  badge_text = 'Best Value',
  price_monthly = 299,
  price_yearly = 2870
WHERE slug = 'enterprise';

-- Insert plans if they don't exist
INSERT INTO subscription_plans (id, slug, name, description, badge_text, price_monthly, price_yearly, features, is_active, display_order)
SELECT
  gen_random_uuid(),
  'free',
  'Free Trial',
  '14-day trial with limited features',
  NULL,
  0,
  0,
  jsonb_build_object(
    'max_agents', 2,
    'max_phone_numbers', 0,
    'max_call_minutes', 30,
    'max_sms_messages', 50,
    'max_contacts', 50,
    'max_campaigns', 1,
    'max_storage_gb', 1,
    'max_ai_tokens_per_month', 0,
    'max_transcription_minutes_per_month', 0,
    'max_ai_analysis_per_month', 0,
    'phone_number_management', true,
    'voice_calls', true,
    'sms_messaging', true,
    'call_recording', false,
    'call_forwarding', true,
    'voicemail', true,
    'contact_management', true,
    'call_transcription', false,
    'ai_analysis', false,
    'white_label', false,
    'priority_support', false
  ),
  true,
  1
WHERE NOT EXISTS (SELECT 1 FROM subscription_plans WHERE slug = 'free');

INSERT INTO subscription_plans (id, slug, name, description, badge_text, price_monthly, price_yearly, features, is_active, display_order)
SELECT
  gen_random_uuid(),
  'starter',
  'Pro Starter',
  'Perfect for small teams getting started',
  'Most Popular',
  49,
  470,
  jsonb_build_object(
    'max_agents', 5,
    'max_phone_numbers', 3,
    'max_call_minutes', 500,
    'max_sms_messages', 500,
    'max_contacts', 1000,
    'max_campaigns', 5,
    'max_storage_gb', 5,
    'max_ai_tokens_per_month', 50000,
    'max_transcription_minutes_per_month', 60,
    'max_ai_analysis_per_month', 50,
    'phone_number_management', true,
    'voice_calls', true,
    'sms_messaging', true,
    'call_recording', true,
    'call_forwarding', true,
    'voicemail', true,
    'contact_management', true,
    'call_transcription', true,
    'ai_analysis', true,
    'api_access', true,
    'webhooks', true,
    'white_label', false,
    'priority_support', false
  ),
  true,
  2
WHERE NOT EXISTS (SELECT 1 FROM subscription_plans WHERE slug = 'starter');

INSERT INTO subscription_plans (id, slug, name, description, badge_text, price_monthly, price_yearly, features, is_active, display_order)
SELECT
  gen_random_uuid(),
  'professional',
  'Professional',
  'Ideal for growing businesses',
  NULL,
  99,
  950,
  jsonb_build_object(
    'max_agents', 15,
    'max_phone_numbers', 10,
    'max_call_minutes', 2000,
    'max_sms_messages', 2000,
    'max_contacts', 10000,
    'max_campaigns', 20,
    'max_storage_gb', 25,
    'max_ai_tokens_per_month', 200000,
    'max_transcription_minutes_per_month', 300,
    'max_ai_analysis_per_month', 200,
    'phone_number_management', true,
    'voice_calls', true,
    'sms_messaging', true,
    'call_recording', true,
    'call_forwarding', true,
    'voicemail', true,
    'contact_management', true,
    'call_transcription', true,
    'ai_analysis', true,
    'api_access', true,
    'webhooks', true,
    'crm_integration', true,
    'zapier_integration', true,
    'white_label', false,
    'priority_support', true
  ),
  true,
  3
WHERE NOT EXISTS (SELECT 1 FROM subscription_plans WHERE slug = 'professional');

INSERT INTO subscription_plans (id, slug, name, description, badge_text, price_monthly, price_yearly, features, is_active, display_order)
SELECT
  gen_random_uuid(),
  'enterprise',
  'Enterprise',
  'Advanced features for large organizations',
  'Best Value',
  299,
  2870,
  jsonb_build_object(
    'max_agents', 999999,
    'max_phone_numbers', 999,
    'max_call_minutes', 999999,
    'max_sms_messages', 999999,
    'max_contacts', 999999,
    'max_campaigns', 999999,
    'max_storage_gb', 999,
    'max_ai_tokens_per_month', 999999,
    'max_transcription_minutes_per_month', 999999,
    'max_ai_analysis_per_month', 999999,
    'phone_number_management', true,
    'voice_calls', true,
    'sms_messaging', true,
    'call_recording', true,
    'call_forwarding', true,
    'voicemail', true,
    'contact_management', true,
    'call_transcription', true,
    'ai_analysis', true,
    'api_access', true,
    'webhooks', true,
    'crm_integration', true,
    'zapier_integration', true,
    'white_label', true,
    'priority_support', true
  ),
  true,
  4
WHERE NOT EXISTS (SELECT 1 FROM subscription_plans WHERE slug = 'enterprise');

-- Add display_order column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'subscription_plans' AND column_name = 'display_order'
  ) THEN
    ALTER TABLE subscription_plans ADD COLUMN display_order INTEGER DEFAULT 0;
  END IF;
END $$;

-- Update display order
UPDATE subscription_plans SET display_order = 1 WHERE slug = 'free';
UPDATE subscription_plans SET display_order = 2 WHERE slug = 'starter';
UPDATE subscription_plans SET display_order = 3 WHERE slug = 'professional';
UPDATE subscription_plans SET display_order = 4 WHERE slug = 'enterprise';

-- Add comment
COMMENT ON TABLE subscription_plans IS 'Available subscription plans with features and limits. Features JSONB contains both limits (max_*) and boolean feature flags.';
