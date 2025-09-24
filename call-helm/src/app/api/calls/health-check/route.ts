import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    // Check authentication
    const {
      data: { user }
    } = await supabase.auth.getUser()
    
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    
    // Get user's organization
    const { data: member } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single()
    
    if (!member?.organization_id) {
      return NextResponse.json({ error: 'No organization found' }, { status: 400 })
    }
    
    // Check recent calls for timeouts (last 10 minutes)
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString()
    
    const { data: recentCalls, error: callsError } = await supabase
      .from('calls')
      .select('id, status, timeout_detected_at, webhook_last_received_at, failure_reason')
      .eq('organization_id', member.organization_id)
      .gte('created_at', tenMinutesAgo)
    
    if (callsError) {
      console.error('Error checking call health:', callsError)
      return NextResponse.json({ 
        healthy: true, 
        message: 'Unable to check system health' 
      })
    }
    
    // Count timeout failures
    const recentTimeouts = recentCalls?.filter(call => 
      call.timeout_detected_at || 
      call.failure_reason?.includes('timeout')
    ).length || 0
    
    // Check if any active calls haven't received webhooks recently
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
    const activeCalls = recentCalls?.filter(call => 
      !call.status || call.status === 'initiated' || call.status === 'answered'
    ) || []
    
    const webhookStale = activeCalls.some(call => {
      if (!call.webhook_last_received_at) return true
      return call.webhook_last_received_at < fiveMinutesAgo
    })
    
    // Calculate health metrics
    const totalRecentCalls = recentCalls?.length || 0
    const failureRate = totalRecentCalls > 0 ? 
      (recentTimeouts / totalRecentCalls) * 100 : 0
    
    return NextResponse.json({
      healthy: recentTimeouts <= 3 && !webhookStale,
      recentTimeouts,
      webhookStale,
      totalRecentCalls,
      failureRate: Math.round(failureRate),
      message: recentTimeouts > 3 ? 
        'High number of call failures detected' : 
        webhookStale ? 
          'Call system not receiving updates' : 
          'System healthy'
    })
    
  } catch (error) {
    console.error('Health check error:', error)
    return NextResponse.json({ 
      healthy: true, 
      message: 'Health check unavailable' 
    })
  }
}