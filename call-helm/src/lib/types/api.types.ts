// API Response Types
export interface ApiResponse<T = any> {
  success: boolean
  data?: T
  error?: string
  code?: string
  message?: string
}

// Supabase Types
export interface SupabaseUser {
  id: string
  email?: string
  user_metadata?: Record<string, any>
  app_metadata?: Record<string, any>
}

export interface SupabaseError {
  message: string
  details?: string
  hint?: string
  code?: string
  status?: number
}

// Organization Types
export interface Organization {
  id: string
  name: string
  slug: string
  logo_url?: string
  settings?: Record<string, any>
  subscription_tier: 'starter' | 'professional' | 'enterprise'
  subscription_status: string
  stripe_customer_id?: string
  stripe_subscription_id?: string
  trial_ends_at?: string
  agent_limit: number
  created_at: string
  updated_at: string
}

export interface OrganizationMember {
  id: string
  organization_id: string
  user_id?: string
  email: string
  full_name?: string
  role: 'super_admin' | 'org_admin' | 'team_lead' | 'billing_admin' | 'agent'
  status: 'pending_invitation' | 'invited' | 'active' | 'inactive' | 'suspended'
  extension?: string
  department?: string
  team_id?: string
  is_active: boolean
  metadata?: Record<string, any>
  invited_at?: string
  created_at: string
  updated_at: string
}

// Phone Number Types
export interface PhoneNumber {
  id: string
  organization_id: string
  number: string
  friendly_name: string
  capabilities: {
    voice: boolean
    sms: boolean
    mms: boolean
    fax: boolean
  }
  is_primary: boolean
  status: 'active' | 'inactive'
  provider: 'telnyx' | 'twilio'
  created_at: string
  updated_at: string
}

// Call Types
export interface Call {
  id: string
  organization_id: string
  member_id?: string
  contact_id?: string
  direction: 'inbound' | 'outbound' | 'internal'
  caller_number: string
  called_number: string
  start_time: string
  end_time?: string
  duration?: number
  status: 'initiated' | 'ringing' | 'answered' | 'completed' | 'failed'
  recording_url?: string
  transcription?: string
  ai_summary?: string
  ai_sentiment?: string
  ai_keywords?: string[]
  ai_score?: number
  notes?: string
  metadata?: Record<string, any>
  created_at: string
  updated_at: string
}

// Usage Types
export interface UsageEvent {
  id: string
  organization_id: string
  resource_type: 'llm_tokens' | 'analytics_tokens' | 'call_minutes' | 'sms_messages'
  amount: number
  unit_cost: number
  total_cost: number
  campaign_id?: string
  agent_id?: string
  contact_id?: string
  call_attempt_id?: string
  description: string
  metadata?: Record<string, any>
  created_at: string
}

export interface UsageTracking {
  id: string
  organization_id: string
  resource_type: 'llm_tokens' | 'analytics_tokens' | 'call_minutes' | 'sms_messages'
  billing_period_start: string
  billing_period_end: string
  tier_included: number
  used_amount: number
  overage_amount: number
  overage_rate: number
  created_at: string
  updated_at: string
}

// Voice Integration Types
export interface VoiceIntegration {
  id: string
  organization_id: string
  provider: 'telnyx' | 'twilio'
  api_key?: string
  api_secret?: string
  space_url?: string
  phone_numbers?: string[]
  default_caller_id?: string
  webhook_url?: string
  webhook_secret?: string
  is_active: boolean
  created_at: string
  updated_at: string
}

// Webhook Types
export interface WebhookPayload {
  event_type?: string
  EventType?: string
  call_sid?: string
  CallSid?: string
  from?: string
  From?: string
  to?: string
  To?: string
  direction?: string
  Direction?: string
  start_time?: string
  StartTime?: string
  end_time?: string
  EndTime?: string
  duration?: string
  Duration?: string
  call_status?: string
  CallStatus?: string
  recording_url?: string
  RecordingUrl?: string
  recording_sid?: string
  RecordingSid?: string
  [key: string]: any // For additional provider-specific fields
}

// Contact Types
export interface Contact {
  id: string
  organization_id: string
  first_name?: string
  last_name?: string
  full_name?: string
  phone_number: string
  email?: string
  company?: string
  address?: string
  city?: string
  state?: string
  country?: string
  postal_code?: string
  status: 'active' | 'inactive' | 'do_not_call'
  tags?: string[]
  notes?: string
  metadata?: Record<string, any>
  created_by?: string
  assigned_to?: string
  created_at: string
  updated_at: string
}

// Call List Types
export interface CallList {
  id: string
  organization_id: string
  name: string
  description?: string
  start_date?: string
  end_date?: string
  status: 'active' | 'paused' | 'completed' | 'archived'
  assigned_to?: string[]
  metadata?: Record<string, any>
  created_by?: string
  created_at: string
  updated_at: string
}

export interface CallListContact {
  id: string
  call_list_id: string
  contact_id: string
  assigned_to?: string
  status: string
  last_called_at?: string
  call_count: number
  notes?: string
  created_at: string
  updated_at: string
}

// Billing Types
export interface BillingTier {
  name: 'starter' | 'professional' | 'enterprise'
  limits: {
    llm_tokens: number
    analytics_tokens: number
    call_minutes: number
    sms_messages: number
    agents: number
  }
  overage_rates: {
    llm_tokens: number
    analytics_tokens: number
    call_minutes: number
    sms_messages: number
  }
  monthly_price: number
}

// Twilio Types
export interface TwilioCall {
  sid: string
  to: string
  from: string
  status: string
  startTime?: Date
  endTime?: Date
  duration?: string
  price?: string
  priceUnit?: string
  direction?: string
  answeredBy?: string
  apiVersion?: string
  callerName?: string
  uri?: string
  recordingUrl?: string
}