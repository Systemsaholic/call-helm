-- Create message_reactions table for storing reactions to SMS messages
CREATE TABLE IF NOT EXISTS message_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES sms_messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  reaction VARCHAR(50) NOT NULL, -- emoji or reaction type (like, heart, thumbs_up, etc.)
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  
  -- Ensure a user can only have one of each reaction type per message
  UNIQUE(message_id, user_id, reaction)
);

-- Create indexes for performance
CREATE INDEX idx_message_reactions_message_id ON message_reactions(message_id);
CREATE INDEX idx_message_reactions_user_id ON message_reactions(user_id);
CREATE INDEX idx_message_reactions_organization_id ON message_reactions(organization_id);
CREATE INDEX idx_message_reactions_created_at ON message_reactions(created_at DESC);

-- Enable RLS
ALTER TABLE message_reactions ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view reactions in their organization"
  ON message_reactions
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id 
      FROM organization_members 
      WHERE user_id = auth.uid() 
        AND is_active = true
    )
  );

CREATE POLICY "Users can add reactions in their organization"
  ON message_reactions
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

CREATE POLICY "Users can remove their own reactions"
  ON message_reactions
  FOR DELETE
  USING (
    user_id = auth.uid() AND
    organization_id IN (
      SELECT organization_id 
      FROM organization_members 
      WHERE user_id = auth.uid() 
        AND is_active = true
    )
  );

-- Add a column to sms_messages to cache reaction counts (for performance)
ALTER TABLE sms_messages 
ADD COLUMN IF NOT EXISTS reaction_counts JSONB DEFAULT '{}';

-- Function to update reaction counts when reactions change
CREATE OR REPLACE FUNCTION update_message_reaction_counts()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' OR TG_OP = 'DELETE' THEN
    UPDATE sms_messages
    SET reaction_counts = (
      SELECT jsonb_object_agg(reaction, count)
      FROM (
        SELECT reaction, COUNT(*) as count
        FROM message_reactions
        WHERE message_id = COALESCE(NEW.message_id, OLD.message_id)
        GROUP BY reaction
      ) as counts
    )
    WHERE id = COALESCE(NEW.message_id, OLD.message_id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to update reaction counts
CREATE TRIGGER trigger_update_message_reaction_counts
AFTER INSERT OR DELETE ON message_reactions
FOR EACH ROW
EXECUTE FUNCTION update_message_reaction_counts();

-- Create a view for messages with reactions
CREATE OR REPLACE VIEW messages_with_reactions AS
SELECT 
  m.*,
  COALESCE(m.reaction_counts, '{}'::jsonb) as reactions,
  (
    SELECT jsonb_agg(
      jsonb_build_object(
        'id', r.id,
        'user_id', r.user_id,
        'reaction', r.reaction,
        'created_at', r.created_at,
        'user_name', om.full_name
      )
    )
    FROM message_reactions r
    JOIN organization_members om ON om.user_id = r.user_id AND om.organization_id = r.organization_id
    WHERE r.message_id = m.id
  ) as reaction_details
FROM sms_messages m;