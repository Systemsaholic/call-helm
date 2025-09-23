import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { AuthenticationError, AuthorizationError } from '@/lib/errors/handler'

export interface AuthContext {
  user: {
    id: string
    email: string
  }
  organization: {
    id: string
    role: string
    memberId: string
  }
}

// Role hierarchy for permission checking
const roleHierarchy: Record<string, number> = {
  super_admin: 5,
  org_admin: 4,
  team_lead: 3,
  billing_admin: 2,
  agent: 1
}

// Check if user has required role or higher
export function hasRequiredRole(userRole: string, requiredRole: string): boolean {
  const userLevel = roleHierarchy[userRole] || 0
  const requiredLevel = roleHierarchy[requiredRole] || 0
  return userLevel >= requiredLevel
}

// Authentication middleware
export async function authenticate(req: NextRequest): Promise<AuthContext> {
  const supabase = await createClient()
  
  // Get the current user
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  
  if (authError || !user) {
    throw new AuthenticationError('Authentication required')
  }

  // Get user's organization membership
  const { data: member, error: memberError } = await supabase
    .from('organization_members')
    .select('id, organization_id, role')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .single()

  if (memberError || !member) {
    throw new AuthorizationError('No active organization membership found')
  }

  return {
    user: {
      id: user.id,
      email: user.email!
    },
    organization: {
      id: member.organization_id,
      role: member.role,
      memberId: member.id
    }
  }
}

// Authorization middleware factory
export function authorize(requiredRole: string) {
  return async function(authContext: AuthContext): Promise<void> {
    if (!hasRequiredRole(authContext.organization.role, requiredRole)) {
      throw new AuthorizationError(
        `Insufficient permissions. Required role: ${requiredRole}, your role: ${authContext.organization.role}`
      )
    }
  }
}

// Combined auth middleware for API routes
export function requireAuth(requiredRole?: string) {
  return async function(
    req: NextRequest,
    handler: (req: NextRequest, auth: AuthContext) => Promise<NextResponse>
  ): Promise<NextResponse> {
    try {
      // Authenticate user
      const authContext = await authenticate(req)
      
      // Check authorization if role is specified
      if (requiredRole) {
        await authorize(requiredRole)(authContext)
      }
      
      // Call the handler with auth context
      return await handler(req, authContext)
    } catch (error) {
      // Re-throw auth errors to be handled by error handler
      throw error
    }
  }
}

// Middleware for optional authentication (doesn't fail if not authenticated)
export async function optionalAuth(
  req: NextRequest,
  handler: (req: NextRequest, auth: AuthContext | null) => Promise<NextResponse>
): Promise<NextResponse> {
  try {
    const authContext = await authenticate(req)
    return await handler(req, authContext)
  } catch (error) {
    // If authentication fails, continue without auth context
    return await handler(req, null)
  }
}

// Helper to extract organization ID from request
export async function getOrganizationId(req: NextRequest): Promise<string> {
  const authContext = await authenticate(req)
  return authContext.organization.id
}

// Helper to check if user owns a resource
export async function checkResourceOwnership(
  supabase: any,
  tableName: string,
  resourceId: string,
  organizationId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from(tableName)
    .select('id')
    .eq('id', resourceId)
    .eq('organization_id', organizationId)
    .single()
  
  return !error && !!data
}

// Middleware for verifying resource ownership
export function requireResourceOwnership(tableName: string, getResourceId: (req: NextRequest) => string) {
  return async function(
    req: NextRequest,
    handler: (req: NextRequest, auth: AuthContext) => Promise<NextResponse>
  ): Promise<NextResponse> {
    // Authenticate internally
    const authContext = await authenticate(req)
    
    const supabase = await createClient()
    const resourceId = getResourceId(req)
    
    const isOwner = await checkResourceOwnership(
      supabase,
      tableName,
      resourceId,
      authContext.organization.id
    )
    
    if (!isOwner) {
      throw new AuthorizationError('You do not have access to this resource')
    }
    
    return await handler(req, authContext)
  }
}