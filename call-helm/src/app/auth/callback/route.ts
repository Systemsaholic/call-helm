import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/dashboard'
  const type = searchParams.get('type')
  const isSignup = searchParams.get('signup') === 'true'
  const isInvite = type === 'invite'

  if (code) {
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
              // The `setAll` method was called from a Server Component.
              // This can be ignored if you have middleware refreshing
              // user sessions.
            }
          },
        },
      }
    )

    const { error, data } = await supabase.auth.exchangeCodeForSession(code)

    console.log('Auth callback - code exchanged:', {
      error: error?.message,
      hasUser: !!data?.user,
      isSignup,
      isInvite,
      userId: data?.user?.id
    })

    if (!error && data?.user) {
      // For invited users, check if they need to set up their password
      // Invited users won't have app_metadata.provider set to 'email' initially
      const needsPasswordSetup = isInvite ||
        (!data.user.app_metadata?.providers?.includes('email') && data.user.email)

      // Check if this is the user's first login
      const isFirstLogin = data.user.created_at === data.user.last_sign_in_at

      // Check if user already has onboarding completed
      const onboardingCompleted = data.user.user_metadata?.onboarding_completed

      console.log('Auth callback - redirect decision:', {
        needsPasswordSetup,
        isFirstLogin,
        isSignup,
        onboardingCompleted,
        created_at: data.user.created_at,
        last_sign_in_at: data.user.last_sign_in_at,
        providers: data.user.app_metadata?.providers
      })

      // If this is an invitation or they need password setup, redirect to setup page
      // But skip if onboarding is already completed
      if ((needsPasswordSetup || isFirstLogin || isSignup) && !onboardingCompleted) {
        // For invited agents, redirect to set up their password/profile
        console.log('Auth callback - redirecting to setup-account')
        return NextResponse.redirect(`${origin}/auth/setup-account`)
      }

      console.log('Auth callback - redirecting to:', next)
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  // Return the user to an error page with instructions
  return NextResponse.redirect(`${origin}/auth/error`)
}