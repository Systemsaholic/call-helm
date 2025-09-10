import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import crypto from 'crypto'

// Decrypt sensitive data
function decrypt(text: string, key: string): string {
  const textParts = text.split(':')
  const iv = Buffer.from(textParts.shift()!, 'hex')
  const encryptedText = Buffer.from(textParts.join(':'), 'hex')
  const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(key, 'hex'), iv)
  let decrypted = decipher.update(encryptedText)
  decrypted = Buffer.concat([decrypted, decipher.final()])
  return decrypted.toString()
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    // Check authentication
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get request body
    const body = await request.json()
    const { 
      contactId, 
      phoneNumber, 
      callListContactId,
      campaignId,
      agentId 
    } = body

    // Validate required fields
    if (!phoneNumber) {
      return NextResponse.json({ 
        error: 'Phone number is required' 
      }, { status: 400 })
    }

    // Get user's organization and member info
    const { data: member } = await supabase
      .from('organization_members')
      .select('id, organization_id')
      .eq('user_id', user.id)
      .single()

    if (!member) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
    }

    // Check if organization can make calls (billing check)
    const { data: canCall } = await supabase
      .rpc('can_make_call', { p_org_id: member.organization_id })

    if (!canCall) {
      return NextResponse.json({ 
        error: 'Unable to make calls. Please check your subscription and balance.' 
      }, { status: 402 })
    }

    // Get voice integration settings
    const { data: voiceConfig, error: configError } = await supabase
      .from('voice_integrations')
      .select('*')
      .eq('organization_id', member.organization_id)
      .eq('is_active', true)
      .single()

    if (configError || !voiceConfig) {
      return NextResponse.json({ 
        error: 'Voice service not configured. Please contact your administrator.' 
      }, { status: 503 })
    }

    // Decrypt API token
    const encryptionKey = process.env.ENCRYPTION_KEY!
    const apiToken = decrypt(voiceConfig.api_token_encrypted, encryptionKey)

    // Prepare SignalWire API call (but hide the provider from response)
    const signalwireUrl = `https://${voiceConfig.space_url}/api/relay/rest/phone_numbers/${voiceConfig.default_caller_id || voiceConfig.phone_numbers[0]}/calls`
    
    // Create call via SignalWire
    const callResponse = await fetch(signalwireUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        to: phoneNumber,
        from: voiceConfig.default_caller_id || voiceConfig.phone_numbers[0],
        url: `${process.env.NEXT_PUBLIC_APP_URL}/api/voice/twiml`, // TwiML instructions
        status_callback: voiceConfig.status_callback_url,
        status_callback_event: ['initiated', 'answered', 'completed'],
        record: voiceConfig.recording_enabled,
        machine_detection: 'DetectMessageEnd',
        machine_detection_timeout: 5000
      })
    })

    if (!callResponse.ok) {
      const error = await callResponse.text()
      console.error('SignalWire error:', error)
      return NextResponse.json({ 
        error: 'Failed to initiate call. Please try again.' 
      }, { status: 500 })
    }

    const callData = await callResponse.json()

    // Create call attempt record
    const { data: callAttempt, error: attemptError } = await supabase
      .from('call_attempts')
      .insert({
        organization_id: member.organization_id,
        agent_id: agentId || member.id,
        contact_id: contactId,
        call_list_contact_id: callListContactId,
        campaign_id: campaignId,
        phone_number: phoneNumber,
        direction: 'outbound',
        start_time: new Date().toISOString(),
        disposition: 'initiated',
        provider_call_id: callData.sid,
        metadata: {
          initiated_by: user.id,
          initiated_at: new Date().toISOString()
        }
      })
      .select()
      .single()

    if (attemptError) {
      console.error('Error creating call attempt:', attemptError)
    }

    // Track call minute usage (estimated 1 minute per call initiation)
    if (callAttempt) {
      await supabase
        .from('usage_events')
        .insert({
          organization_id: member.organization_id,
          resource_type: 'call_minutes',
          amount: 1, // Initial estimate, will be updated by webhook
          unit_cost: 0.025,
          total_cost: 0.025,
          campaign_id: campaignId,
          agent_id: agentId || member.id,
          contact_id: contactId,
          call_attempt_id: callAttempt.id,
          description: `Outbound call initiated to ${phoneNumber}`,
          metadata: {
            phone_number: phoneNumber,
            provider_call_id: callData.sid,
            estimated: true
          }
        })
    }

    // Update call_list_contact if applicable
    if (callListContactId) {
      await supabase
        .from('call_list_contacts')
        .update({
          status: 'in_progress',
          last_attempt_at: new Date().toISOString()
        })
        .eq('id', callListContactId)
    }

    // Return success without exposing provider details
    return NextResponse.json({
      success: true,
      callId: callAttempt?.id,
      message: 'Call initiated successfully',
      phoneNumber: phoneNumber
    })

  } catch (error) {
    console.error('Call initiation error:', error)
    return NextResponse.json({ 
      error: 'Failed to initiate call' 
    }, { status: 500 })
  }
}

// End an active call
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    // Check authentication
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const callId = searchParams.get('callId')

    if (!callId) {
      return NextResponse.json({ error: 'Call ID required' }, { status: 400 })
    }

    // Get call attempt to find provider call ID
    const { data: callAttempt } = await supabase
      .from('call_attempts')
      .select('provider_call_id, organization_id')
      .eq('id', callId)
      .single()

    if (!callAttempt) {
      return NextResponse.json({ error: 'Call not found' }, { status: 404 })
    }

    // Get voice config
    const { data: voiceConfig } = await supabase
      .from('voice_integrations')
      .select('*')
      .eq('organization_id', callAttempt.organization_id)
      .single()

    if (!voiceConfig) {
      return NextResponse.json({ error: 'Voice config not found' }, { status: 404 })
    }

    // Decrypt API token
    const encryptionKey = process.env.ENCRYPTION_KEY!
    const apiToken = decrypt(voiceConfig.api_token_encrypted, encryptionKey)

    // End call via SignalWire
    const signalwireUrl = `https://${voiceConfig.space_url}/api/relay/rest/calls/${callAttempt.provider_call_id}`
    
    await fetch(signalwireUrl, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${apiToken}`
      }
    })

    // Update call attempt
    await supabase
      .from('call_attempts')
      .update({
        end_time: new Date().toISOString(),
        disposition: 'ended_by_agent'
      })
      .eq('id', callId)

    return NextResponse.json({
      success: true,
      message: 'Call ended'
    })

  } catch (error) {
    console.error('End call error:', error)
    return NextResponse.json({ error: 'Failed to end call' }, { status: 500 })
  }
}