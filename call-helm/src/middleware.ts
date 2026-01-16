import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  // Skip middleware if Supabase env vars are not set
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return NextResponse.next()
  }

  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // IMPORTANT: Avoid writing any logic between createServerClient and
  // supabase.auth.getUser(). A simple mistake could make your users very
  // confused.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Protected routes
  if (request.nextUrl.pathname.startsWith('/dashboard')) {
    // No user - redirect to login
    if (!user) {
      const url = request.nextUrl.clone()
      url.pathname = '/auth/login'
      return NextResponse.redirect(url)
    }
    
    // User exists but needs to complete setup
    // Check multiple conditions for users who need setup:
    // 1. User was invited (has invited flag in metadata)
    // 2. User hasn't completed onboarding
    // 3. User doesn't have a password set (no email provider)
    const wasInvited = user.user_metadata?.invited === true
    const onboardingNotCompleted = !user.user_metadata?.onboarding_completed
    const noPasswordSet = !user.app_metadata?.providers?.includes('email')
    
    const needsSetup = wasInvited && (onboardingNotCompleted || noPasswordSet)
    
    if (needsSetup) {
      const url = request.nextUrl.clone()
      url.pathname = '/auth/setup-account'
      return NextResponse.redirect(url)
    }
  }

  // Redirect to dashboard if authenticated and on auth pages (except setup-account)
  if (user && request.nextUrl.pathname.startsWith('/auth/')) {
    // Allow access to setup-account page for users who need to complete setup
    if (request.nextUrl.pathname === '/auth/setup-account') {
      // Check if user needs to complete setup:
      // 1. Invited users who haven't completed onboarding
      // 2. New signups who haven't completed onboarding (OAuth or email)
      // 3. Users without an organization
      const wasInvited = user.user_metadata?.invited === true
      const onboardingNotCompleted = !user.user_metadata?.onboarding_completed
      const noOrganization = !user.user_metadata?.organization_id

      const needsSetup = onboardingNotCompleted || noOrganization || wasInvited

      if (needsSetup) {
        // Allow access to setup page
        return supabaseResponse
      }
    }

    // Redirect all other auth pages to dashboard for authenticated users
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}