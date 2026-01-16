import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { Resend } from 'resend'
import { z } from 'zod'

// Helper for required environment variables
function getRequiredEnv(key: string): string {
  const v = process.env[key]
  if (!v) throw new Error(`Missing required environment variable: ${key}`)
  return v
}

// Create admin client with service role key
const supabaseAdmin = createClient(
  getRequiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
  getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
)

// Initialize Resend client
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null

// Request validation schema
const notifyAssignmentSchema = z.object({
  callListId: z.string().uuid(),
  agentAssignments: z.array(z.object({
    agentId: z.string().uuid(),
    contactCount: z.number().min(1),
  })),
})

/**
 * Generate assignment notification email HTML
 */
function generateAssignmentEmailHtml(params: {
  agentName: string
  contactCount: number
  callListName: string
  orgName: string
  dashboardUrl: string
  assignerName?: string
}): string {
  const { agentName, contactCount, callListName, orgName, dashboardUrl, assignerName } = params

  const contactWord = contactCount === 1 ? 'contact' : 'contacts'

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

        <h2 style="margin-bottom: 16px;">New contacts assigned to you!</h2>

        <p>Hi ${agentName},</p>

        <p>${assignerName ? `${assignerName} has assigned` : 'You have been assigned'} <strong>${contactCount} ${contactWord}</strong> from the <strong>"${callListName}"</strong> campaign at ${orgName}.</p>

        <p>These contacts are ready for you to call. Log in to your dashboard to view your assigned contacts and start making calls.</p>

        <p style="margin: 32px 0; text-align: center;">
          <a href="${dashboardUrl}" style="background-color: #2563eb; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
            View My Contacts
          </a>
        </p>

        <div style="background-color: #f8fafc; border-radius: 8px; padding: 16px; margin: 24px 0;">
          <p style="margin: 0; font-weight: 600; color: #334155;">Assignment Summary</p>
          <ul style="margin: 8px 0 0 0; padding-left: 20px; color: #64748b;">
            <li>Campaign: ${callListName}</li>
            <li>Contacts assigned: ${contactCount}</li>
            <li>Organization: ${orgName}</li>
          </ul>
        </div>

        <p style="font-size: 14px; color: #666;">
          Or copy and paste this link into your browser:<br>
          <a href="${dashboardUrl}" style="color: #2563eb; word-break: break-all;">${dashboardUrl}</a>
        </p>

        <hr style="margin-top: 32px; border: none; border-top: 1px solid #eee;">

        <p style="font-size: 12px; color: #999; text-align: center;">
          You're receiving this email because you're an agent at ${orgName} on Call Helm.<br>
          If you have questions, please contact your team administrator.
        </p>
      </body>
    </html>
  `
}

export async function POST(request: NextRequest) {
  console.log('Agent assignment notification API called')

  try {
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
              console.error("Failed to set cookies in notify-assignment route")
            }
          }
        }
      }
    )

    // Verify the user is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    // Validate request body
    const body = await request.json()
    const validationResult = notifyAssignmentSchema.safeParse(body)

    if (!validationResult.success) {
      return NextResponse.json({
        error: 'Invalid request body',
        details: validationResult.error.issues
      }, { status: 400 })
    }

    const { callListId, agentAssignments } = validationResult.data

    // Get call list details
    const { data: callList, error: callListError } = await supabaseAdmin
      .from('call_lists')
      .select('id, name, organization_id, organizations(name)')
      .eq('id', callListId)
      .single()

    if (callListError || !callList) {
      return NextResponse.json({ error: 'Call list not found' }, { status: 404 })
    }

    // Get current user's member details (assigner)
    const { data: assigner } = await supabaseAdmin
      .from('organization_members')
      .select('id, full_name')
      .eq('user_id', user.id)
      .single()

    const assignerName = assigner?.full_name || 'An administrator'
    const orgName = (callList.organizations as any)?.name || 'your organization'
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3035'

    // Get agent details
    const agentIds = agentAssignments.map(a => a.agentId)
    const { data: agents, error: agentsError } = await supabaseAdmin
      .from('organization_members')
      .select('id, email, full_name, user_id')
      .in('id', agentIds)

    if (agentsError) {
      console.error('Error fetching agents:', agentsError)
      return NextResponse.json({ error: 'Failed to fetch agent details' }, { status: 500 })
    }

    if (!agents || agents.length === 0) {
      return NextResponse.json({ error: 'No agents found' }, { status: 404 })
    }

    // Check if Resend is configured
    if (!resend) {
      console.warn('RESEND_API_KEY not configured - notifications not sent')
      return NextResponse.json({
        success: true,
        sent: 0,
        message: 'Resend not configured - emails not sent',
        agentCount: agentAssignments.length
      })
    }

    // Send notification to each agent
    const results = await Promise.allSettled(
      agentAssignments.map(async (assignment) => {
        const agent = agents.find(a => a.id === assignment.agentId)
        if (!agent || !agent.email) {
          console.warn(`Agent ${assignment.agentId} not found or has no email`)
          return { success: false, agentId: assignment.agentId, reason: 'Agent not found' }
        }

        const dashboardUrl = `${appUrl}/dashboard/call-board`

        const emailHtml = generateAssignmentEmailHtml({
          agentName: agent.full_name || 'there',
          contactCount: assignment.contactCount,
          callListName: callList.name,
          orgName,
          dashboardUrl,
          assignerName,
        })

        try {
          await resend.emails.send({
            from: 'Call Helm <notifications@callhelm.com>',
            to: agent.email,
            subject: `${assignment.contactCount} new contacts assigned to you - ${callList.name}`,
            html: emailHtml
          })

          console.log(`Assignment notification sent to ${agent.email} (${assignment.contactCount} contacts)`)
          return { success: true, agentId: assignment.agentId, email: agent.email }
        } catch (emailError) {
          console.error(`Failed to send notification to ${agent.email}:`, emailError)
          return {
            success: false,
            agentId: assignment.agentId,
            email: agent.email,
            error: emailError instanceof Error ? emailError.message : 'Unknown error'
          }
        }
      })
    )

    // Count successes and failures
    const successes = results.filter((r) => r.status === 'fulfilled' && (r.value as any).success)
    const failures = results.filter((r) => r.status === 'rejected' || (r.status === 'fulfilled' && !(r.value as any).success))

    console.log(`Assignment notifications: ${successes.length} sent, ${failures.length} failed`)

    return NextResponse.json({
      success: true,
      sent: successes.length,
      failed: failures.length,
      total: agentAssignments.length,
      message: failures.length > 0
        ? `${successes.length} notification(s) sent, ${failures.length} failed`
        : `${successes.length} notification(s) sent successfully`,
    })

  } catch (error) {
    console.error('Assignment notification API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
