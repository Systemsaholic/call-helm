import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient, type CookieOptions } from '@supabase/ssr'

// Test endpoint that simulates invitations without actually sending emails
export async function POST(request: NextRequest) {
  try {
    // Get the current user's session
    const cookieStore = await cookies()

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options)
              )
            } catch {
              // Ignore errors
            }
          },
        },
      }
    )

    // Verify the user is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Authentication failed' }, { status: 401 })
    }

    // Get the request body
    const { agentIds } = await request.json()
    
    if (!agentIds || !Array.isArray(agentIds) || agentIds.length === 0) {
      return NextResponse.json({ error: 'Invalid agent IDs' }, { status: 400 })
    }

    // Get agents to update
    const { data: agents, error: fetchError } = await supabase
      .from('organization_members')
      .select('*')
      .in('id', agentIds)
      .in('status', ['pending_invitation', 'invited'])

    if (fetchError) {
      console.error('Error fetching agents:', fetchError)
      return NextResponse.json({ error: 'Failed to fetch agents' }, { status: 500 })
    }

    if (!agents || agents.length === 0) {
      return NextResponse.json({ error: 'No agents found to invite' }, { status: 404 })
    }

    // Simulate invitation by updating status without sending emails
    const results = await Promise.allSettled(
      agents.map(async (agent) => {
        try {
          // Update agent status to invited (simulation for testing)
          const { error: updateError } = await supabase
            .from('organization_members')
            .update({
              status: 'invited',
              invited_at: new Date().toISOString(),
              // Note: In production, a user_id would be created via auth.admin.inviteUserByEmail
            })
            .eq('id', agent.id)

          if (updateError) {
            console.error(`Failed to update agent status for ${agent.email}:`, updateError)
            throw updateError
          }

          // Track invitation
          const { error: trackError } = await supabase
            .from('agent_invitations')
            .insert({
              organization_member_id: agent.id,
              invited_by: user.id,
            })

          if (trackError) {
            console.error(`Failed to track invitation for ${agent.email}:`, trackError)
            // Don't throw here, status was updated successfully
          }

          return { success: true, agent }
        } catch (error) {
          return { success: false, agent, error }
        }
      })
    )

    // Count successes and failures
    const successes = results.filter((r) => r.status === 'fulfilled' && r.value.success)
    const failures = results.filter((r) => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.success))

    if (failures.length > 0) {
      console.error('Some invitations failed:', failures)
    }

    // Check if any were resent
    const resentCount = agents.filter(a => a.status === 'invited').length
    const newInviteCount = agents.filter(a => a.status === 'pending_invitation').length
    
    let message = ''
    if (resentCount > 0 && newInviteCount > 0) {
      message = `${newInviteCount} new and ${resentCount} resent (marked as invited - TEST MODE)`
    } else if (resentCount > 0) {
      message = `${resentCount} invitation(s) resent (marked as invited - TEST MODE)`
    } else {
      message = `${successes.length} agent(s) marked as invited (TEST MODE)`
    }
    
    if (failures.length > 0) {
      message = `${message}, ${failures.length} failed`
    }
    
    return NextResponse.json({
      success: true,
      invited: successes.length,
      failed: failures.length,
      total: results.length,
      message,
      warning: 'TEST MODE - No actual emails sent. Status updated only.'
    })

  } catch (error) {
    console.error('Invitation test API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}