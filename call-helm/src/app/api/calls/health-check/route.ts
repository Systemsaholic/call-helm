import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { voiceLogger } from '@/lib/logger'

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
      voiceLogger.error('Error checking call health', { error: callsError })
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
    
    // Check if any CURRENTLY active calls haven't received webhooks recently
    // Only check calls that are truly in progress (no end_time)
    const { data: activeCalls } = await supabase
      .from('calls')
      .select('id, webhook_last_received_at, created_at')
      .eq('organization_id', member.organization_id)
      .is('end_time', null) // Only get calls that haven't ended
      .gte('created_at', tenMinutesAgo) // Only recent calls
    
    const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString()
    const webhookStale = (activeCalls || []).some(call => {
      // If call is more than 30 seconds old and has no webhook received, it's stale
      const callAge = Date.now() - new Date(call.created_at).getTime()
      if (callAge > 30000 && !call.webhook_last_received_at) return true
      
      // If webhook was last received more than 2 minutes ago, it's stale
      if (call.webhook_last_received_at && call.webhook_last_received_at < twoMinutesAgo) {
        return true
      }
      
      return false
    })
    
    // Calculate health metrics
    const totalRecentCalls = recentCalls?.length || 0
    const failureRate = totalRecentCalls > 0 ? 
      (recentTimeouts / totalRecentCalls) * 100 : 0
    
    // Debug logging
    voiceLogger.debug('Health check', {
      data: {
        activeCalls: activeCalls?.length || 0,
        recentTimeouts,
        webhookStale,
        totalRecentCalls
      }
    })
    
    return NextResponse.json({
      healthy: recentTimeouts <= 3 && !webhookStale,
      recentTimeouts,
      webhookStale,
      totalRecentCalls,
      activeCallsCount: activeCalls?.length || 0,
      failureRate: Math.round(failureRate),
      message: recentTimeouts > 3 ? 
        'High number of call failures detected' : 
        webhookStale ? 
          'Call system not receiving updates' : 
          'System healthy'
    })
    
  } catch (error) {
    voiceLogger.error('Health check error', { error })
    return NextResponse.json({
      healthy: true,
      message: 'Health check unavailable'
    })
  }
}