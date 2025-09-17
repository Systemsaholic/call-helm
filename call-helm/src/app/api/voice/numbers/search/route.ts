import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { signalwireService } from '@/lib/services/signalwire'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    
    // Check authentication
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get request body
    const { areaCode, region, contains } = await request.json()
    
    if (!areaCode && !region) {
      return NextResponse.json(
        { error: 'Either area code or region is required' },
        { status: 400 }
      )
    }

    // Check if SignalWire is configured
    if (!process.env.SIGNALWIRE_PROJECT_ID || !process.env.SIGNALWIRE_TOKEN) {
      return NextResponse.json(
        { error: 'Voice services not configured' },
        { status: 503 }
      )
    }

    // Search for available numbers
    const numbers = await signalwireService.searchAvailableNumbers({
      areaCode,
      region,
      contains,
      country: 'US'
    })

    // Limit results to 10 to keep UI manageable
    const limitedNumbers = numbers.slice(0, 10)

    return NextResponse.json({ 
      success: true,
      numbers: limitedNumbers,
      total: numbers.length
    })
  } catch (error) {
    console.error('Error searching phone numbers:', error)
    return NextResponse.json(
      { error: 'Failed to search available numbers' },
      { status: 500 }
    )
  }
}