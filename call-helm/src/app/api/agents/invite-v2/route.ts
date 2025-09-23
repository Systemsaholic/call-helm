import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { processBatch } from '@/lib/utils/batch'
import { inviteAgentsSchema } from '@/lib/validations/api.schema'
import { asyncHandler, AuthenticationError } from '@/lib/errors/handler'
import { rateLimiters } from '@/lib/middleware/rateLimiter'
import { AGENTS } from '@/lib/constants'

// Helper for required environment variables
function getRequiredEnv(key: string): string {
  const v = process.env[key]
  if (!v) throw new Error(`Missing required environment variable: ${key}`)
  return v
}

// Check if service role key is configured
const hasServiceRoleKey = !!process.env.SUPABASE_SERVICE_ROLE_KEY

// Create admin client with service role key for admin operations (if available)
const supabaseAdmin = hasServiceRoleKey
  ? createClient(getRequiredEnv("NEXT_PUBLIC_SUPABASE_URL"), getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })
  : null

export const POST = asyncHandler(async (request: NextRequest) => {
  // Apply rate limiting for expensive operations
  const rateLimitResult = await rateLimiters.expensive(request, async () => {
    console.log('Invite API route called')
    
    // Validate NEXT_PUBLIC_APP_URL is configured
    const appUrl = process.env.NEXT_PUBLIC_APP_URL
    if (!appUrl) {
      return NextResponse.json(
        { error: 'Application URL not configured. Please set NEXT_PUBLIC_APP_URL environment variable.' },
        { status: 500 }
      )
    }
    
    // Get the current user's session
    const cookieStore = await cookies()
    
    const supabase = createServerClient(
      getRequiredEnv("NEXT_PUBLIC_SUPABASE_URL"), 
      getRequiredEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"), 
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) => 
                cookieStore.set(name, value, options)
              )
            } catch {
              console.error("Failed to set cookies in invite route")
            }
          }
        }
      }
    )

    // Verify the user is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      throw new AuthenticationError('Authentication required')
    }

    // Validate request body
    const body = await request.json()
    const { agentIds } = inviteAgentsSchema.parse(body)

    // Get the current user's organization member ID
    let currentUserMemberId = null
    if (supabaseAdmin) {
      const { data: currentMember } = await supabaseAdmin
        .from('organization_members')
        .select('id')
        .eq('user_id', user.id)
        .single()
      
      if (currentMember) {
        currentUserMemberId = currentMember.id
      }
    }

    if (!supabaseAdmin) {
      return NextResponse.json({
        success: false,
        error: 'Service role key not configured',
        message: 'Email invitations require service role configuration'
      }, { status: 501 })
    }

    // Get agents to invite
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

    // Check if we're within bulk operation limits
    if (agents.length > AGENTS.BULK_OPERATION_LIMIT) {
      return NextResponse.json({
        error: `Too many agents. Maximum ${AGENTS.BULK_OPERATION_LIMIT} agents per operation`,
        code: 'BULK_LIMIT_EXCEEDED'
      }, { status: 400 })
    }

    // Process invitations in batches to prevent memory issues
    const inviteAgent = async (agent: any) => {
      let authUser = null
      let userAlreadyExists = false
      
      // Send invitation
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
          redirectTo: `${appUrl}/auth/callback?type=invite`
        }
      )
      
      authUser = result.data
      const inviteError = result.error

      if (inviteError) {
        // Handle user already exists
        if (inviteError.message?.includes('already registered') || inviteError.code === 'email_exists') {
          userAlreadyExists = true
          
          // Try to get existing user
          const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers({
            page: 1,
            perPage: 1000
          })
          
          if (existingUsers) {
            const existingUser = existingUsers.users.find(u => u.email === agent.email)
            if (existingUser) {
              authUser = { user: existingUser }
            }
          }
        } else {
          throw inviteError
        }
      }

      // Ensure profile exists
      if (authUser?.user?.id) {
        await supabaseAdmin
          .from('profiles')
          .upsert({
            id: authUser.user.id,
            email: agent.email,
            full_name: agent.full_name,
            onboarded: userAlreadyExists,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }, {
            onConflict: 'id'
          })
      }

      // Update agent status
      const updateData = userAlreadyExists ? {
        status: 'active',
        invited_at: new Date().toISOString(),
        user_id: authUser?.user?.id || null,
      } : {
        status: 'invited',
        invited_at: new Date().toISOString(),
        user_id: authUser?.user?.id || null,
      }

      await supabaseAdmin
        .from('organization_members')
        .update(updateData)
        .eq('id', agent.id)

      // Track invitation
      if (currentUserMemberId) {
        await supabaseAdmin
          .from('agent_invitations')
          .insert({
            organization_member_id: agent.id,
            invited_by: currentUserMemberId,
          })
      }

      return agent
    }

    // Process invitations with batching
    const { successes, failures } = await processBatch(
      agents,
      inviteAgent,
      {
        batchSize: 10, // Process 10 agents at a time
        delayBetweenBatches: 500, // 500ms delay between batches
        maxConcurrency: 5, // Max 5 concurrent invitations
        onBatchComplete: (index, results) => {
          console.log(`Invitation batch ${index + 1} completed`)
        },
        onBatchError: (index, error) => {
          console.error(`Invitation batch ${index + 1} failed:`, error)
        }
      }
    )

    // Prepare response
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
      
      // Log failure details
      console.error('Failed invitations:', failures.map(f => ({
        email: f.item?.email,
        error: f.error?.message
      })))
    }
    
    return NextResponse.json({
      success: true,
      invited: successes.length,
      failed: failures.length,
      total: agents.length,
      message,
      failures: failures.length > 0 ? failures.map(f => ({
        email: f.item?.email,
        error: f.error?.message
      })) : undefined
    })
  })
  
  return rateLimitResult
})