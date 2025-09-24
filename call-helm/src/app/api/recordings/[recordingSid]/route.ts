import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(
  request: NextRequest,
  { params }: { params: { recordingSid: string } }
) {
  try {
    const { recordingSid } = params
    
    console.log('Recording proxy request for SID:', recordingSid)
    
    // Get authenticated user and verify access
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      console.error('Auth error:', authError)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Find the call record to verify user has access to this recording
    const { data: call, error: callError } = await supabase
      .from('calls')
      .select('recording_url, organization_id')
      .eq('recording_sid', recordingSid)
      .single()

    if (callError || !call) {
      console.error('Call lookup error:', callError)
      console.error('Recording SID not found:', recordingSid)
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

    // Fetch the recording from SignalWire with authentication
    const recordingUrl = call.recording_url
    
    if (!recordingUrl) {
      return NextResponse.json({ error: 'Recording URL not available' }, { status: 404 })
    }

    // Add SignalWire authentication if needed
    const headers: HeadersInit = {}
    
    // If SignalWire requires basic auth, add it here
    const swProjectId = process.env.SIGNALWIRE_PROJECT_ID
    const swApiToken = process.env.SIGNALWIRE_API_TOKEN
    
    if (swProjectId && swApiToken) {
      const auth = Buffer.from(`${swProjectId}:${swApiToken}`).toString('base64')
      headers['Authorization'] = `Basic ${auth}`
    }
    
    console.log('Fetching recording from:', recordingUrl)
    console.log('Auth configured:', !!(swProjectId && swApiToken))

    // Fetch the recording
    const recordingResponse = await fetch(recordingUrl, { headers })
    
    if (!recordingResponse.ok) {
      console.error('Failed to fetch recording:', {
        status: recordingResponse.status,
        statusText: recordingResponse.statusText,
        url: recordingUrl,
        authConfigured: !!(swProjectId && swApiToken)
      })
      
      // Try to get error details
      const errorText = await recordingResponse.text()
      console.error('Error response body:', errorText)
      
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
    console.error('Recording proxy error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}