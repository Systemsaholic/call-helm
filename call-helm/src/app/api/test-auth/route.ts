import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { apiLogger } from '@/lib/logger'

export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies()

    // Log all cookies
    const allCookies = cookieStore.getAll()
    apiLogger.debug('Test Auth - Available cookies', { data: { cookies: allCookies.map(c => ({ name: c.name, hasValue: !!c.value })) } })

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
              // Ignore errors
            }
          },
        },
      }
    )

    const { data: { user }, error } = await supabase.auth.getUser()
    
    if (error) {
      apiLogger.error('Test Auth - Auth error', { error })
      return NextResponse.json({ 
        authenticated: false, 
        error: error.message,
        cookies: allCookies.map(c => c.name)
      }, { status: 401 })
    }
    
    if (!user) {
      apiLogger.error('Test Auth - No user found')
      return NextResponse.json({ 
        authenticated: false,
        error: 'No user found',
        cookies: allCookies.map(c => c.name)
      }, { status: 401 })
    }
    
    return NextResponse.json({ 
      authenticated: true,
      user: {
        id: user.id,
        email: user.email,
        metadata: user.user_metadata
      },
      cookies: allCookies.map(c => c.name)
    })
    
  } catch (error) {
    apiLogger.error('Test Auth - Unexpected error', { error })
    return NextResponse.json({ 
      authenticated: false,
      error: 'Unexpected error',
      details: error
    }, { status: 500 })
  }
}