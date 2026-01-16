-- Migration: Add Telnyx columns for provider migration
-- This adds Telnyx-specific columns alongside existing SignalWire columns
-- to support gradual migration from SignalWire to Telnyx

-- Add telnyx_message_id to sms_messages table
ALTER TABLE sms_messages
ADD COLUMN IF NOT EXISTS telnyx_message_id TEXT;

-- Add index for Telnyx message lookups
CREATE INDEX IF NOT EXISTS idx_sms_messages_telnyx_id
ON sms_messages(telnyx_message_id)
WHERE telnyx_message_id IS NOT NULL;

-- Add telnyx columns to phone_numbers table
ALTER TABLE phone_numbers
ADD COLUMN IF NOT EXISTS telnyx_phone_number_id TEXT,
ADD COLUMN IF NOT EXISTS telnyx_messaging_profile_id TEXT;

-- Add index for Telnyx phone number lookups
CREATE INDEX IF NOT EXISTS idx_phone_numbers_telnyx_id
ON phone_numbers(telnyx_phone_number_id)
WHERE telnyx_phone_number_id IS NOT NULL;

-- Add telnyx columns to calls table (if exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'calls') THEN
    ALTER TABLE calls
    ADD COLUMN IF NOT EXISTS telnyx_call_control_id TEXT,
    ADD COLUMN IF NOT EXISTS telnyx_call_session_id TEXT,
    ADD COLUMN IF NOT EXISTS telnyx_call_leg_id TEXT;

    CREATE INDEX IF NOT EXISTS idx_calls_telnyx_control_id
    ON calls(telnyx_call_control_id)
    WHERE telnyx_call_control_id IS NOT NULL;
  END IF;
END $$;

-- Add telnyx columns to call_recordings table (if exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'call_recordings') THEN
    ALTER TABLE call_recordings
    ADD COLUMN IF NOT EXISTS telnyx_recording_id TEXT;

    CREATE INDEX IF NOT EXISTS idx_recordings_telnyx_id
    ON call_recordings(telnyx_recording_id)
    WHERE telnyx_recording_id IS NOT NULL;
  END IF;
END $$;

-- Add telnyx columns to campaign registry tables
ALTER TABLE campaign_registry_brands
ADD COLUMN IF NOT EXISTS telnyx_brand_id TEXT;

ALTER TABLE campaign_registry_campaigns
ADD COLUMN IF NOT EXISTS telnyx_campaign_id TEXT;

-- Add provider column to track which provider is being used
-- This helps during the migration period
ALTER TABLE phone_numbers
ADD COLUMN IF NOT EXISTS sms_provider TEXT DEFAULT 'signalwire'
CHECK (sms_provider IN ('signalwire', 'telnyx'));

ALTER TABLE phone_numbers
ADD COLUMN IF NOT EXISTS voice_provider TEXT DEFAULT 'signalwire'
CHECK (voice_provider IN ('signalwire', 'telnyx'));

-- Comment on new columns
COMMENT ON COLUMN sms_messages.telnyx_message_id IS 'Telnyx message ID for messages sent via Telnyx';
COMMENT ON COLUMN phone_numbers.telnyx_phone_number_id IS 'Telnyx phone number resource ID';
COMMENT ON COLUMN phone_numbers.telnyx_messaging_profile_id IS 'Telnyx messaging profile ID for this number';
COMMENT ON COLUMN phone_numbers.sms_provider IS 'SMS provider for this number: signalwire or telnyx';
COMMENT ON COLUMN phone_numbers.voice_provider IS 'Voice provider for this number: signalwire or telnyx';
