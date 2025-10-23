-- Create message_read_status table for tracking which messages have been read by which users
CREATE TABLE IF NOT EXISTS message_read_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES sms_messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  read_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  
  -- Ensure a user can only have one read status per message
  UNIQUE(message_id, user_id)
);

-- Create indexes for performance
CREATE INDEX idx_message_read_status_message_id ON message_read_status(message_id);
CREATE INDEX idx_message_read_status_user_id ON message_read_status(user_id);
CREATE INDEX idx_message_read_status_organization_id ON message_read_status(organization_id);
CREATE INDEX idx_message_read_status_read_at ON message_read_status(read_at DESC);

-- Enable RLS
ALTER TABLE message_read_status ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view read status in their organization"
  ON message_read_status
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id 
      FROM organization_members 
      WHERE user_id = auth.uid() 
        AND is_active = true
    )
  );

CREATE POLICY "Users can mark messages as read in their organization"
  ON message_read_status
  FOR INSERT
  WITH CHECK (
    user_id = auth.uid() AND
    organization_id IN (
      SELECT organization_id 
      FROM organization_members 
      WHERE user_id = auth.uid() 
        AND is_active = true
    )
  );

CREATE POLICY "Users can update their own read status"
  ON message_read_status
  FOR UPDATE
  USING (
    user_id = auth.uid() AND
    organization_id IN (
      SELECT organization_id 
      FROM organization_members 
      WHERE user_id = auth.uid() 
        AND is_active = true
    )
  );

-- Add columns to sms_conversations for tracking unread counts
ALTER TABLE sms_conversations 
ADD COLUMN IF NOT EXISTS last_message_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS unread_count INTEGER DEFAULT 0;

-- Function to update conversation unread count
CREATE OR REPLACE FUNCTION update_conversation_unread_count()
RETURNS TRIGGER AS $$
DECLARE
  v_conversation_id UUID;
  v_org_id UUID;
BEGIN
  -- Get conversation details from the message
  IF TG_TABLE_NAME = 'sms_messages' THEN
    v_conversation_id := NEW.conversation_id;
    v_org_id := NEW.organization_id;
  ELSE
    -- For message_read_status, we need to get the conversation from the message
    SELECT conversation_id, organization_id INTO v_conversation_id, v_org_id
    FROM sms_messages
    WHERE id = NEW.message_id;
  END IF;

  -- Update the conversation's last message time and unread count
  UPDATE sms_conversations
  SET 
    last_message_at = GREATEST(
      last_message_at, 
      COALESCE((
        SELECT MAX(created_at) 
        FROM sms_messages 
        WHERE conversation_id = v_conversation_id
      ), NOW())
    ),
    unread_count = (
      SELECT COUNT(*)
      FROM sms_messages m
      WHERE m.conversation_id = v_conversation_id
        AND m.direction = 'inbound'
        AND NOT EXISTS (
          SELECT 1 
          FROM message_read_status mrs
          WHERE mrs.message_id = m.id
            AND mrs.user_id = auth.uid()
        )
    ),
    updated_at = NOW()
  WHERE id = v_conversation_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create triggers to update conversation unread counts
CREATE TRIGGER trigger_update_conversation_on_new_message
AFTER INSERT ON sms_messages
FOR EACH ROW
EXECUTE FUNCTION update_conversation_unread_count();

CREATE TRIGGER trigger_update_conversation_on_read_status
AFTER INSERT OR UPDATE ON message_read_status
FOR EACH ROW
EXECUTE FUNCTION update_conversation_unread_count();

-- Function to mark all messages in a conversation as read
CREATE OR REPLACE FUNCTION mark_conversation_as_read(
  p_conversation_id UUID,
  p_user_id UUID DEFAULT auth.uid()
)
RETURNS INTEGER AS $$
DECLARE
  v_marked_count INTEGER;
  v_org_id UUID;
BEGIN
  -- Get organization ID from conversation
  SELECT organization_id INTO v_org_id
  FROM sms_conversations
  WHERE id = p_conversation_id;

  -- Mark all unread messages as read
  INSERT INTO message_read_status (message_id, user_id, organization_id)
  SELECT 
    m.id,
    p_user_id,
    v_org_id
  FROM sms_messages m
  WHERE m.conversation_id = p_conversation_id
    AND m.direction = 'inbound'
    AND NOT EXISTS (
      SELECT 1 
      FROM message_read_status mrs
      WHERE mrs.message_id = m.id
        AND mrs.user_id = p_user_id
    )
  ON CONFLICT (message_id, user_id) DO NOTHING;

  GET DIAGNOSTICS v_marked_count = ROW_COUNT;

  -- Update conversation unread count
  UPDATE sms_conversations
  SET unread_count = 0
  WHERE id = p_conversation_id;

  RETURN v_marked_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get total unread count for a user
CREATE OR REPLACE FUNCTION get_total_unread_count(
  p_user_id UUID DEFAULT auth.uid()
)
RETURNS TABLE(
  total_unread INTEGER,
  conversations_with_unread INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COALESCE(SUM(
      (SELECT COUNT(*)
       FROM sms_messages m
       WHERE m.conversation_id = c.id
         AND m.direction = 'inbound'
         AND NOT EXISTS (
           SELECT 1 
           FROM message_read_status mrs
           WHERE mrs.message_id = m.id
             AND mrs.user_id = p_user_id
         )
      )
    ), 0)::INTEGER as total_unread,
    COUNT(DISTINCT c.id)::INTEGER as conversations_with_unread
  FROM sms_conversations c
  WHERE c.organization_id IN (
    SELECT organization_id 
    FROM organization_members 
    WHERE user_id = p_user_id 
      AND is_active = true
  )
  AND EXISTS (
    SELECT 1
    FROM sms_messages m
    WHERE m.conversation_id = c.id
      AND m.direction = 'inbound'
      AND NOT EXISTS (
        SELECT 1 
        FROM message_read_status mrs
        WHERE mrs.message_id = m.id
          AND mrs.user_id = p_user_id
      )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create a view for conversations with unread counts
CREATE OR REPLACE VIEW conversations_with_unread AS
SELECT 
  c.*,
  (
    SELECT COUNT(*)
    FROM sms_messages m
    WHERE m.conversation_id = c.id
      AND m.direction = 'inbound'
      AND NOT EXISTS (
        SELECT 1 
        FROM message_read_status mrs
        WHERE mrs.message_id = m.id
          AND mrs.user_id = auth.uid()
      )
  ) as user_unread_count,
  (
    SELECT MAX(created_at)
    FROM sms_messages
    WHERE conversation_id = c.id
  ) as last_message_time
FROM sms_conversations c;