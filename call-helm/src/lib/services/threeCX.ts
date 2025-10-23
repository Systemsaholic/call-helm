/**
 * 3CX Integration Service
 * Handles API key generation, validation, and 3CX-related operations
 */

import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/**
 * Generate a new API key for 3CX integration
 */
export async function generateThreeCXApiKey(organizationId: string): Promise<string> {
  const apiKey = `3cx_${crypto.randomBytes(32).toString('hex')}`;

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const { error } = await supabase
    .from('three_cx_integrations')
    .upsert({
      organization_id: organizationId,
      api_key: apiKey,
      enabled: true,
      crm_url: process.env.NEXT_PUBLIC_APP_URL || 'https://call-helm.com',
      settings: {
        call_journaling_enabled: true,
        contact_creation_enabled: true,
        auto_create_contacts: true
      }
    }, {
      onConflict: 'organization_id'
    });

  if (error) {
    console.error('Error generating 3CX API key:', error);
    throw new Error('Failed to generate API key');
  }

  return apiKey;
}

/**
 * Validate a 3CX API key and return the organization ID if valid
 */
export async function validateThreeCXApiKey(apiKey: string): Promise<string | null> {
  if (!apiKey || !apiKey.startsWith('3cx_')) {
    return null;
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const { data, error } = await supabase
    .from('three_cx_integrations')
    .select('organization_id, enabled')
    .eq('api_key', apiKey)
    .single();

  if (error || !data || !data.enabled) {
    return null;
  }

  return data.organization_id;
}

/**
 * Get 3CX integration configuration for an organization
 */
export async function getThreeCXIntegration(organizationId: string) {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const { data, error } = await supabase
    .from('three_cx_integrations')
    .select('*')
    .eq('organization_id', organizationId)
    .single();

  if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
    console.error('Error fetching 3CX integration:', error);
    throw new Error('Failed to fetch integration');
  }

  return data;
}

/**
 * Update 3CX integration settings
 */
export async function updateThreeCXIntegration(
  organizationId: string,
  updates: {
    enabled?: boolean;
    three_cx_server_url?: string;
    settings?: Record<string, any>;
  }
) {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const { data, error } = await supabase
    .from('three_cx_integrations')
    .update(updates)
    .eq('organization_id', organizationId)
    .select()
    .single();

  if (error) {
    console.error('Error updating 3CX integration:', error);
    throw new Error('Failed to update integration');
  }

  return data;
}

/**
 * Get agent mapping by 3CX extension
 */
export async function getAgentByExtension(
  organizationId: string,
  extension: string
) {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const { data, error } = await supabase
    .from('three_cx_agent_mappings')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('three_cx_extension', extension)
    .single();

  if (error && error.code !== 'PGRST116') {
    console.error('Error fetching agent mapping:', error);
  }

  return data;
}

/**
 * Create or update agent extension mapping
 */
export async function upsertAgentMapping(
  organizationId: string,
  extension: string,
  agentData: {
    agent_id?: string;
    agent_email?: string;
    agent_first_name?: string;
    agent_last_name?: string;
  }
) {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const { data, error } = await supabase
    .from('three_cx_agent_mappings')
    .upsert({
      organization_id: organizationId,
      three_cx_extension: extension,
      ...agentData
    }, {
      onConflict: 'organization_id,three_cx_extension'
    })
    .select()
    .single();

  if (error) {
    console.error('Error upserting agent mapping:', error);
    throw new Error('Failed to update agent mapping');
  }

  return data;
}

/**
 * Log a 3CX event
 */
export async function logThreeCXEvent(eventData: {
  organization_id: string;
  event_type: 'lookup' | 'journal' | 'create_contact' | 'search';
  phone_number?: string;
  contact_id?: string;
  call_id?: string;
  agent_extension?: string;
  call_direction?: string;
  call_type?: string;
  duration_seconds?: number;
  call_start_time?: string;
  call_end_time?: string;
  raw_data?: Record<string, any>;
}) {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const { error } = await supabase
    .from('three_cx_call_events')
    .insert(eventData);

  if (error) {
    console.error('Error logging 3CX event:', error);
    // Don't throw - logging failures shouldn't break the main flow
  }
}

/**
 * Get 3CX integration statistics
 */
export async function getThreeCXStats(organizationId: string, days: number = 30) {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const since = new Date();
  since.setDate(since.getDate() - days);

  const { data, error } = await supabase
    .from('three_cx_call_events')
    .select('event_type, created_at')
    .eq('organization_id', organizationId)
    .gte('created_at', since.toISOString());

  if (error) {
    console.error('Error fetching 3CX stats:', error);
    return {
      total_events: 0,
      lookups: 0,
      journals: 0,
      contacts_created: 0,
      searches: 0
    };
  }

  const stats = {
    total_events: data.length,
    lookups: data.filter(e => e.event_type === 'lookup').length,
    journals: data.filter(e => e.event_type === 'journal').length,
    contacts_created: data.filter(e => e.event_type === 'create_contact').length,
    searches: data.filter(e => e.event_type === 'search').length
  };

  return stats;
}

/**
 * Format phone number for matching (strip non-digits, handle international format)
 */
export function normalizePhoneNumber(phone: string): string {
  // Remove all non-digit characters
  const digits = phone.replace(/\D/g, '');

  // If it starts with 1 and has 11 digits, it's likely a US number with country code
  if (digits.length === 11 && digits.startsWith('1')) {
    return digits.substring(1); // Return without the leading 1
  }

  return digits;
}

/**
 * Parse duration string (hh:mm:ss) to seconds
 */
export function parseDuration(duration: string): number {
  if (!duration) return 0;

  const parts = duration.split(':').map(Number);

  if (parts.length === 3) {
    const [hours, minutes, seconds] = parts;
    return hours * 3600 + minutes * 60 + seconds;
  }

  return 0;
}
