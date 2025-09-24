-- Add timeout and webhook tracking fields to calls table
ALTER TABLE calls 
ADD COLUMN IF NOT EXISTS webhook_last_received_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS timeout_detected_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS failure_reason TEXT;

-- Add index for finding orphaned calls
CREATE INDEX IF NOT EXISTS idx_calls_orphaned 
ON calls(organization_id, end_time, created_at) 
WHERE end_time IS NULL;

-- Add index for webhook tracking
CREATE INDEX IF NOT EXISTS idx_calls_webhook_tracking 
ON calls(organization_id, webhook_last_received_at) 
WHERE webhook_last_received_at IS NOT NULL;

-- Function to cleanup orphaned calls (calls older than 5 minutes without end_time)
CREATE OR REPLACE FUNCTION cleanup_orphaned_calls()
RETURNS void AS $$
BEGIN
  UPDATE calls
  SET 
    end_time = NOW(),
    status = 'failed',
    failure_reason = 'Call timeout - no response from system',
    timeout_detected_at = NOW(),
    metadata = COALESCE(metadata, '{}'::jsonb) || 
      jsonb_build_object(
        'auto_closed', true,
        'cleanup_reason', 'orphaned_call',
        'cleanup_at', NOW()
      )
  WHERE 
    end_time IS NULL
    AND created_at < NOW() - INTERVAL '5 minutes'
    AND status != 'failed';
END;
$$ LANGUAGE plpgsql;

-- Create a scheduled job to cleanup orphaned calls (if using pg_cron)
-- Note: pg_cron needs to be enabled for this to work
-- SELECT cron.schedule('cleanup-orphaned-calls', '*/5 * * * *', 'SELECT cleanup_orphaned_calls();');

-- Comment out the above line if pg_cron is not available
-- You can manually run: SELECT cleanup_orphaned_calls(); periodically