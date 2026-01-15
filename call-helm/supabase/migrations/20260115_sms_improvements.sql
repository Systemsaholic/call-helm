-- SMS System Improvements Migration
-- Adds tables and columns for: scheduled messages, templates, workflow status,
-- agent handoffs, analytics, and opt-out history

-- =============================================================================
-- 1. SCHEDULED MESSAGES
-- =============================================================================
CREATE TABLE IF NOT EXISTS scheduled_sms_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES sms_conversations(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  to_number TEXT NOT NULL,
  from_number TEXT,
  message_body TEXT NOT NULL,
  media_urls TEXT[],
  scheduled_at TIMESTAMPTZ NOT NULL,
  timezone TEXT DEFAULT 'UTC',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'cancelled')),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  sent_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_scheduled_sms_org ON scheduled_sms_messages(organization_id);
CREATE INDEX idx_scheduled_sms_status ON scheduled_sms_messages(status, scheduled_at);
CREATE INDEX idx_scheduled_sms_scheduled_at ON scheduled_sms_messages(scheduled_at) WHERE status = 'pending';

-- RLS for scheduled messages
ALTER TABLE scheduled_sms_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their org scheduled messages"
  ON scheduled_sms_messages FOR SELECT
  USING (organization_id IN (
    SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "Users can insert scheduled messages for their org"
  ON scheduled_sms_messages FOR INSERT
  WITH CHECK (organization_id IN (
    SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "Users can update their org scheduled messages"
  ON scheduled_sms_messages FOR UPDATE
  USING (organization_id IN (
    SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "Users can delete their org scheduled messages"
  ON scheduled_sms_messages FOR DELETE
  USING (organization_id IN (
    SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
  ));

-- =============================================================================
-- 2. MESSAGE TEMPLATES
-- =============================================================================
CREATE TABLE IF NOT EXISTS sms_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT DEFAULT 'general',
  variables TEXT[], -- List of variable names like ['firstName', 'company']
  is_shared BOOLEAN DEFAULT true,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  usage_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, name)
);

CREATE INDEX idx_sms_templates_org ON sms_templates(organization_id);
CREATE INDEX idx_sms_templates_category ON sms_templates(organization_id, category);

-- RLS for templates
ALTER TABLE sms_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their org templates"
  ON sms_templates FOR SELECT
  USING (organization_id IN (
    SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "Users can insert templates for their org"
  ON sms_templates FOR INSERT
  WITH CHECK (organization_id IN (
    SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "Users can update their org templates"
  ON sms_templates FOR UPDATE
  USING (organization_id IN (
    SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "Users can delete their org templates"
  ON sms_templates FOR DELETE
  USING (organization_id IN (
    SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
  ));

-- =============================================================================
-- 3. CONVERSATION WORKFLOW STATUS
-- =============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sms_conversations' AND column_name = 'workflow_status'
  ) THEN
    ALTER TABLE sms_conversations
    ADD COLUMN workflow_status TEXT DEFAULT 'open'
    CHECK (workflow_status IN ('open', 'pending', 'waiting_response', 'resolved', 'escalated', 'on_hold'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sms_conversations' AND column_name = 'priority'
  ) THEN
    ALTER TABLE sms_conversations
    ADD COLUMN priority TEXT DEFAULT 'normal'
    CHECK (priority IN ('low', 'normal', 'high', 'urgent'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sms_conversations' AND column_name = 'tags'
  ) THEN
    ALTER TABLE sms_conversations ADD COLUMN tags TEXT[];
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_sms_conv_workflow ON sms_conversations(workflow_status);
CREATE INDEX IF NOT EXISTS idx_sms_conv_priority ON sms_conversations(priority);
CREATE INDEX IF NOT EXISTS idx_sms_conv_tags ON sms_conversations USING GIN(tags);

-- =============================================================================
-- 4. AGENT HANDOFF TRACKING
-- =============================================================================
CREATE TABLE IF NOT EXISTS conversation_handoffs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES sms_conversations(id) ON DELETE CASCADE,
  from_agent_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  to_agent_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason TEXT,
  notes TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'expired')),
  acknowledged_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_handoffs_conversation ON conversation_handoffs(conversation_id);
CREATE INDEX idx_handoffs_to_agent ON conversation_handoffs(to_agent_id, status);

-- RLS for handoffs
ALTER TABLE conversation_handoffs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view handoffs involving them"
  ON conversation_handoffs FOR SELECT
  USING (
    from_agent_id = auth.uid() OR
    to_agent_id = auth.uid() OR
    conversation_id IN (
      SELECT id FROM sms_conversations WHERE organization_id IN (
        SELECT organization_id FROM organization_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
      )
    )
  );

CREATE POLICY "Users can create handoffs"
  ON conversation_handoffs FOR INSERT
  WITH CHECK (from_agent_id = auth.uid() OR from_agent_id IS NULL);

CREATE POLICY "Target agents can update handoffs"
  ON conversation_handoffs FOR UPDATE
  USING (to_agent_id = auth.uid() OR from_agent_id = auth.uid());

-- =============================================================================
-- 5. SMS ANALYTICS (Aggregated Daily Stats)
-- =============================================================================
CREATE TABLE IF NOT EXISTS sms_analytics_daily (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  messages_sent INTEGER DEFAULT 0,
  messages_received INTEGER DEFAULT 0,
  messages_failed INTEGER DEFAULT 0,
  unique_contacts INTEGER DEFAULT 0,
  avg_response_time_seconds INTEGER,
  opt_outs INTEGER DEFAULT 0,
  segments_used INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, date)
);

CREATE INDEX idx_sms_analytics_org_date ON sms_analytics_daily(organization_id, date DESC);

-- RLS for analytics
ALTER TABLE sms_analytics_daily ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their org analytics"
  ON sms_analytics_daily FOR SELECT
  USING (organization_id IN (
    SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
  ));

-- Function to update daily analytics
CREATE OR REPLACE FUNCTION update_sms_daily_analytics()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO sms_analytics_daily (organization_id, date, messages_sent, messages_received)
  SELECT
    c.organization_id,
    DATE(NEW.created_at),
    CASE WHEN NEW.direction = 'outbound' THEN 1 ELSE 0 END,
    CASE WHEN NEW.direction = 'inbound' THEN 1 ELSE 0 END
  FROM sms_conversations c
  WHERE c.id = NEW.conversation_id
  ON CONFLICT (organization_id, date) DO UPDATE SET
    messages_sent = sms_analytics_daily.messages_sent + CASE WHEN NEW.direction = 'outbound' THEN 1 ELSE 0 END,
    messages_received = sms_analytics_daily.messages_received + CASE WHEN NEW.direction = 'inbound' THEN 1 ELSE 0 END;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_update_sms_analytics ON sms_messages;
CREATE TRIGGER trigger_update_sms_analytics
  AFTER INSERT ON sms_messages
  FOR EACH ROW
  EXECUTE FUNCTION update_sms_daily_analytics();

-- =============================================================================
-- 6. OPT-OUT HISTORY
-- =============================================================================
CREATE TABLE IF NOT EXISTS sms_opt_out_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  phone_number TEXT NOT NULL,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  action TEXT NOT NULL CHECK (action IN ('opt_out', 'opt_in')),
  reason TEXT,
  performed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_opt_out_history_org ON sms_opt_out_history(organization_id);
CREATE INDEX idx_opt_out_history_phone ON sms_opt_out_history(phone_number);

-- RLS for opt-out history
ALTER TABLE sms_opt_out_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their org opt-out history"
  ON sms_opt_out_history FOR SELECT
  USING (organization_id IN (
    SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "Users can insert opt-out history for their org"
  ON sms_opt_out_history FOR INSERT
  WITH CHECK (organization_id IN (
    SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
  ));

-- =============================================================================
-- 7. SENTIMENT ANALYSIS TABLE (if not exists)
-- =============================================================================
CREATE TABLE IF NOT EXISTS sms_message_analysis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES sms_messages(id) ON DELETE CASCADE,
  sentiment TEXT CHECK (sentiment IN ('positive', 'neutral', 'negative')),
  sentiment_score REAL,
  keywords TEXT[],
  intent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(message_id)
);

CREATE INDEX idx_sms_analysis_message ON sms_message_analysis(message_id);

-- RLS for message analysis
ALTER TABLE sms_message_analysis ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view message analysis for their org"
  ON sms_message_analysis FOR SELECT
  USING (message_id IN (
    SELECT m.id FROM sms_messages m
    JOIN sms_conversations c ON m.conversation_id = c.id
    WHERE c.organization_id IN (
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    )
  ));

-- =============================================================================
-- 8. ENHANCED SEARCH FUNCTION WITH FILTERS
-- =============================================================================
CREATE OR REPLACE FUNCTION search_sms_messages_advanced(
  p_organization_id UUID,
  p_query TEXT DEFAULT NULL,
  p_date_from TIMESTAMPTZ DEFAULT NULL,
  p_date_to TIMESTAMPTZ DEFAULT NULL,
  p_direction TEXT DEFAULT NULL,
  p_assigned_agent_id UUID DEFAULT NULL,
  p_workflow_status TEXT DEFAULT NULL,
  p_limit INT DEFAULT 50,
  p_offset INT DEFAULT 0
)
RETURNS TABLE (
  message_id UUID,
  conversation_id UUID,
  message_body TEXT,
  direction TEXT,
  from_number TEXT,
  to_number TEXT,
  created_at TIMESTAMPTZ,
  contact_name TEXT,
  contact_phone TEXT,
  workflow_status TEXT,
  assigned_agent_id UUID,
  rank REAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    m.id AS message_id,
    m.conversation_id,
    m.message_body,
    m.direction,
    m.from_number,
    m.to_number,
    m.created_at,
    COALESCE(ct.first_name || ' ' || ct.last_name, c.phone_number) AS contact_name,
    c.phone_number AS contact_phone,
    c.workflow_status,
    c.assigned_agent_id,
    CASE
      WHEN p_query IS NOT NULL AND m.search_vector IS NOT NULL
      THEN ts_rank(m.search_vector, websearch_to_tsquery('english', p_query))
      ELSE 1.0
    END AS rank
  FROM sms_messages m
  JOIN sms_conversations c ON m.conversation_id = c.id
  LEFT JOIN contacts ct ON c.contact_id = ct.id
  WHERE c.organization_id = p_organization_id
    AND (p_query IS NULL OR m.search_vector @@ websearch_to_tsquery('english', p_query))
    AND (p_date_from IS NULL OR m.created_at >= p_date_from)
    AND (p_date_to IS NULL OR m.created_at <= p_date_to)
    AND (p_direction IS NULL OR m.direction = p_direction)
    AND (p_assigned_agent_id IS NULL OR c.assigned_agent_id = p_assigned_agent_id)
    AND (p_workflow_status IS NULL OR c.workflow_status = p_workflow_status)
  ORDER BY
    CASE
      WHEN p_query IS NOT NULL AND m.search_vector IS NOT NULL
      THEN ts_rank(m.search_vector, websearch_to_tsquery('english', p_query))
      ELSE 0
    END DESC,
    m.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION search_sms_messages_advanced TO authenticated;

-- =============================================================================
-- 9. SEED DEFAULT TEMPLATES
-- =============================================================================
-- Templates will be created per-organization on first use

COMMENT ON TABLE scheduled_sms_messages IS 'Stores scheduled SMS messages for future delivery';
COMMENT ON TABLE sms_templates IS 'Reusable message templates with variable substitution';
COMMENT ON TABLE conversation_handoffs IS 'Tracks agent-to-agent conversation transfers';
COMMENT ON TABLE sms_analytics_daily IS 'Aggregated daily SMS statistics per organization';
COMMENT ON TABLE sms_opt_out_history IS 'Audit trail of opt-in/opt-out actions';
COMMENT ON TABLE sms_message_analysis IS 'AI-generated sentiment and intent analysis for messages';
