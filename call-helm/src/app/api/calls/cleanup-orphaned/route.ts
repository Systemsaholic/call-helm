import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(request: NextRequest) {
  try {
    // Use service role client for admin operations
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Run the cleanup function to mark orphaned calls as failed
    const { data, error } = await supabase
      .rpc('cleanup_orphaned_calls')
    
    if (error) {
      console.error('Error running cleanup function:', error)
      return NextResponse.json({ 
        error: 'Failed to cleanup orphaned calls',
        details: error.message 
      }, { status: 500 })
    }

    // Also cleanup any calls that have been in "initiated" status for over 2 minutes
    const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString()
    
    const { data: initiatedCalls, error: fetchError } = await supabase
      .from('calls')
      .select('id, created_at, organization_id')
      .eq('status', 'answered') // Using 'answered' as placeholder for initiated
      .is('end_time', null)
      .lt('created_at', twoMinutesAgo)
      .not('metadata->call_status', 'is', null)
      .eq('metadata->>call_status', 'initiated')
    
    if (fetchError) {
      console.error('Error fetching stuck initiated calls:', fetchError)
    }

    let cleanedCount = 0
    if (initiatedCalls && initiatedCalls.length > 0) {
      console.log(`Found ${initiatedCalls.length} stuck initiated calls to cleanup`)
      
      // Update each stuck call (preserving existing metadata)
      for (const call of initiatedCalls) {
        // First get existing metadata
        const { data: existingCall } = await supabase
          .from('calls')
          .select('metadata')
          .eq('id', call.id)
          .single()

        const updatedMetadata = {
          ...existingCall?.metadata,
          auto_closed: true,
          cleanup_reason: 'stuck_initiated',
          cleanup_at: new Date().toISOString(),
          call_status: 'failed'
        }

        const { error: updateError } = await supabase
          .from('calls')
          .update({
            status: 'failed',
            end_time: new Date().toISOString(),
            metadata: updatedMetadata
          })
          .eq('id', call.id)
          .is('end_time', null) // Double check it's still orphaned

        if (!updateError) {
          cleanedCount++
        } else {
          console.error(`Failed to cleanup call ${call.id}:`, updateError)
        }
      }
    }

    // Also cleanup calls in "ringing" status for over 3 minutes
    const threeMinutesAgo = new Date(Date.now() - 3 * 60 * 1000).toISOString()
    
    const { data: ringingCalls, error: ringingFetchError } = await supabase
      .from('calls')
      .select('id, created_at, organization_id')
      .is('end_time', null)
      .lt('created_at', threeMinutesAgo)
      .or('metadata->>call_status.eq.ringing,metadata->>call_status.eq.answered')
    
    if (!ringingFetchError && ringingCalls && ringingCalls.length > 0) {
      console.log(`Found ${ringingCalls.length} stuck ringing calls to cleanup`)
      
      for (const call of ringingCalls) {
        // First get existing metadata
        const { data: existingCall } = await supabase
          .from('calls')
          .select('metadata')
          .eq('id', call.id)
          .single()

        const updatedMetadata = {
          ...existingCall?.metadata,
          auto_closed: true,
          cleanup_reason: 'stuck_ringing',
          cleanup_at: new Date().toISOString(),
          call_status: 'missed'
        }

        const { error: updateError } = await supabase
          .from('calls')
          .update({
            status: 'missed',
            end_time: new Date().toISOString(),
            metadata: updatedMetadata
          })
          .eq('id', call.id)
          .is('end_time', null)

        if (!updateError) {
          cleanedCount++
        }
      }
    }

    return NextResponse.json({ 
      success: true,
      message: 'Orphaned calls cleanup completed',
      cleanedCount,
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('Cleanup endpoint error:', error)
    return NextResponse.json({ 
      error: 'Internal server error' 
    }, { status: 500 })
  }
}