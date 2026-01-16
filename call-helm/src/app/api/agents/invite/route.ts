import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { Resend } from 'resend'
import { processBatch } from '@/lib/utils/batch'
import { inviteAgentsSchema } from '@/lib/validations/api.schema'
import { asyncHandler, AuthenticationError } from '@/lib/errors/handler'
import { rateLimiters } from '@/lib/middleware/rateLimiter'
import { AGENTS } from '@/lib/constants'
import { apiLogger } from '@/lib/logger'

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

// Initialize Resend client for custom branded emails
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null

/**
 * Generate invitation email HTML with custom branding
 */
function generateInviteEmailHtml(params: {
  inviteUrl: string
  agentName: string
  orgName: string
  inviterName?: string
}): string {
  const { inviteUrl, agentName, orgName, inviterName } = params

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 32px;">
          <h1 style="color: #2563eb; margin-bottom: 8px;">Call Helm</h1>
        </div>

        <h2 style="margin-bottom: 16px;">You're invited to join ${orgName}!</h2>

        <p>Hi ${agentName},</p>

        <p>${inviterName ? `${inviterName} has invited you` : 'You have been invited'} to join <strong>${orgName}</strong> on Call Helm as an agent.</p>

        <p>Click the button below to accept your invitation and set up your account:</p>

        <p style="margin: 32px 0; text-align: center;">
          <a href="${inviteUrl}" style="background-color: #2563eb; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
            Accept Invitation
          </a>
        </p>

        <p style="font-size: 14px; color: #666;">
          Or copy and paste this link into your browser:<br>
          <a href="${inviteUrl}" style="color: #2563eb; word-break: break-all;">${inviteUrl}</a>
        </p>

        <p style="font-size: 14px; color: #666;">
          This invitation link will expire in 24 hours.
        </p>

        <hr style="margin-top: 32px; border: none; border-top: 1px solid #eee;">

        <p style="font-size: 12px; color: #999; text-align: center;">
          You're receiving this email because someone invited you to Call Helm.<br>
          If you didn't expect this invitation, you can safely ignore this email.
        </p>
      </body>
    </html>
  `
}

export const POST = asyncHandler(async (request: NextRequest) => {
  // Apply rate limiting for expensive operations
  const rateLimitResult = await rateLimiters.expensive(request, async () => {
    apiLogger.info('Agent invite API route called')

    // Validate NEXT_PUBLIC_APP_URL is configured
    const appUrl = process.env.NEXT_PUBLIC_APP_URL
    if (!appUrl) {
      return NextResponse.json(
        { error: 'Application URL not configured. Please set NEXT_PUBLIC_APP_URL environment variable.' },
        { status: 500 }
      )
    }

    // Check Resend configuration
    if (!resend) {
      apiLogger.warn('RESEND_API_KEY not configured - falling back to Supabase SMTP')
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
          setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options)
              )
            } catch {
              apiLogger.error('Failed to set cookies in invite route')
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

    // Get the current user's organization member ID and details
    let currentUserMemberId = null
    let currentUserName = 'An administrator'
    let organizationName = 'the organization'

    if (supabaseAdmin) {
      const { data: currentMember } = await supabaseAdmin
        .from('organization_members')
        .select('id, full_name, organization_id, organizations(name)')
        .eq('user_id', user.id)
        .single()

      if (currentMember) {
        currentUserMemberId = currentMember.id
        currentUserName = currentMember.full_name || 'An administrator'
        organizationName = (currentMember.organizations as any)?.name || 'your organization'
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
      apiLogger.error('Error fetching agents', { error: fetchError })
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

    // Process invitations in batches
    const inviteAgent = async (agent: typeof agents[0]) => {
      let authUser = null
      let userAlreadyExists = false
      let inviteLink: string | null = null

      // Use Supabase's generateLink API to create an invite link without sending email
      const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
        type: 'invite',
        email: agent.email,
        options: {
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
      })

      if (linkError) {
        // Handle user already exists
        if (linkError.message?.includes('already registered') || linkError.code === 'email_exists') {
          userAlreadyExists = true
          apiLogger.debug('User already exists, syncing records', { data: { email: agent.email } })

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
          apiLogger.error('Failed to generate invite link', { error: linkError, data: { email: agent.email } })
          throw linkError
        }
      } else if (linkData) {
        authUser = linkData
        // The hashed_token is used to construct the verification URL
        // Supabase returns the full action link in linkData.properties.action_link
        inviteLink = linkData.properties?.action_link || null

        if (!inviteLink && linkData.properties?.hashed_token) {
          // Construct the link manually if action_link is not provided
          inviteLink = `${appUrl}/auth/callback?token_hash=${linkData.properties.hashed_token}&type=invite`
        }

        apiLogger.debug('Generated invite link', { data: { email: agent.email } })
      }

      // Send email via Resend if we have an invite link and Resend is configured
      if (inviteLink && resend && !userAlreadyExists) {
        try {
          const emailHtml = generateInviteEmailHtml({
            inviteUrl: inviteLink,
            agentName: agent.full_name || 'there',
            orgName: organizationName,
            inviterName: currentUserName
          })

          await resend.emails.send({
            from: 'Call Helm <notifications@callhelm.com>',
            to: agent.email,
            subject: `You're invited to join ${organizationName} on Call Helm`,
            html: emailHtml
          })

          apiLogger.info('Invitation email sent via Resend', { data: { email: agent.email } })
        } catch (emailError) {
          apiLogger.error('Failed to send email via Resend', { error: emailError, data: { email: agent.email } })
          // Don't throw - the invite link was created successfully
          // The user can still be re-invited later
        }
      } else if (inviteLink && !resend) {
        apiLogger.warn('No RESEND_API_KEY configured - invite link generated but email not sent', { data: { email: agent.email } })
        apiLogger.debug('Manual invite link generated', { data: { inviteLink } })
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
        batchSize: 10,
        delayBetweenBatches: 500,
        maxConcurrency: 5,
        onBatchComplete: (index) => {
          apiLogger.debug('Invitation batch completed', { data: { batchIndex: index + 1 } })
        },
        onBatchError: (index, error) => {
          apiLogger.error('Invitation batch failed', { error, data: { batchIndex: index + 1 } })
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

    if (!resend) {
      message += ' (Note: RESEND_API_KEY not configured - emails not sent)'
    }

    if (failures.length > 0) {
      message += `, ${failures.length} failed`

      apiLogger.error('Failed invitations', {
        data: { failures: failures.map(f => ({ email: f.item?.email, error: f.error?.message })) }
      })
    }

    return NextResponse.json({
      success: true,
      invited: successes.length,
      failed: failures.length,
      total: agents.length,
      message,
      emailProvider: resend ? 'resend' : 'none',
      failures: failures.length > 0 ? failures.map(f => ({
        email: f.item?.email,
        error: f.error?.message
      })) : undefined
    })
  })

  return rateLimitResult
})
