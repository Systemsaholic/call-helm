import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { voiceLogger } from '@/lib/logger'

// DEPRECATED: SignalWire config endpoint - no longer used
// Voice services now use Telnyx instead
export async function GET(request: NextRequest) {
  voiceLogger.warn('DEPRECATED: /api/signalwire/config is deprecated. Voice services now use Telnyx.')
  try {
    const supabase = await createClient()
    
    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    // Get user's organization
    const { data: member, error: memberError } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', user.id)
      .single()
    
    if (memberError || !member) {
      return NextResponse.json({ error: 'Organization member not found' }, { status: 404 })
    }
    
    // In production, you might want to generate a limited token specific to this user/session
    // For now, we'll use the environment variables but only expose what's needed
    const config = {
      projectId: process.env.SIGNALWIRE_PROJECT_ID,
      // In production, generate a user-specific token with limited permissions
      token: process.env.SIGNALWIRE_API_TOKEN,
      spaceUrl: process.env.SIGNALWIRE_SPACE_URL,
      topics: ['office'], // Could be organization-specific
      userId: user.id,
      organizationId: member.organization_id
    }
    
    if (!config.projectId || !config.token) {
      return NextResponse.json({ 
        error: 'SignalWire configuration not found' 
      }, { status: 500 })
    }
    
    return NextResponse.json(config)
    
  } catch (error) {
    voiceLogger.error('SignalWire config error', { error })
    return NextResponse.json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}