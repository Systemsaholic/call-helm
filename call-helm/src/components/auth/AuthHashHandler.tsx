'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'

/**
 * Client-side component that handles auth tokens in URL hash.
 * This is needed for invite links which use implicit grant flow
 * and return tokens in the URL hash fragment.
 */
export function AuthHashHandler() {
  const router = useRouter()

  useEffect(() => {
    // Only run on client-side and when there's a hash
    if (typeof window === 'undefined') return

    const hash = window.location.hash
    if (!hash || !hash.includes('access_token')) return

    const handleAuthHash = async () => {
      const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      )

      // Parse the hash to extract tokens
      const hashParams = new URLSearchParams(hash.substring(1))
      const accessToken = hashParams.get('access_token')
      const refreshToken = hashParams.get('refresh_token')
      const type = hashParams.get('type')

      // Check for errors in the hash
      const error = hashParams.get('error')
      if (error) {
        console.error('Auth error in hash:', {
          error,
          code: hashParams.get('error_code'),
          description: hashParams.get('error_description')
        })
        // Clear hash and redirect to login with error
        window.history.replaceState(null, '', window.location.pathname)
        router.push('/auth/login?error=' + encodeURIComponent(hashParams.get('error_description') || error))
        return
      }

      if (!accessToken || !refreshToken) {
        console.error('Missing tokens in hash')
        return
      }

      // Set the session from the hash tokens (this overrides any existing session)
      const { data, error: sessionError } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken
      })

      if (sessionError) {
        console.error('Error setting session from hash:', sessionError)
        window.history.replaceState(null, '', window.location.pathname)
        router.push('/auth/login?error=' + encodeURIComponent(sessionError.message))
        return
      }

      if (data?.user) {
        // Clear the hash from the URL
        window.history.replaceState(null, '', window.location.pathname)

        // Check if this is an invited user who needs setup
        const isInvited = data.user.user_metadata?.invited || type === 'invite'
        const onboardingCompleted = data.user.user_metadata?.onboarding_completed

        console.log('Auth hash handler - session set from hash:', {
          email: data.user.email,
          isInvited,
          onboardingCompleted,
          type
        })

        if (isInvited && !onboardingCompleted) {
          // Redirect to account setup for invited users
          router.push('/auth/setup-account')
        } else {
          // Redirect to dashboard
          router.push('/dashboard')
        }
      }
    }

    handleAuthHash()
  }, [router])

  return null
}
