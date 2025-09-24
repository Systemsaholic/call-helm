-- Add call recording and analysis fields
-- This migration adds support for call recording, transcription, and AI analysis

-- Add recording and transcription fields to calls table
ALTER TABLE calls 
ADD COLUMN IF NOT EXISTS recording_url TEXT,
ADD COLUMN IF NOT EXISTS recording_sid TEXT,
ADD COLUMN IF NOT EXISTS recording_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS transcription TEXT,
ADD COLUMN IF NOT EXISTS transcription_status VARCHAR(20) DEFAULT 'pending' CHECK (transcription_status IN ('pending', 'processing', 'completed', 'failed')),
ADD COLUMN IF NOT EXISTS ai_analysis JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS mood_sentiment VARCHAR(20) CHECK (mood_sentiment IN ('positive', 'neutral', 'negative', 'mixed')),
ADD COLUMN IF NOT EXISTS key_points TEXT[],
ADD COLUMN IF NOT EXISTS compliance_flags JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS analysis_completed_at TIMESTAMPTZ;

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_calls_recording_status ON calls(transcription_status) WHERE recording_url IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_calls_mood_sentiment ON calls(mood_sentiment) WHERE mood_sentiment IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_calls_analysis_completed ON calls(analysis_completed_at) WHERE analysis_completed_at IS NOT NULL;

-- Add recording preferences to organization_members (user preferences)
ALTER TABLE organization_members
ADD COLUMN IF NOT EXISTS default_record_calls BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS recording_disclosure_enabled BOOLEAN DEFAULT true;

-- Add recording settings to call_lists (campaign-level settings)
ALTER TABLE call_lists
ADD COLUMN IF NOT EXISTS recording_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS recording_disclosure_text TEXT,
ADD COLUMN IF NOT EXISTS auto_transcribe BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS analyze_sentiment BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS extract_key_points BOOLEAN DEFAULT true;

-- Create a table for recording archives (for B2 storage tracking)
CREATE TABLE IF NOT EXISTS call_recording_archives (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  call_id UUID NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  original_url TEXT NOT NULL,
  archive_url TEXT NOT NULL,
  archive_bucket VARCHAR(100),
  archive_key TEXT,
  archived_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  file_size_bytes BIGINT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for archive lookups
CREATE INDEX IF NOT EXISTS idx_recording_archives_call_id ON call_recording_archives(call_id);
CREATE INDEX IF NOT EXISTS idx_recording_archives_archived_at ON call_recording_archives(archived_at);

-- Create a table for tracking AI analysis jobs
CREATE TABLE IF NOT EXISTS call_analysis_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  call_id UUID NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  job_type VARCHAR(50) NOT NULL CHECK (job_type IN ('transcription', 'sentiment_analysis', 'key_points', 'compliance_scan', 'full_analysis')),
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  result JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for job tracking
CREATE INDEX IF NOT EXISTS idx_analysis_jobs_call_id ON call_analysis_jobs(call_id);
CREATE INDEX IF NOT EXISTS idx_analysis_jobs_status ON call_analysis_jobs(status, job_type);
CREATE INDEX IF NOT EXISTS idx_analysis_jobs_created ON call_analysis_jobs(created_at);

-- Add feature flag for recording to subscription_plans features
UPDATE subscription_plans 
SET features = jsonb_set(
  COALESCE(features, '{}'::jsonb),
  '{call_recording_transcription}',
  'false'::jsonb
)
WHERE slug IN ('free', 'basic', 'starter');

UPDATE subscription_plans 
SET features = jsonb_set(
  COALESCE(features, '{}'::jsonb),
  '{call_recording_transcription}',
  'true'::jsonb
)
WHERE slug IN ('pro', 'business', 'enterprise');

-- Create RLS policies for new tables
ALTER TABLE call_recording_archives ENABLE ROW LEVEL SECURITY;
ALTER TABLE call_analysis_jobs ENABLE ROW LEVEL SECURITY;

-- Policy for call_recording_archives - users can see archives for their organization
CREATE POLICY "Users can view their organization's recording archives" ON call_recording_archives
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id 
      FROM organization_members 
      WHERE user_id = auth.uid()
    )
  );

-- Policy for call_analysis_jobs - users can see jobs for their organization  
CREATE POLICY "Users can view their organization's analysis jobs" ON call_analysis_jobs
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id 
      FROM organization_members 
      WHERE user_id = auth.uid()
    )
  );

-- Policy for admins to manage all recording archives in their organization
CREATE POLICY "Admins can manage recording archives" ON call_recording_archives
  FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id 
      FROM organization_members 
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- Policy for system to insert/update analysis jobs
CREATE POLICY "System can manage analysis jobs" ON call_analysis_jobs
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Add comment for documentation
COMMENT ON COLUMN calls.recording_url IS 'URL to the call recording audio file';
COMMENT ON COLUMN calls.transcription IS 'Full text transcript of the call';
COMMENT ON COLUMN calls.ai_analysis IS 'AI-generated analysis including quality metrics, compliance checks, etc';
COMMENT ON COLUMN calls.mood_sentiment IS 'Overall sentiment analysis of the call';
COMMENT ON COLUMN calls.key_points IS 'Key discussion points extracted from the call';
COMMENT ON COLUMN calls.compliance_flags IS 'Flags for PCI, PII, or other compliance issues detected';