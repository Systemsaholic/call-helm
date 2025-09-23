import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

// Helper for required environment variables
function getRequiredEnv(key: string): string {
  const v = process.env[key]
  if (!v) throw new Error(`Missing required environment variable: ${key}`)
  return v
}

// Check if service role key is configured
const hasServiceRoleKey = !!process.env.SUPABASE_SERVICE_ROLE_KEY
if (!hasServiceRoleKey) {
  console.warn('SUPABASE_SERVICE_ROLE_KEY not configured - using simplified invitation flow')
}

// Create admin client with service role key for admin operations (if available)
const supabaseAdmin = hasServiceRoleKey
  ? createClient(getRequiredEnv("NEXT_PUBLIC_SUPABASE_URL"), getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })
  : null

export async function POST(request: NextRequest) {
  console.log('Invite API route called')
  try {

    // Get the current user's session
    const cookieStore = await cookies()
    
    // Debug: Log cookies
    const allCookies = cookieStore.getAll()
    console.log('Available cookies:', allCookies.map(c => c.name))
    
    const supabase = createServerClient(getRequiredEnv("NEXT_PUBLIC_SUPABASE_URL"), getRequiredEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"), {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
          } catch {
            // Log errors when setting cookies instead of silently swallowing
            console.error("Failed to set cookies in invite route")
          }
        }
      }
    })

    // Verify the user is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError) {
      console.error('Auth error in invite API:', authError)
      return NextResponse.json({ error: 'Authentication failed', details: authError.message }, { status: 401 })
    }
    
    if (!user) {
      console.error('No user found in invite API')
      return NextResponse.json({ error: 'User not authenticated' }, { status: 401 })
    }

    // Get the current user's organization member ID for tracking invitations
    let currentUserMemberId = null
    if (supabaseAdmin) {
      try {
        const { data: currentMember, error: memberError } = await supabaseAdmin
          .from('organization_members')
          .select('id')
          .eq('user_id', user.id)
          .single()
        
        if (currentMember && !memberError) {
          currentUserMemberId = currentMember.id
        } else {
          console.warn('Could not find organization member record for current user:', user.id)
        }
      } catch (error) {
        console.error('Error getting current user member ID:', error)
      }
    }

    // Get the request body
    const { agentIds } = await request.json()
    
    if (!agentIds || !Array.isArray(agentIds) || agentIds.length === 0) {
      return NextResponse.json({ error: 'Invalid agent IDs' }, { status: 400 })
    }

    // If we have admin client, use it for full invitation flow
    if (supabaseAdmin) {
      // Get agents to invite (both pending and already invited for resending)
      const { data: agents, error: fetchError } = await supabaseAdmin
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

      // Send invitations using admin client
      const results = await Promise.allSettled(
        agents.map(async (agent) => {
          try {
            let authUser = null
            let inviteError = null
            let userAlreadyExists = false
            
            // Check if this is a disposable email first (for informational warning)
            if (agent.email.includes('mailsac.com') || agent.email.includes('tempmail') || agent.email.includes('guerrillamail')) {
              console.warn(`Disposable email detected: ${agent.email}. These emails may have restrictions.`)
            }
            
            // Create auth user and send invitation
            const result = await supabaseAdmin.auth.admin.inviteUserByEmail(
              agent.email,
              {
                data: {
                  organization_member_id: agent.id,
                  organization_id: agent.organization_id,
                  role: agent.role,
                  full_name: agent.full_name,
                  email: agent.email,
                  invited: true
                },
                redirectTo: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3035'}/auth/callback?type=invite`
              }
            )
            
            authUser = result.data
            inviteError = result.error

            if (inviteError) {
              console.error(`Failed to invite ${agent.email}:`, inviteError)
              console.error('Invite error details:', {
                message: inviteError.message,
                code: inviteError.code,
                status: inviteError.status,
                details: (inviteError as any).details
              })
              
              // Handle specific Supabase auth errors
              if (inviteError.message?.includes('already registered') || inviteError.code === 'email_exists') {
                // User already exists - we need to sync our records instead of sending invitation
                console.log(`User ${agent.email} already exists, syncing records instead of sending invitation`)
                userAlreadyExists = true
                
                // Try to get the existing user info
                try {
                  const { data: existingUsers, error: getUserError } = await supabaseAdmin.auth.admin.listUsers({
                    page: 1,
                    perPage: 1000
                  })
                  
                  if (existingUsers && !getUserError) {
                    const existingUser = existingUsers.users.find(u => u.email === agent.email)
                    if (existingUser) {
                      authUser = { user: existingUser }
                      console.log(`Found existing user: ${existingUser.id}`)
                    }
                  }
                } catch (getUserError) {
                  console.error(`Failed to get existing user ${agent.email}:`, getUserError)
                }
              } else if (inviteError.code === 'over_email_send_rate_limit' || inviteError.message?.includes('rate limit')) {
                // Rate limit hit - provide helpful message
                console.error(`Rate limit hit for ${agent.email}. Default SMTP allows 4 emails/hour.`)
                throw new Error(`Email rate limit exceeded. Please wait before sending more invitations or configure custom SMTP.`)
              } else if (inviteError.message?.includes('not authorized') || inviteError.message?.includes('Email address not authorized')) {
                // Email not authorized - using default SMTP without custom configuration
                console.error(`Email ${agent.email} not authorized. Using default SMTP requires email to be in project team.`)
                throw new Error(`Email address not authorized. When using default SMTP, you can only send to team members. Configure custom SMTP to send to any email.`)
              } else {
                throw inviteError
              }
            }

            // Ensure profile exists for ALL users (both new and existing) before updating organization_members
            if (authUser?.user?.id) {
              try {
                // Try to create profile if it doesn't exist
                const { error: profileError } = await supabaseAdmin
                  .from('profiles')
                  .upsert({
                    id: authUser.user.id,
                    email: agent.email,
                    full_name: agent.full_name,
                    onboarded: userAlreadyExists, // Existing users are onboarded, new users need setup
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                  }, {
                    onConflict: 'id'
                  })

                if (profileError) {
                  console.error(`Failed to create/update profile for ${agent.email}:`, profileError)
                  throw profileError // This is critical - without profile, organization_members update will fail
                }
                
                console.log(`Profile ensured for user ${authUser.user.id} (${agent.email})`)
              } catch (profileError) {
                console.error(`Profile creation error for ${agent.email}:`, profileError)
                throw profileError
              }
            }

            // Update agent status
            const updateData = userAlreadyExists ? {
              // For existing users, mark as active and link the user account
              status: 'active',
              invited_at: new Date().toISOString(),
              user_id: authUser?.user?.id || null,
            } : {
              // For new invitations, mark as invited
              status: 'invited',
              invited_at: new Date().toISOString(),
              user_id: authUser?.user?.id || null,
            }

            const { error: updateError } = await supabaseAdmin
              .from('organization_members')
              .update(updateData)
              .eq('id', agent.id)

            if (updateError) {
              console.error(`Failed to update agent status for ${agent.email}:`, updateError)
              throw updateError
            }

            // Track invitation (only if we have current user's member ID)
            if (currentUserMemberId) {
              const { error: trackError } = await supabaseAdmin
                .from('agent_invitations')
                .insert({
                  organization_member_id: agent.id,
                  invited_by: currentUserMemberId,
                })

              if (trackError) {
                console.error(`Failed to track invitation for ${agent.email}:`, trackError)
                // Don't throw here, invitation was sent successfully
              }
            } else {
              console.warn(`Skipping invitation tracking for ${agent.email} - no current user member ID`)
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
        console.error('Failed agents:', failures.map(f => {
          if (f.status === 'rejected') {
            return { email: 'unknown', reason: f.reason }
          }
          return { 
            email: f.value?.agent?.email, 
            error: (f.value?.error as any)?.message || f.value?.error 
          }
        }))
      }

      // Check if any were resent
      const resentCount = agents.filter(a => a.status === 'invited').length
      const newInviteCount = agents.filter(a => a.status === 'pending_invitation').length
      
      let message = ''
      if (resentCount > 0 && newInviteCount > 0) {
        message = `${newInviteCount} new invitation(s) and ${resentCount} resent successfully`
      } else if (resentCount > 0) {
        message = `${resentCount} invitation(s) resent successfully`
      } else {
        message = `${successes.length} invitation(s) sent successfully`
      }
      
      if (failures.length > 0) {
        message += `, ${failures.length} failed`
      }
      
      return NextResponse.json({
        success: true,
        invited: successes.length,
        failed: failures.length,
        total: results.length,
        message
      })
    } else {
      // Simplified flow without service role key - just update status to show invitation was attempted
      // In production, you would need the service role key to actually send email invitations
      
      // Get agents using regular client (both pending and already invited for resending)
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

      // Update agent status to simulate invitation (for development)
      const results = await Promise.allSettled(
        agents.map(async (agent) => {
          try {
            // Update agent status to invited (simulation for development)
            const { error: updateError } = await supabase
              .from('organization_members')
              .update({
                status: 'invited',
                invited_at: new Date().toISOString(),
                // Note: In production with service role key, a user_id would be created here
              })
              .eq('id', agent.id)

            if (updateError) {
              console.error(`Failed to update agent status for ${agent.email}:`, updateError)
              throw updateError
            }

            // Track invitation (only if we have current user's member ID)
            if (currentUserMemberId) {
              const { error: trackError } = await supabase
                .from('agent_invitations')
                .insert({
                  organization_member_id: agent.id,
                  invited_by: currentUserMemberId,
                })

              if (trackError) {
                console.error(`Failed to track invitation for ${agent.email}:`, trackError)
                // Don't throw here, status was updated successfully
              }
            } else {
              console.warn(`Skipping invitation tracking for ${agent.email} - no current user member ID`)
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
        console.error('Some status updates failed:', failures)
      }

      // Check if any were resent
      const resentCount = agents.filter(a => a.status === 'invited').length
      const newInviteCount = agents.filter(a => a.status === 'pending_invitation').length
      
      let message = ''
      if (resentCount > 0 && newInviteCount > 0) {
        message = `${newInviteCount} new and ${resentCount} resent (marked as invited)`
      } else if (resentCount > 0) {
        message = `${resentCount} invitation(s) resent (marked as invited)`
      } else {
        message = `${successes.length} agent(s) marked as invited`
      }
      
      message += ' (email invitations require service role key)'
      
      if (failures.length > 0) {
        message = `${message}, ${failures.length} failed`
      }
      
      return NextResponse.json({
        success: true,
        invited: successes.length,
        failed: failures.length,
        total: results.length,
        message,
        warning: 'Service role key not configured - agents marked as invited but no emails sent'
      })
    }


  } catch (error) {
    console.error('Invitation API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}