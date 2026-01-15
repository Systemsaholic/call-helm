-- SMS Broadcasts Feature Migration
-- Enable bulk SMS messaging with 10DLC compliance

-- SMS Broadcasts table - stores broadcast campaigns
CREATE TABLE IF NOT EXISTS sms_broadcasts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  message_template TEXT NOT NULL,
  from_phone_number_id UUID NOT NULL REFERENCES phone_numbers(id),
  campaign_id UUID REFERENCES campaign_registry_campaigns(id), -- 10DLC compliance
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'sending', 'paused', 'completed', 'cancelled', 'failed')),
  scheduled_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  total_recipients INTEGER DEFAULT 0,
  sent_count INTEGER DEFAULT 0,
  delivered_count INTEGER DEFAULT 0,
  failed_count INTEGER DEFAULT 0,
  opted_out_skipped INTEGER DEFAULT 0,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Broadcast Recipients table - individual recipients for each broadcast
CREATE TABLE IF NOT EXISTS sms_broadcast_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  broadcast_id UUID NOT NULL REFERENCES sms_broadcasts(id) ON DELETE CASCADE,
  phone_number TEXT NOT NULL,
  contact_name TEXT,
  variables JSONB DEFAULT '{}', -- For template variable replacement
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sending', 'sent', 'delivered', 'failed', 'skipped')),
  skip_reason TEXT, -- 'opted_out', 'invalid_number', 'duplicate'
  message_id UUID REFERENCES sms_messages(id),
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_broadcasts_org ON sms_broadcasts(organization_id);
CREATE INDEX IF NOT EXISTS idx_broadcasts_status ON sms_broadcasts(status);
CREATE INDEX IF NOT EXISTS idx_broadcasts_scheduled ON sms_broadcasts(scheduled_at) WHERE status = 'scheduled';
CREATE INDEX IF NOT EXISTS idx_broadcasts_created_at ON sms_broadcasts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_broadcast_recipients_broadcast ON sms_broadcast_recipients(broadcast_id);
CREATE INDEX IF NOT EXISTS idx_broadcast_recipients_status ON sms_broadcast_recipients(status);
CREATE INDEX IF NOT EXISTS idx_broadcast_recipients_pending ON sms_broadcast_recipients(broadcast_id, status) WHERE status = 'pending';

-- Enable RLS
ALTER TABLE sms_broadcasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE sms_broadcast_recipients ENABLE ROW LEVEL SECURITY;

-- RLS Policy for broadcasts
CREATE POLICY "Users can view broadcasts for their org" ON sms_broadcasts
  FOR SELECT USING (organization_id IN (
    SELECT organization_id FROM organization_members
    WHERE user_id = auth.uid() AND status = 'active'
  ));

CREATE POLICY "Users can create broadcasts for their org" ON sms_broadcasts
  FOR INSERT WITH CHECK (organization_id IN (
    SELECT organization_id FROM organization_members
    WHERE user_id = auth.uid() AND status = 'active'
  ));

CREATE POLICY "Users can update broadcasts for their org" ON sms_broadcasts
  FOR UPDATE USING (organization_id IN (
    SELECT organization_id FROM organization_members
    WHERE user_id = auth.uid() AND status = 'active'
  ));

CREATE POLICY "Users can delete broadcasts for their org" ON sms_broadcasts
  FOR DELETE USING (organization_id IN (
    SELECT organization_id FROM organization_members
    WHERE user_id = auth.uid() AND status = 'active'
  ));

-- RLS Policy for broadcast recipients
CREATE POLICY "Users can view broadcast recipients for their org" ON sms_broadcast_recipients
  FOR SELECT USING (broadcast_id IN (
    SELECT id FROM sms_broadcasts WHERE organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND status = 'active'
    )
  ));

CREATE POLICY "Users can create broadcast recipients for their org" ON sms_broadcast_recipients
  FOR INSERT WITH CHECK (broadcast_id IN (
    SELECT id FROM sms_broadcasts WHERE organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND status = 'active'
    )
  ));

CREATE POLICY "Users can update broadcast recipients for their org" ON sms_broadcast_recipients
  FOR UPDATE USING (broadcast_id IN (
    SELECT id FROM sms_broadcasts WHERE organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND status = 'active'
    )
  ));

CREATE POLICY "Users can delete broadcast recipients for their org" ON sms_broadcast_recipients
  FOR DELETE USING (broadcast_id IN (
    SELECT id FROM sms_broadcasts WHERE organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND status = 'active'
    )
  ));

-- Add sms_broadcasts feature to subscription_plan_features if not exists
INSERT INTO subscription_plan_features (plan_id, feature_key, is_enabled)
SELECT sp.id, 'sms_broadcasts',
  CASE
    WHEN sp.slug IN ('professional', 'enterprise') THEN true
    ELSE false
  END
FROM subscription_plans sp
WHERE NOT EXISTS (
  SELECT 1 FROM subscription_plan_features spf
  WHERE spf.plan_id = sp.id AND spf.feature_key = 'sms_broadcasts'
)
ON CONFLICT (plan_id, feature_key) DO NOTHING;

-- Function to update broadcast stats
CREATE OR REPLACE FUNCTION update_broadcast_stats()
RETURNS TRIGGER AS $$
BEGIN
  -- Update the broadcast stats when a recipient status changes
  UPDATE sms_broadcasts
  SET
    sent_count = (
      SELECT COUNT(*) FROM sms_broadcast_recipients
      WHERE broadcast_id = NEW.broadcast_id AND status IN ('sent', 'delivered')
    ),
    delivered_count = (
      SELECT COUNT(*) FROM sms_broadcast_recipients
      WHERE broadcast_id = NEW.broadcast_id AND status = 'delivered'
    ),
    failed_count = (
      SELECT COUNT(*) FROM sms_broadcast_recipients
      WHERE broadcast_id = NEW.broadcast_id AND status = 'failed'
    ),
    opted_out_skipped = (
      SELECT COUNT(*) FROM sms_broadcast_recipients
      WHERE broadcast_id = NEW.broadcast_id AND status = 'skipped' AND skip_reason = 'opted_out'
    ),
    updated_at = NOW()
  WHERE id = NEW.broadcast_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to auto-update broadcast stats
DROP TRIGGER IF EXISTS update_broadcast_stats_trigger ON sms_broadcast_recipients;
CREATE TRIGGER update_broadcast_stats_trigger
  AFTER UPDATE OF status ON sms_broadcast_recipients
  FOR EACH ROW
  EXECUTE FUNCTION update_broadcast_stats();

-- Function to check broadcast completion
CREATE OR REPLACE FUNCTION check_broadcast_completion()
RETURNS TRIGGER AS $$
DECLARE
  pending_count INTEGER;
  sending_count INTEGER;
BEGIN
  -- Check if all recipients have been processed
  SELECT
    COUNT(*) FILTER (WHERE status = 'pending'),
    COUNT(*) FILTER (WHERE status = 'sending')
  INTO pending_count, sending_count
  FROM sms_broadcast_recipients
  WHERE broadcast_id = NEW.broadcast_id;

  -- If no more pending or sending, mark broadcast as completed
  IF pending_count = 0 AND sending_count = 0 THEN
    UPDATE sms_broadcasts
    SET
      status = 'completed',
      completed_at = NOW(),
      updated_at = NOW()
    WHERE id = NEW.broadcast_id AND status = 'sending';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to check broadcast completion
DROP TRIGGER IF EXISTS check_broadcast_completion_trigger ON sms_broadcast_recipients;
CREATE TRIGGER check_broadcast_completion_trigger
  AFTER UPDATE OF status ON sms_broadcast_recipients
  FOR EACH ROW
  WHEN (NEW.status IN ('sent', 'delivered', 'failed', 'skipped'))
  EXECUTE FUNCTION check_broadcast_completion();

-- Add broadcast_id column to usage_events for tracking
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'usage_events' AND column_name = 'broadcast_id'
  ) THEN
    ALTER TABLE usage_events ADD COLUMN broadcast_id UUID REFERENCES sms_broadcasts(id);
  END IF;
END $$;

COMMENT ON TABLE sms_broadcasts IS 'SMS broadcast campaigns for bulk messaging';
COMMENT ON TABLE sms_broadcast_recipients IS 'Individual recipients for SMS broadcasts';
COMMENT ON COLUMN sms_broadcasts.campaign_id IS '10DLC campaign ID for compliance';
COMMENT ON COLUMN sms_broadcast_recipients.variables IS 'Template variables for personalization';
