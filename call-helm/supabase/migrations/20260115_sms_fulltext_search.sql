-- Add full-text search capability to sms_messages table
-- Uses PostgreSQL tsvector for efficient text search across message content

-- Add tsvector column for full-text search
ALTER TABLE sms_messages
ADD COLUMN IF NOT EXISTS search_vector tsvector;

-- Create GIN index for fast full-text search
CREATE INDEX IF NOT EXISTS idx_sms_messages_search_vector
ON sms_messages USING GIN (search_vector);

-- Create function to update search vector
CREATE OR REPLACE FUNCTION update_sms_message_search_vector()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector := to_tsvector('english', COALESCE(NEW.message_body, ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update search vector on insert/update
DROP TRIGGER IF EXISTS trigger_update_sms_search_vector ON sms_messages;
CREATE TRIGGER trigger_update_sms_search_vector
  BEFORE INSERT OR UPDATE OF message_body ON sms_messages
  FOR EACH ROW
  EXECUTE FUNCTION update_sms_message_search_vector();

-- Backfill existing messages with search vectors
UPDATE sms_messages
SET search_vector = to_tsvector('english', COALESCE(message_body, ''))
WHERE search_vector IS NULL;

-- Create search function that returns messages with conversation context
CREATE OR REPLACE FUNCTION search_sms_messages(
  p_organization_id UUID,
  p_query TEXT,
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
    ts_rank(m.search_vector, websearch_to_tsquery('english', p_query)) AS rank
  FROM sms_messages m
  JOIN sms_conversations c ON m.conversation_id = c.id
  LEFT JOIN contacts ct ON c.contact_id = ct.id
  WHERE c.organization_id = p_organization_id
    AND m.search_vector @@ websearch_to_tsquery('english', p_query)
  ORDER BY rank DESC, m.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION search_sms_messages(UUID, TEXT, INT, INT) TO authenticated;

-- Add comment explaining the search functionality
COMMENT ON FUNCTION search_sms_messages IS 'Full-text search across SMS messages within an organization. Uses PostgreSQL websearch syntax for flexible queries.';
