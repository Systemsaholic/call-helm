-- Add key_points column to scripts table for AI analysis tracking
-- This will be used to verify if agents covered required points during calls

-- Add key_points column if it doesn't exist
ALTER TABLE scripts 
ADD COLUMN IF NOT EXISTS key_points TEXT[] DEFAULT '{}';

-- Add metadata column for additional tracking information
ALTER TABLE scripts
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

-- Add comment explaining the purpose
COMMENT ON COLUMN scripts.key_points IS 
'Array of key points that must be covered during the call. Used for AI analysis to verify compliance.';

COMMENT ON COLUMN scripts.metadata IS 
'Additional metadata for the script including tone, generation settings, and analysis criteria.';

-- Create index for faster queries on key_points
CREATE INDEX IF NOT EXISTS idx_scripts_key_points ON scripts USING GIN (key_points);

-- Add analysis_criteria to call_attempts for tracking point coverage
ALTER TABLE call_attempts
ADD COLUMN IF NOT EXISTS analysis_criteria JSONB DEFAULT '{}';

COMMENT ON COLUMN call_attempts.analysis_criteria IS 
'Stores key points and other criteria for AI analysis of this call recording.';