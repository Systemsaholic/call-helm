/**
 * 3CX Call Journaling API
 * Receives call events from 3CX and creates call records in Call-Helm
 * This is the CORE functionality of the 3CX integration
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateThreeCXApiKey, logThreeCXEvent, getAgentByExtension, parseDuration, normalizePhoneNumber } from '@/lib/services/threeCX';
import { createClient } from '@supabase/supabase-js';
import { apiLogger } from '@/lib/logger';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(request: NextRequest) {
  try {
    const apiKey = request.headers.get('x-api-key');
    if (!apiKey) {
      return NextResponse.json({ error: 'Missing API key' }, { status: 401 });
    }

    const organizationId = await validateThreeCXApiKey(apiKey);
    if (!organizationId) {
      return NextResponse.json({ error: 'Invalid API key' }, { status: 401 });
    }

    const body = await request.json();
    const {
      CallType,           // 'Inbound', 'Outbound', 'Missed', 'Notanswered'
      Number,            // External phone number
      CallDirection,     // 'Inbound' or 'Outbound'
      Name,              // Matched contact name (if found by 3CX)
      EntityId,          // Contact ID from 3CX lookup
      Agent,             // Extension number
      AgentEmail,
      AgentFirstName,
      AgentLastName,
      Duration,          // "hh:mm:ss" format
      CallStartTimeUTC,
      CallEndTimeUTC,
      QueueExtension
    } = body;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse duration to seconds
    const durationSeconds = parseDuration(Duration || '00:00:00');

    // Find or create contact
    let contactId = EntityId;
    if (!contactId && Number) {
      const normalizedNumber = normalizePhoneNumber(Number);

      // Try to find existing contact
      const { data: existingContact } = await supabase
        .from('contacts')
        .select('id')
        .eq('organization_id', organizationId)
        .or(`phone.eq.${Number},mobile.eq.${Number},phone.eq.${normalizedNumber},mobile.eq.${normalizedNumber}`)
        .limit(1)
        .single();

      if (existingContact) {
        contactId = existingContact.id;
      } else {
        // Auto-create contact from incoming call
        const { data: newContact } = await supabase
          .from('contacts')
          .insert({
            organization_id: organizationId,
            phone: Number,
            first_name: Name || 'Unknown',
            last_name: '',
            source: '3cx_auto_created',
            status: 'active'
          })
          .select('id')
          .single();

        contactId = newContact?.id;
      }
    }

    // Find agent by extension or email
    let userId = null;
    if (Agent) {
      const agentMapping = await getAgentByExtension(organizationId, Agent);
      userId = agentMapping?.agent_id;
    }

    // Determine call status
    let callStatus: string;
    if (CallType === 'Missed' || CallType === 'Notanswered') {
      callStatus = 'no-answer';
    } else if (CallType === 'Inbound' || CallType === 'Outbound') {
      callStatus = 'completed';
    } else {
      callStatus = 'completed';
    }

    // Create call record
    const callData = {
      organization_id: organizationId,
      contact_id: contactId || null,
      user_id: userId || null,
      direction: CallDirection?.toLowerCase() === 'inbound' ? 'inbound' : 'outbound',
      from_number: CallDirection?.toLowerCase() === 'inbound' ? Number : (Agent || 'Unknown'),
      to_number: CallDirection?.toLowerCase() === 'outbound' ? Number : (Agent || 'Unknown'),
      status: callStatus,
      duration: durationSeconds,
      started_at: CallStartTimeUTC ? new Date(CallStartTimeUTC) : new Date(),
      ended_at: CallEndTimeUTC ? new Date(CallEndTimeUTC) : null,
      source: '3cx',
      notes: [
        `3CX Call - ${CallType}`,
        AgentFirstName && AgentLastName ? `Agent: ${AgentFirstName} ${AgentLastName}` : null,
        AgentEmail ? `Email: ${AgentEmail}` : null,
        Agent ? `Extension: ${Agent}` : null,
        QueueExtension ? `Queue: ${QueueExtension}` : null
      ].filter(Boolean).join(' | ')
    };

    const { data: call, error: callError } = await supabase
      .from('calls')
      .insert(callData)
      .select('id')
      .single();

    if (callError) {
      apiLogger.error('Error creating call record', { error: callError });
      return NextResponse.json({ error: 'Failed to create call record' }, { status: 500 });
    }

    // Log the journal event
    await logThreeCXEvent({
      organization_id: organizationId,
      call_id: call?.id,
      event_type: 'journal',
      phone_number: Number,
      contact_id: contactId,
      agent_extension: Agent,
      call_direction: CallDirection?.toLowerCase(),
      call_type: CallType,
      duration_seconds: durationSeconds,
      call_start_time: CallStartTimeUTC,
      call_end_time: CallEndTimeUTC,
      raw_data: body
    });

    return NextResponse.json({
      success: true,
      callId: call.id,
      contactId,
      message: 'Call journaled successfully'
    });

  } catch (error) {
    apiLogger.error('Error in 3CX call journaling', { error });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
