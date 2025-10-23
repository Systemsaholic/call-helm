-- Enable real-time on sms_messages table
ALTER PUBLICATION supabase_realtime ADD TABLE sms_messages;

-- Enable real-time on message_read_status table
ALTER PUBLICATION supabase_realtime ADD TABLE message_read_status;

-- Grant necessary permissions for real-time
GRANT SELECT ON sms_messages TO authenticated;
GRANT SELECT ON message_read_status TO authenticated;

-- Ensure RLS allows real-time events
-- Update RLS policy for sms_messages to allow real-time
DROP POLICY IF EXISTS "Users can view their own messages" ON sms_messages;
CREATE POLICY "Users can view their own messages" ON sms_messages
  FOR SELECT
  USING (auth.uid() = user_id);

-- Update RLS policy for message_read_status to allow real-time
DROP POLICY IF EXISTS "Users can view their own read status" ON message_read_status;
CREATE POLICY "Users can view their own read status" ON message_read_status
  FOR SELECT
  USING (auth.uid() = user_id);