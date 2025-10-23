-- 3CX Integration Tables
-- This migration adds support for 3CX PBX integration with Call-Helm

-- Organization 3CX configuration
CREATE TABLE IF NOT EXISTS three_cx_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  enabled BOOLEAN DEFAULT false,
  crm_url TEXT, -- Call-Helm URL for 3CX to connect to
  api_key TEXT UNIQUE, -- Generated API key for 3CX authentication
  three_cx_server_url TEXT, -- Optional: 3CX server URL for reverse integration
  settings JSONB DEFAULT '{}', -- Additional settings (call journaling, contact creation, etc.)
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(organization_id) -- One integration per organization
);

-- Agent extension mapping (3CX extension -> Call-Helm user)
CREATE TABLE IF NOT EXISTS three_cx_agent_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  three_cx_extension VARCHAR(20) NOT NULL,
  agent_id UUID REFERENCES organization_members(id) ON DELETE CASCADE,
  agent_email TEXT,
  agent_first_name TEXT,
  agent_last_name TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(organization_id, three_cx_extension)
);

-- 3CX call events log
CREATE TABLE IF NOT EXISTS three_cx_call_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  call_id UUID REFERENCES calls(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL, -- 'lookup', 'journal', 'create_contact', 'search'
  phone_number TEXT,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  agent_extension TEXT,
  call_direction TEXT, -- 'inbound', 'outbound'
  call_type TEXT, -- 'Inbound', 'Outbound', 'Missed', 'Notanswered'
  duration_seconds INTEGER,
  call_start_time TIMESTAMPTZ,
  call_end_time TIMESTAMPTZ,
  raw_data JSONB, -- Store all data from 3CX for debugging
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_3cx_integrations_org ON three_cx_integrations(organization_id);
CREATE INDEX IF NOT EXISTS idx_3cx_integrations_api_key ON three_cx_integrations(api_key) WHERE api_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_3cx_integrations_enabled ON three_cx_integrations(organization_id, enabled) WHERE enabled = true;

CREATE INDEX IF NOT EXISTS idx_3cx_agent_mappings_org ON three_cx_agent_mappings(organization_id);
CREATE INDEX IF NOT EXISTS idx_3cx_agent_mappings_ext ON three_cx_agent_mappings(organization_id, three_cx_extension);
CREATE INDEX IF NOT EXISTS idx_3cx_agent_mappings_agent ON three_cx_agent_mappings(agent_id) WHERE agent_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_3cx_call_events_org ON three_cx_call_events(organization_id);
CREATE INDEX IF NOT EXISTS idx_3cx_call_events_phone ON three_cx_call_events(phone_number) WHERE phone_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_3cx_call_events_contact ON three_cx_call_events(contact_id) WHERE contact_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_3cx_call_events_call ON three_cx_call_events(call_id) WHERE call_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_3cx_call_events_type ON three_cx_call_events(organization_id, event_type);
CREATE INDEX IF NOT EXISTS idx_3cx_call_events_created ON three_cx_call_events(created_at DESC);

-- RLS policies
ALTER TABLE three_cx_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE three_cx_agent_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE three_cx_call_events ENABLE ROW LEVEL SECURITY;

-- Policies for three_cx_integrations
DROP POLICY IF EXISTS "Users can view their org 3CX integration" ON three_cx_integrations;
CREATE POLICY "Users can view their org 3CX integration"
  ON three_cx_integrations FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id
      FROM organization_members
      WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Admins can manage 3CX integration" ON three_cx_integrations;
CREATE POLICY "Admins can manage 3CX integration"
  ON three_cx_integrations FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id
      FROM organization_members
      WHERE user_id = auth.uid() AND role IN ('org_admin', 'super_admin')
    )
  );

-- Policies for three_cx_agent_mappings
DROP POLICY IF EXISTS "Users can view agent mappings" ON three_cx_agent_mappings;
CREATE POLICY "Users can view agent mappings"
  ON three_cx_agent_mappings FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id
      FROM organization_members
      WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Admins can manage agent mappings" ON three_cx_agent_mappings;
CREATE POLICY "Admins can manage agent mappings"
  ON three_cx_agent_mappings FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id
      FROM organization_members
      WHERE user_id = auth.uid() AND role IN ('org_admin', 'super_admin')
    )
  );

-- Policies for three_cx_call_events (read-only for users, admins can insert)
DROP POLICY IF EXISTS "Users can view 3CX call events" ON three_cx_call_events;
CREATE POLICY "Users can view 3CX call events"
  ON three_cx_call_events FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id
      FROM organization_members
      WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "System can insert 3CX call events" ON three_cx_call_events;
CREATE POLICY "System can insert 3CX call events"
  ON three_cx_call_events FOR INSERT
  WITH CHECK (true); -- API will validate organization_id

-- Updated_at trigger for three_cx_integrations
CREATE OR REPLACE FUNCTION update_three_cx_integrations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS three_cx_integrations_updated_at ON three_cx_integrations;
CREATE TRIGGER three_cx_integrations_updated_at
  BEFORE UPDATE ON three_cx_integrations
  FOR EACH ROW
  EXECUTE FUNCTION update_three_cx_integrations_updated_at();

-- Updated_at trigger for three_cx_agent_mappings
CREATE OR REPLACE FUNCTION update_three_cx_agent_mappings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS three_cx_agent_mappings_updated_at ON three_cx_agent_mappings;
CREATE TRIGGER three_cx_agent_mappings_updated_at
  BEFORE UPDATE ON three_cx_agent_mappings
  FOR EACH ROW
  EXECUTE FUNCTION update_three_cx_agent_mappings_updated_at();

-- Comment on tables
COMMENT ON TABLE three_cx_integrations IS '3CX PBX integration configuration per organization';
COMMENT ON TABLE three_cx_agent_mappings IS 'Maps 3CX extensions to Call-Helm users for call attribution';
COMMENT ON TABLE three_cx_call_events IS 'Logs all 3CX integration events (lookups, journaling, etc.) for debugging and analytics';
