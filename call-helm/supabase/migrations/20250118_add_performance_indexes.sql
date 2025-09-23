-- Add performance indexes for frequently queried columns
-- These indexes will significantly improve query performance

-- Composite index for usage_events queries
CREATE INDEX IF NOT EXISTS idx_usage_events_org_created 
ON usage_events(organization_id, created_at DESC);

-- Index for call queries by organization and agent
CREATE INDEX IF NOT EXISTS idx_calls_org_agent 
ON calls(organization_id, member_id);

-- Index for call_attempts by provider ID (for webhook lookups)
CREATE INDEX IF NOT EXISTS idx_call_attempts_provider 
ON call_attempts(provider_call_id);

-- Partial index for active organization members
CREATE INDEX IF NOT EXISTS idx_active_org_members 
ON organization_members(organization_id) 
WHERE is_active = true;

-- Index for phone number lookups
CREATE INDEX IF NOT EXISTS idx_phone_numbers_org 
ON phone_numbers(organization_id, number);

-- Index for voice integrations
CREATE INDEX IF NOT EXISTS idx_voice_integrations_org 
ON voice_integrations(organization_id);

-- Index for usage tracking queries
CREATE INDEX IF NOT EXISTS idx_usage_tracking_org_period 
ON usage_tracking(organization_id, billing_period_start, resource_type);

-- Index for call list contacts
CREATE INDEX IF NOT EXISTS idx_call_list_contacts_list_status 
ON call_list_contacts(call_list_id, status);

-- Index for invitations by organization
CREATE INDEX IF NOT EXISTS idx_invitations_org_email 
ON invitations(organization_id, email);

-- Index for activity logs
CREATE INDEX IF NOT EXISTS idx_activity_logs_org_created 
ON activity_logs(organization_id, created_at DESC);

-- Index for calls by start time (for reporting)
CREATE INDEX IF NOT EXISTS idx_calls_start_time 
ON calls(start_time DESC);

-- Index for agent invitations
CREATE INDEX IF NOT EXISTS idx_agent_invitations_member 
ON agent_invitations(organization_member_id);

-- Analyze tables to update statistics for query planner
ANALYZE organizations;
ANALYZE organization_members;
ANALYZE calls;
ANALYZE call_attempts;
ANALYZE usage_events;
ANALYZE usage_tracking;
ANALYZE phone_numbers;
ANALYZE voice_integrations;
ANALYZE call_list_contacts;
ANALYZE invitations;
ANALYZE activity_logs;