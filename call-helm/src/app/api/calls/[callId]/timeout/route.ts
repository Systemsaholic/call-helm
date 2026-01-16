import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
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
    const body = await request.json()
    const { timeoutStage, timeoutAt } = body
    
    // First, get the existing call to preserve metadata
    const { data: existingCall } = await supabase
      .from('calls')
      .select('metadata')
      .eq('id', callId)
      .is('end_time', null)
      .single()

    if (!existingCall) {
      return NextResponse.json({ error: 'Call not found or already ended' }, { status: 404 })
    }

    // Merge timeout info with existing metadata (preserving external_id, etc.)
    const updatedMetadata = {
      ...existingCall.metadata,
      timeout_detected: true,
      timeout_stage: timeoutStage,
      timeout_at: timeoutAt,
      failure_reason: `Timeout at ${timeoutStage} stage`,
      call_status: 'failed' // Also set call_status for consistency
    }

    // Update call with timeout information
    const { data: call, error } = await supabase
      .from('calls')
      .update({
        status: 'failed',
        end_time: timeoutAt || new Date().toISOString(),
        metadata: updatedMetadata
      })
      .eq('id', callId)
      .is('end_time', null) // Only update if not already ended
      .select()
      .single()
    
    if (error) {
      voiceLogger.error('Error marking call as timed out', { error })
      return NextResponse.json({ error: 'Failed to update call' }, { status: 500 })
    }
    
    voiceLogger.info('Call marked as timed out', { data: { callId, timeoutStage } })
    
    return NextResponse.json({
      success: true,
      callId,
      timeoutStage,
      message: 'Call marked as timed out'
    })
    
  } catch (error) {
    voiceLogger.error('Error in timeout endpoint', { error })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}