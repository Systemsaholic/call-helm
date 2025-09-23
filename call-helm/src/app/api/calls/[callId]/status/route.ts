import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(
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
    
    // Get call status
    const { data: call, error } = await supabase
      .from('calls')
      .select('id, status, start_time, end_time, duration, metadata')
      .eq('id', callId)
      .single()
    
    if (error || !call) {
      return NextResponse.json({ error: 'Call not found' }, { status: 404 })
    }
    
    // Map database status to UI-friendly status
    // The database uses a limited enum, so we check metadata for real status
    let displayStatus = call.status
    if (call.metadata?.call_status) {
      // Use the actual status from webhook if available
      displayStatus = call.metadata.call_status
    } else if (call.metadata?.initial_status) {
      // Use the initial status if no webhook update yet
      displayStatus = call.metadata.initial_status
    }
    
    console.log(`Status API Response for ${call.id}:`, {
      dbStatus: call.status,
      metadataStatus: call.metadata?.call_status,
      displayStatus,
      endTime: call.end_time
    })
    
    return NextResponse.json({
      callId: call.id,
      status: displayStatus,
      startTime: call.start_time,
      endTime: call.end_time,
      duration: call.duration,
      externalId: call.metadata?.external_id
    })
    
  } catch (error) {
    console.error('Error getting call status:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}