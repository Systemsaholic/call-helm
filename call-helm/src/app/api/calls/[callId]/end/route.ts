import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { telnyxService } from '@/lib/services/telnyx'
import { voiceLogger } from '@/lib/logger'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ callId: string }> }
) {
  try {
    const supabase = await createClient()

    // Check authentication
    const {
      data: { user }
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Await params before accessing properties
    const { callId } = await params

    // Get the call record to find the external call ID
    const { data: callRecord, error: fetchError } = await supabase
      .from('calls')
      .select('metadata')
      .eq('id', callId)
      .single()

    if (fetchError || !callRecord) {
      voiceLogger.error('Error fetching call', { error: fetchError })
      return NextResponse.json({ error: 'Call not found' }, { status: 404 })
    }

    const externalCallId = callRecord.metadata?.external_id
    const provider = callRecord.metadata?.provider || 'telnyx'

    // End the call with the provider
    if (externalCallId && provider === 'telnyx') {
      try {
        await telnyxService.hangupCall(externalCallId)
        voiceLogger.info('Successfully ended Telnyx call', { data: { externalCallId } })
      } catch (providerError) {
        voiceLogger.error('Error ending call with provider', { error: providerError })
        // Continue even if provider fails - we'll still update our database
      }
    }
    
    // Update the call record to mark it as ended
    const { error } = await supabase
      .from('calls')
      .update({
        end_time: new Date().toISOString(),
        status: 'abandoned', // Mark as abandoned when manually ended
        metadata: {
          ...callRecord.metadata,
          call_status: 'ended',
          ended_by: user.id,
          ended_at: new Date().toISOString()
        }
      })
      .eq('id', callId)
    
    if (error) {
      voiceLogger.error('Error ending call', { error })
      return NextResponse.json({ error: 'Failed to end call' }, { status: 500 })
    }
    
    return NextResponse.json({ success: true, callId })
    
  } catch (error) {
    voiceLogger.error('Error in end call endpoint', { error })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}