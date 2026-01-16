import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { voiceLogger } from '@/lib/logger'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ recordingSid: string }> }
) {
  try {
    const { recordingSid } = await params
    
    voiceLogger.debug('Recording proxy request', { data: { recordingSid } })

    // Get authenticated user and verify access
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      voiceLogger.error('Auth error in recording proxy', { error: authError })
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Find the call record to verify user has access to this recording
    const { data: call, error: callError } = await supabase
      .from('calls')
      .select('recording_url, organization_id')
      .eq('recording_sid', recordingSid)
      .single()

    if (callError || !call) {
      voiceLogger.error('Recording SID not found', { error: callError, data: { recordingSid } })
      return NextResponse.json({ error: 'Recording not found' }, { status: 404 })
    }

    // Verify user has access to this organization
    const { data: member } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', user.id)
      .eq('organization_id', call.organization_id)
      .single()

    if (!member) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    // Fetch the recording with authentication
    const recordingUrl = call.recording_url

    if (!recordingUrl) {
      return NextResponse.json({ error: 'Recording URL not available' }, { status: 404 })
    }

    // Add Telnyx authentication if needed
    const headers: HeadersInit = {}

    const telnyxApiKey = process.env.TELNYX_API_KEY

    if (telnyxApiKey && recordingUrl.includes('telnyx')) {
      headers['Authorization'] = `Bearer ${telnyxApiKey}`
    }

    voiceLogger.debug('Fetching recording', { data: { recordingUrl, authConfigured: !!telnyxApiKey } })

    // Fetch the recording
    const recordingResponse = await fetch(recordingUrl, { headers })
    
    if (!recordingResponse.ok) {
      // Try to get error details
      const errorText = await recordingResponse.text()
      voiceLogger.error('Failed to fetch recording', {
        data: {
          status: recordingResponse.status,
          statusText: recordingResponse.statusText,
          url: recordingUrl,
          authConfigured: !!telnyxApiKey,
          errorBody: errorText
        }
      })

      return NextResponse.json({ 
        error: 'Failed to fetch recording',
        status: recordingResponse.status,
        details: recordingResponse.statusText
      }, { status: 500 })
    }

    // Stream the recording back to the client
    const recordingBlob = await recordingResponse.blob()
    
    return new NextResponse(recordingBlob, {
      status: 200,
      headers: {
        'Content-Type': recordingResponse.headers.get('Content-Type') || 'audio/mpeg',
        'Content-Length': recordingResponse.headers.get('Content-Length') || '',
        'Cache-Control': 'private, max-age=3600', // Cache for 1 hour
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET',
      },
    })
    
  } catch (error) {
    voiceLogger.error('Recording proxy error', { error })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}