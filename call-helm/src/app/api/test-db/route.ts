import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const supabase = await createClient()
    
    // Test auth
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError) {
      return NextResponse.json({ 
        error: 'Auth error', 
        details: authError,
        message: authError.message 
      }, { status: 401 })
    }
    
    if (!user) {
      return NextResponse.json({ 
        error: 'No user found',
        message: 'User is not authenticated' 
      }, { status: 401 })
    }
    
    // Test query
    const { data, error, count } = await supabase
      .from('organization_members')
      .select('*', { count: 'exact' })
      .limit(5)
    
    if (error) {
      return NextResponse.json({ 
        error: 'Query error',
        details: {
          message: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint,
          fullError: JSON.stringify(error)
        }
      }, { status: 500 })
    }
    
    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email
      },
      dataCount: count,
      sampleData: data
    })
    
  } catch (err) {
    return NextResponse.json({
      error: 'Server error',
      message: err instanceof Error ? err.message : 'Unknown error',
      stack: err instanceof Error ? err.stack : undefined
    }, { status: 500 })
  }
}