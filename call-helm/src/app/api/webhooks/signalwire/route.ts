import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import crypto from 'crypto'

// Verify SignalWire webhook signature using timing-safe comparison
function verifySignalWireSignature(body: string, signature: string, secret: string): boolean {
  const expectedSignature = crypto.createHmac("sha256", secret).update(body).digest("hex")
  const a = Buffer.from(expectedSignature || "", "utf8")
  const b = Buffer.from(signature || "", "utf8")
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}

// Enhanced SignalWire webhook handler that integrates with our complete call tracking system
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    // Get raw body for signature verification
    const rawBody = await request.text()
    const signature = request.headers.get('x-signalwire-signature') || 
                     request.headers.get('x-webhook-signature') || ''
    
    // Parse the body
    const data = JSON.parse(rawBody)
    
    // Determine organization from the call data
    let organizationId: string | null = null
    let webhookSecret: string | null = null
    
    // Try to find organization by phone number
    if (data.To || data.From) {
      const phoneNumber = data.To || data.From
      const { data: integration } = await supabase
        .from('voice_integrations')
        .select('organization_id, webhook_secret')
        .contains('phone_numbers', [phoneNumber])
        .single()
      
      if (integration) {
        organizationId = integration.organization_id
        webhookSecret = integration.webhook_secret
        
        // Verify signature if we have the secret
        if (webhookSecret && signature) {
          const isValid = verifySignalWireSignature(rawBody, signature, webhookSecret)
          if (!isValid) {
            console.warn('Invalid SignalWire webhook signature')
            return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
          }
        }
      }
    }
    
    if (!organizationId) {
      console.error('Organization not found for SignalWire webhook:', data)
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
    }

    // Map SignalWire event data to our standard format
    const callData = {
      call_sid: data.CallSid || data.call_sid,
      from: data.From || data.from,
      to: data.To || data.to,
      direction: data.Direction || data.direction,
      call_status: data.CallStatus || data.call_status,
      start_time: data.StartTime || data.start_time,
      end_time: data.EndTime || data.end_time,
      duration: data.CallDuration || data.duration,
      recording_url: data.RecordingUrl || data.recording_url,
      recording_sid: data.RecordingSid || data.recording_sid
    }

    // Handle different event types based on call status
    const callStatus = callData.call_status?.toLowerCase()
    
    switch (callStatus) {
      case 'initiated':
      case 'queued':
        await handleCallInitiated(supabase, organizationId, callData)
        break
        
      case 'ringing':
        await handleCallRinging(supabase, organizationId, callData)
        break
        
      case 'in-progress':
      case 'answered':
        await handleCallAnswered(supabase, organizationId, callData)
        break
        
      case 'completed':
        await handleCallCompleted(supabase, organizationId, callData)
        break
        
      case 'busy':
      case 'no-answer':
      case 'failed':
      case 'canceled':
        await handleCallFailed(supabase, organizationId, callData, callStatus)
        break
        
      default:
        console.log('Unhandled SignalWire call status:', callStatus)
    }
    
    return NextResponse.json({ received: true })
    
  } catch (error) {
    console.error('SignalWire webhook error:', error)
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 })
  }
}

async function handleCallInitiated(supabase: any, organizationId: string, data: any) {
  try {
    const { call_sid, from, to, direction, start_time } = data
    
    // Update the calls table with status in metadata
    const { data: callRecord } = await supabase
      .from('calls')
      .update({
        metadata: supabase.sql`metadata || jsonb_build_object('call_status', 'initiated', 'webhook_updated_at', '${new Date().toISOString()}')`
      })
      .eq('organization_id', organizationId)
      .eq('metadata->>external_id', call_sid)
      .select()
      .single()
    
    if (callRecord) {
      console.log('Updated calls table with initiated status for:', call_sid)
    }
    
    // Find existing call attempt or create one
    const { data: existingAttempt } = await supabase
      .from('call_attempts')
      .select('id')
      .eq('provider_call_id', call_sid)
      .single()

    if (!existingAttempt) {
      // Find agent and contact
      const { data: agent } = await supabase
        .from('organization_members')
        .select('id')
        .eq('organization_id', organizationId)
        .or(`phone.eq.${from},extension.eq.${from}`)
        .single()

      const { data: contact } = await supabase
        .from('contacts')
        .select('id')
        .eq('organization_id', organizationId)
        .eq('phone_number', direction === 'outbound' ? to : from)
        .single()

      // Create call attempt record
      await supabase
        .from('call_attempts')
        .insert({
          organization_id: organizationId,
          agent_id: agent?.id,
          contact_id: contact?.id,
          phone_number: direction === 'outbound' ? to : from,
          direction: direction || 'outbound',
          start_time: start_time || new Date().toISOString(),
          disposition: 'initiated',
          provider_call_id: call_sid,
          provider_metadata: data
        })
    }
  } catch (error) {
    console.error('Error handling SignalWire call initiated:', error)
  }
}

async function handleCallRinging(supabase: any, organizationId: string, data: any) {
  try {
    const { call_sid } = data
    
    // Update the calls table with ringing status in metadata
    const { data: callRecord } = await supabase
      .from('calls')
      .update({
        metadata: supabase.sql`metadata || jsonb_build_object('call_status', 'ringing', 'webhook_updated_at', '${new Date().toISOString()}')`
      })
      .eq('organization_id', organizationId)
      .eq('metadata->>external_id', call_sid)
      .select()
      .single()
    
    if (callRecord) {
      console.log('Updated calls table with ringing status for:', call_sid)
    }
    
    // Update call attempt if exists
    await supabase
      .from('call_attempts')
      .update({
        disposition: 'initiated',
        provider_metadata: data
      })
      .eq('provider_call_id', call_sid)
      .eq('organization_id', organizationId)

  } catch (error) {
    console.error('Error handling SignalWire call ringing:', error)
  }
}

async function handleCallAnswered(supabase: any, organizationId: string, data: any) {
  try {
    const { call_sid } = data
    
    // Update the calls table with status in metadata
    const { data: callRecord } = await supabase
      .from('calls')
      .update({
        metadata: supabase.sql`metadata || jsonb_build_object('call_status', 'in-progress', 'webhook_updated_at', '${new Date().toISOString()}')`
      })
      .eq('organization_id', organizationId)
      .eq('metadata->>external_id', call_sid)
      .select()
      .single()
    
    if (callRecord) {
      console.log('Updated calls table with in-progress status for:', call_sid)
    }
    
    // Update call attempt
    await supabase
      .from('call_attempts')
      .update({
        disposition: 'answered',
        provider_metadata: data
      })
      .eq('provider_call_id', call_sid)
      .eq('organization_id', organizationId)

  } catch (error) {
    console.error('Error handling SignalWire call answered:', error)
  }
}

async function handleCallCompleted(supabase: any, organizationId: string, data: any) {
  try {
    const { call_sid, end_time, duration, recording_url, recording_sid } = data
    
    // Update the calls table with completion details
    const { data: callRecord } = await supabase
      .from('calls')
      .update({
        end_time: end_time || new Date().toISOString(),
        duration: duration ? parseInt(duration) : null,
        status: 'answered', // Map completed to answered in the enum
        recording_url,
        metadata: supabase.sql`metadata || jsonb_build_object('call_status', 'completed', 'webhook_updated_at', '${new Date().toISOString()}', 'recording_sid', '${recording_sid || ''}')`
      })
      .eq('organization_id', organizationId)
      .eq('metadata->>external_id', call_sid)
      .select()
      .single()
    
    if (callRecord) {
      console.log('Updated calls table with completed status for:', call_sid)
    }
    
    // Update call attempt with completion details
    const { data: callAttempt, error } = await supabase
      .from('call_attempts')
      .update({
        end_time: end_time || new Date().toISOString(),
        duration_seconds: duration ? parseInt(duration) : null,
        disposition: 'answered', // Completed usually means answered
        recording_url,
        recording_sid,
        provider_metadata: data
      })
      .eq('provider_call_id', call_sid)
      .eq('organization_id', organizationId)
      .select()
      .single()

    if (error) {
      console.error('Error updating call attempt:', error)
      return
    }

    // Update call_list_contact if linked
    if (callAttempt?.call_list_contact_id) {
      await supabase
        .from('call_list_contacts')
        .update({
          last_attempt_at: new Date().toISOString(),
          total_attempts: supabase.sql`total_attempts + 1`,
          successful_attempts: supabase.sql`successful_attempts + 1`
        })
        .eq('id', callAttempt.call_list_contact_id)
    }

    // Track usage for billing if call had duration
    if (duration && parseInt(duration) > 0) {
      const minutes = Math.ceil(parseInt(duration) / 60)
      
      // Update any estimated usage event with actual values
      const { data: existingUsage } = await supabase
        .from('usage_events')
        .select('id')
        .eq('call_attempt_id', callAttempt?.id)
        .eq('resource_type', 'call_minutes')
        .eq('metadata->estimated', true)
        .single()

      if (existingUsage) {
        // Update the estimated usage with actual values
        await supabase
          .from('usage_events')
          .update({
            amount: minutes,
            total_cost: minutes * 0.025,
            description: `Outbound call completed - ${minutes} minutes`,
            metadata: { 
              call_sid, 
              duration, 
              estimated: false,
              signalwire_webhook: true
            }
          })
          .eq('id', existingUsage.id)
      } else {
        // Create new usage event
        await supabase
          .from('usage_events')
          .insert({
            organization_id: organizationId,
            resource_type: 'call_minutes',
            amount: minutes,
            unit_cost: 0.025,
            total_cost: minutes * 0.025,
            campaign_id: callAttempt?.campaign_id,
            agent_id: callAttempt?.agent_id,
            contact_id: callAttempt?.contact_id,
            call_attempt_id: callAttempt?.id,
            description: `Outbound call completed - ${minutes} minutes`,
            metadata: { 
              call_sid, 
              duration, 
              estimated: false,
              signalwire_webhook: true
            }
          })
      }
    }

  } catch (error) {
    console.error('Error handling SignalWire call completed:', error)
  }
}

async function handleCallFailed(supabase: any, organizationId: string, data: any, status: string) {
  try {
    const { call_sid, end_time } = data
    
    // Map status to our disposition and enum values
    const dispositionMap: Record<string, string> = {
      'busy': 'busy',
      'no-answer': 'no_answer',
      'failed': 'failed',
      'canceled': 'failed'
    }
    
    const statusMap: Record<string, string> = {
      'busy': 'busy',
      'no-answer': 'missed',
      'failed': 'failed',
      'canceled': 'failed'
    }
    
    const disposition = dispositionMap[status] || status
    const dbStatus = statusMap[status] || 'failed'

    // Update the calls table with failed status
    const { data: callRecord } = await supabase
      .from('calls')
      .update({
        end_time: end_time || new Date().toISOString(),
        status: dbStatus,
        metadata: supabase.sql`metadata || jsonb_build_object('call_status', '${status}', 'webhook_updated_at', '${new Date().toISOString()}')`
      })
      .eq('organization_id', organizationId)
      .eq('metadata->>external_id', call_sid)
      .select()
      .single()
    
    if (callRecord) {
      console.log(`Updated calls table with ${status} status for:`, call_sid)
    }

    // Update call attempt
    const { data: callAttempt } = await supabase
      .from('call_attempts')
      .update({
        end_time: end_time || new Date().toISOString(),
        disposition,
        provider_metadata: data
      })
      .eq('provider_call_id', call_sid)
      .eq('organization_id', organizationId)
      .select()
      .single()

    // Update call_list_contact if linked
    if (callAttempt?.call_list_contact_id) {
      await supabase
        .from('call_list_contacts')
        .update({
          last_attempt_at: new Date().toISOString(),
          total_attempts: supabase.sql`total_attempts + 1`
        })
        .eq('id', callAttempt.call_list_contact_id)
    }

    // Remove any estimated usage events since call didn't complete
    if (callAttempt) {
      await supabase
        .from('usage_events')
        .delete()
        .eq('call_attempt_id', callAttempt.id)
        .eq('resource_type', 'call_minutes')
        .eq('metadata->estimated', true)
    }

  } catch (error) {
    console.error('Error handling SignalWire call failed:', error)
  }
}

// Handle GET requests for webhook verification
export async function GET(request: NextRequest) {
  return NextResponse.json({ 
    status: 'ok',
    message: 'SignalWire webhook endpoint active',
    timestamp: new Date().toISOString()
  })
}