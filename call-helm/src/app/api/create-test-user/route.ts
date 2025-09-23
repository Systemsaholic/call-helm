import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { createTestUserSchema } from '@/lib/validations/api.schema'
import { asyncHandler, ValidationError } from '@/lib/errors/handler'

function getRequiredEnv(key: string): string {
  const v = process.env[key]
  if (!v) throw new Error(`Missing required environment variable: ${key}`)
  return v
}

export const POST = asyncHandler(async (request: NextRequest) => {
  // Validate env before creating client
  const supabaseUrl = getRequiredEnv("NEXT_PUBLIC_SUPABASE_URL")
  const serviceRole = getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY")

  // Parse and validate request body
  const body = await request.json().catch(() => ({}))
  const validatedInput = createTestUserSchema.parse(body)

  // Create admin client with service role key
  const supabaseAdmin = createClient(supabaseUrl, serviceRole, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  })

  // Create test user with validated or generated values
  const email = validatedInput.email || `test-user-${Date.now()}@mailsac.com`
  const password = validatedInput.password || "TestPassword123!"

  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      full_name: "Test User",
      onboarding_completed: true
    }
  })

  if (authError) {
    console.error("Auth error:", authError)
    throw authError
  }

  if (!authData.user) {
    throw new ValidationError("Failed to create user")
  }

  // Add user to Organization (use validated organizationId or env fallback)
  const organizationId = validatedInput.organizationId || process.env.ORGANIZATION_ID
  if (!organizationId) {
    console.error("ORGANIZATION_ID not configured and not provided")
    throw new ValidationError("Test user creation not configured. Please set ORGANIZATION_ID in environment variables or provide organizationId in request.")
  }
  
  const { data: orgMember, error: orgError } = await supabaseAdmin
    .from("organization_members")
    .insert({
      organization_id: organizationId,
      user_id: authData.user.id,
      email: email,
      full_name: "Test User",
      role: "agent",
      status: "active",
      is_active: true
    })
    .select()
    .single()

  if (orgError) {
    console.error("Org member error:", orgError)
    // Still return user info even if org assignment fails
  }

  return NextResponse.json({
    success: true,
    email,
    password,
    user_id: authData.user.id,
    org_member: orgMember
  })
})