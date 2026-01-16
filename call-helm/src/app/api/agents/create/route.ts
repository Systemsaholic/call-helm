import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { createAgentSchema } from '@/lib/validations/agent.schema'
import { asyncHandler, AuthenticationError, AuthorizationError } from '@/lib/errors/handler'
import { apiLogger } from '@/lib/logger'

// Helper for required environment variables
function getRequiredEnv(key: string): string {
  const v = process.env[key]
  if (!v) throw new Error(`Missing required environment variable: ${key}`)
  return v
}

// Create admin client with service role key for admin operations
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

export const POST = asyncHandler(async (request: NextRequest) => {
  apiLogger.info('Create Agent API route called')

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
            apiLogger.warn('Failed to set cookies in create agent route')
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
  const validatedData = createAgentSchema.parse(body)

  // Get the current user's organization membership and verify they have permission
  const { data: currentMember, error: memberError } = await supabaseAdmin
    .from('organization_members')
    .select('id, organization_id, role')
    .eq('user_id', user.id)
    .single()

  if (memberError || !currentMember) {
    apiLogger.error('Error fetching current member', { error: memberError })
    throw new AuthorizationError('You must belong to an organization to add agents')
  }

  // Check if user has permission to add agents (org_admin or team_lead)
  const allowedRoles = ['org_admin', 'team_lead', 'billing_admin']
  if (!allowedRoles.includes(currentMember.role)) {
    throw new AuthorizationError('You do not have permission to add agents')
  }

  // Check if email already exists in the organization
  const { data: existingAgent } = await supabaseAdmin
    .from('organization_members')
    .select('id, email')
    .eq('organization_id', currentMember.organization_id)
    .eq('email', validatedData.email)
    .maybeSingle()

  if (existingAgent) {
    return NextResponse.json(
      { error: 'An agent with this email already exists in your organization' },
      { status: 409 }
    )
  }

  // Create the agent record
  const { data: newAgent, error: createError } = await supabaseAdmin
    .from('organization_members')
    .insert({
      organization_id: currentMember.organization_id,
      email: validatedData.email,
      full_name: validatedData.full_name,
      phone: validatedData.phone || null,
      role: validatedData.role || 'agent',
      extension: validatedData.extension || null,
      department_id: validatedData.department_id && validatedData.department_id !== ''
        ? validatedData.department_id
        : null,
      bio: validatedData.bio || null,
      status: 'pending_invitation',
      is_active: false,
    })
    .select()
    .single()

  if (createError) {
    apiLogger.error('Error creating agent', { error: createError })
    return NextResponse.json(
      { error: 'Failed to create agent', details: createError.message },
      { status: 500 }
    )
  }

  apiLogger.info('Agent created', { data: { agentId: newAgent.id } })

  return NextResponse.json({
    success: true,
    agent: newAgent
  })
})
