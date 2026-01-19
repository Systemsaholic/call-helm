-- Two-Leg Bridge Calling Support
-- Enables agent-first call flow: Call Agent -> Agent Answers -> Call Contact -> Bridge
-- Supports cell phones, 3CX DIDs, and SIP URIs as agent endpoints

-- ============================================
-- 1. ORGANIZATION_MEMBERS: Agent phone preferences
-- ============================================

-- Phone type for agent (how to reach them)
ALTER TABLE organization_members ADD COLUMN IF NOT EXISTS phone_type VARCHAR(20) DEFAULT 'cell'
  CHECK (phone_type IN ('cell', '3cx_did', 'sip_uri'));

-- SIP URI for agents with 3CX extensions (format: sip:extension@3cx-server.com)
ALTER TABLE organization_members ADD COLUMN IF NOT EXISTS sip_uri VARCHAR(255);

-- 3CX extension number for reference
ALTER TABLE organization_members ADD COLUMN IF NOT EXISTS three_cx_extension VARCHAR(20);

-- Comments for documentation
COMMENT ON COLUMN organization_members.phone_type IS 'How to reach agent: cell (phone number), 3cx_did (direct inward dial), sip_uri (SIP URI)';
COMMENT ON COLUMN organization_members.sip_uri IS 'SIP URI for calling agent (e.g., sip:1001@company.3cx.us)';
COMMENT ON COLUMN organization_members.three_cx_extension IS 'Agent 3CX extension number for display/reference';

-- ============================================
-- 2. CALL_LISTS: Custom dispositions and recording settings
-- ============================================

-- Custom dispositions defined per campaign (up to 4)
-- Format: [{label: "Interested", value: "interested"}, ...]
ALTER TABLE call_lists ADD COLUMN IF NOT EXISTS custom_dispositions JSONB DEFAULT '[]';

-- Recording announcement settings
ALTER TABLE call_lists ADD COLUMN IF NOT EXISTS announce_recording BOOLEAN DEFAULT true;
ALTER TABLE call_lists ADD COLUMN IF NOT EXISTS recording_announcement_url TEXT;

-- Comments
COMMENT ON COLUMN call_lists.custom_dispositions IS 'Custom disposition options for this campaign (up to 4)';
COMMENT ON COLUMN call_lists.announce_recording IS 'Whether to play recording announcement before bridging';
COMMENT ON COLUMN call_lists.recording_announcement_url IS 'Custom recording announcement audio URL (null = use system default)';

-- ============================================
-- 3. CALLS: Bridge call tracking
-- ============================================

-- Call control IDs for both legs
ALTER TABLE calls ADD COLUMN IF NOT EXISTS agent_call_control_id VARCHAR(255);
ALTER TABLE calls ADD COLUMN IF NOT EXISTS contact_call_control_id VARCHAR(255);

-- Bridge status tracking
ALTER TABLE calls ADD COLUMN IF NOT EXISTS bridge_status VARCHAR(50) DEFAULT 'pending'
  CHECK (bridge_status IN (
    'pending',           -- Initial state
    'agent_ringing',     -- Calling agent's phone
    'agent_answered',    -- Agent picked up, playing announcement
    'connecting_contact', -- Calling contact
    'contact_ringing',   -- Contact's phone is ringing
    'bridged',           -- Both parties connected
    'completed',         -- Call ended normally
    'agent_no_answer',   -- Agent didn't answer
    'contact_no_answer', -- Contact didn't answer
    'agent_busy',        -- Agent line busy
    'contact_busy',      -- Contact line busy
    'failed'             -- Technical failure
  ));

-- Timestamps for each phase
ALTER TABLE calls ADD COLUMN IF NOT EXISTS agent_answered_at TIMESTAMPTZ;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS contact_answered_at TIMESTAMPTZ;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS bridge_created_at TIMESTAMPTZ;

-- Agent endpoint used (for tracking/analytics)
ALTER TABLE calls ADD COLUMN IF NOT EXISTS agent_endpoint VARCHAR(255);
ALTER TABLE calls ADD COLUMN IF NOT EXISTS agent_endpoint_type VARCHAR(20);

-- Comments
COMMENT ON COLUMN calls.agent_call_control_id IS 'Telnyx call control ID for the agent leg';
COMMENT ON COLUMN calls.contact_call_control_id IS 'Telnyx call control ID for the contact leg';
COMMENT ON COLUMN calls.bridge_status IS 'Current status of the two-leg bridge call';
COMMENT ON COLUMN calls.agent_answered_at IS 'Timestamp when agent answered';
COMMENT ON COLUMN calls.contact_answered_at IS 'Timestamp when contact answered';
COMMENT ON COLUMN calls.bridge_created_at IS 'Timestamp when calls were bridged together';
COMMENT ON COLUMN calls.agent_endpoint IS 'The endpoint used to reach agent (phone/DID/SIP URI)';
COMMENT ON COLUMN calls.agent_endpoint_type IS 'Type of endpoint: cell, 3cx_did, or sip_uri';

-- ============================================
-- 4. INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_calls_bridge_status ON calls(bridge_status) WHERE bridge_status IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_calls_agent_call_control_id ON calls(agent_call_control_id) WHERE agent_call_control_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_calls_contact_call_control_id ON calls(contact_call_control_id) WHERE contact_call_control_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_org_members_phone_type ON organization_members(phone_type);

-- ============================================
-- 5. CALL_ATTEMPTS: Link to AI goal evaluation
-- ============================================

-- Store AI evaluation of goal/topic coverage
ALTER TABLE call_attempts ADD COLUMN IF NOT EXISTS ai_goals_evaluated JSONB DEFAULT '[]';
ALTER TABLE call_attempts ADD COLUMN IF NOT EXISTS ai_topic_coverage_rate DECIMAL(5,2);

COMMENT ON COLUMN call_attempts.ai_goals_evaluated IS 'AI evaluation of each call goal: [{goal: string, achieved: boolean, evidence: string}]';
COMMENT ON COLUMN call_attempts.ai_topic_coverage_rate IS 'Percentage of call goals/topics covered (0-100)';

-- ============================================
-- 6. DEFAULT RECORDING ANNOUNCEMENT
-- ============================================

-- Create a system settings table for defaults if not exists
CREATE TABLE IF NOT EXISTS system_settings (
  key VARCHAR(100) PRIMARY KEY,
  value JSONB NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default recording announcement URL
INSERT INTO system_settings (key, value, description)
VALUES (
  'default_recording_announcement_url',
  '"https://call-helm-assets.s3.amazonaws.com/audio/recording-announcement.mp3"'::jsonb,
  'Default audio file played to announce call recording'
)
ON CONFLICT (key) DO NOTHING;

-- ============================================
-- 7. ORGANIZATION SETTINGS: 3CX Server Config
-- ============================================

-- Add 3CX server URL to organization settings
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS three_cx_server_url VARCHAR(255);

COMMENT ON COLUMN organizations.three_cx_server_url IS 'Organization 3CX server URL for SIP URI construction (e.g., company.3cx.us)';
