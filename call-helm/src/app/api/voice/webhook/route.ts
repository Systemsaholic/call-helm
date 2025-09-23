import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import crypto from 'crypto'

// Verify webhook signature
function verifyWebhookSignature(payload: string, signature: string, secret: string): boolean {
  const expectedSignature = crypto.createHmac("sha256", secret).update(payload).digest("hex")
  const a = Buffer.from(expectedSignature || "", "utf8")
  const b = Buffer.from(signature || "", "utf8")
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    // Get raw body for signature verification
    const rawBody = await request.text()
    const signature = request.headers.get('x-signalwire-signature') || 
                     request.headers.get('x-webhook-signature') || ''
    
    // Parse the body
    const body = JSON.parse(rawBody)
    
    // Determine organization from the call data
    let organizationId: string | null = null
    
    // Try to find organization by phone number
    if (body.to || body.from) {
      const phoneNumber = body.to || body.from
      const { data: integration } = await supabase
        .from('voice_integrations')
        .select('organization_id, webhook_secret')
        .contains('phone_numbers', [phoneNumber])
        .single()
      
      if (integration) {
        organizationId = integration.organization_id
        
        // Verify signature if we have the secret
        if (integration.webhook_secret && signature) {
          const isValid = verifyWebhookSignature(rawBody, signature, integration.webhook_secret)
          if (!isValid) {
            console.warn("Invalid webhook signature - rejecting request")
            return NextResponse.json({ error: "Invalid signature" }, { status: 401 })
          }
        }
      }
    }
    
    if (!organizationId) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
    }

    // Handle different event types
    const eventType = body.event_type || body.EventType || 'call.update'
    
    switch (eventType) {
      case 'call.initiated':
      case 'call.created':
        await handleCallInitiated(supabase, organizationId, body)
        break
        
      case 'call.answered':
      case 'call.connected':
        await handleCallAnswered(supabase, organizationId, body)
        break
        
      case 'call.ended':
      case 'call.finished':
        await handleCallEnded(supabase, organizationId, body)
        break
        
      case 'recording.finished':
        await handleRecordingFinished(supabase, organizationId, body)
        break
        
      default:
        console.log('Unhandled event type:', eventType)
    }
    
    return NextResponse.json({ received: true })
    
  } catch (error) {
    console.error('Webhook error:', error)
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 })
  }
}

async function handleCallInitiated(supabase: any, organizationId: string, data: any) {
  try {
    const { call_sid, from, to, direction, start_time } = data
    
    // Find agent by phone number or extension
    const { data: agent } = await supabase
      .from('organization_members')
      .select('id')
      .eq('organization_id', organizationId)
      .or(`phone.eq.${from},extension.eq.${from}`)
      .single()
    
    // Find contact by phone number
    const { data: contact } = await supabase
      .from('contacts')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('phone_number', direction === 'outbound' ? to : from)
      .single()
    
    // Create call attempt record
    const { error } = await supabase
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
    
    if (error) {
      console.error('Error creating call attempt:', error)
    }
  } catch (error) {
    console.error('Error handling call initiated:', error)
  }
}

async function handleCallAnswered(supabase: any, organizationId: string, data: any) {
  try {
    const { call_sid, answered_time } = data
    
    // Update call attempt
    const { error } = await supabase
      .from('call_attempts')
      .update({
        disposition: 'answered',
        start_time: answered_time || new Date().toISOString()
      })
      .eq('provider_call_id', call_sid)
      .eq('organization_id', organizationId)
    
    if (error) {
      console.error('Error updating call attempt:', error)
    }
  } catch (error) {
    console.error('Error handling call answered:', error)
  }
}

async function handleCallEnded(supabase: any, organizationId: string, data: any) {
  try {
    const { 
      call_sid, 
      end_time, 
      duration, 
      call_status,
      recording_url,
      recording_sid,
      direction
    } = data
    
    // Map SignalWire status to our disposition
    const dispositionMap: Record<string, string> = {
      'completed': 'answered',
      'busy': 'busy',
      'no-answer': 'no_answer',
      'failed': 'failed',
      'canceled': 'failed'
    }
    
    const disposition = dispositionMap[call_status] || call_status
    
    // Update call attempt
    const { data: callAttempt, error } = await supabase
      .from('call_attempts')
      .update({
        end_time: end_time || new Date().toISOString(),
        duration_seconds: duration ? parseInt(duration) : null,
        disposition,
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
          ...(disposition === 'answered' && {
            successful_attempts: supabase.sql`successful_attempts + 1`
          })
        })
        .eq('id', callAttempt.call_list_contact_id)
    }
    
    // Track usage for billing
    if (duration && parseInt(duration) > 0) {
      const minutes = Math.ceil(parseInt(duration) / 60)
      
      // First, try to update any estimated usage event for this call
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
            description: `${direction === 'outbound' ? 'Outbound' : 'Inbound'} call - ${minutes} minutes`,
            metadata: { call_sid, duration, estimated: false }
          })
          .eq('id', existingUsage.id)
      } else {
        // Create new usage event if no estimated one exists
        await supabase
          .from('usage_events')
          .insert({
            organization_id: organizationId,
            resource_type: 'call_minutes',
            amount: minutes,
            unit_cost: 0.025, // $0.025 per minute
            total_cost: minutes * 0.025,
            campaign_id: callAttempt?.campaign_id,
            agent_id: callAttempt?.agent_id,
            contact_id: callAttempt?.contact_id,
            call_attempt_id: callAttempt?.id,
            description: `${direction === 'outbound' ? 'Outbound' : 'Inbound'} call - ${minutes} minutes`,
            metadata: { call_sid, duration, estimated: false }
          })
      }
    } else {
      // Call didn't complete successfully, remove or update estimated usage
      await supabase
        .from('usage_events')
        .delete()
        .eq('call_attempt_id', callAttempt?.id)
        .eq('resource_type', 'call_minutes')
        .eq('metadata->estimated', true)
    }
    
  } catch (error) {
    console.error('Error handling call ended:', error)
  }
}

async function handleRecordingFinished(supabase: any, organizationId: string, data: any) {
  try {
    const { call_sid, recording_url, recording_sid, duration } = data
    
    // Update call attempt with recording info
    const { error } = await supabase
      .from('call_attempts')
      .update({
        recording_url,
        recording_sid,
        recording_duration: duration ? parseInt(duration) : null
      })
      .eq('provider_call_id', call_sid)
      .eq('organization_id', organizationId)
    
    if (error) {
      console.error('Error updating recording info:', error)
    }
  } catch (error) {
    console.error('Error handling recording finished:', error)
  }
}

// Handle GET requests for webhook verification
export async function GET(request: NextRequest) {
  // SignalWire may send a GET request to verify the webhook endpoint
  return NextResponse.json({ 
    status: 'ok',
    message: 'Webhook endpoint active'
  })
}