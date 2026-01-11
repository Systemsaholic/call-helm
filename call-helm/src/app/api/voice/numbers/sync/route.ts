import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { signalwireService, SignalWireService } from '@/lib/services/signalwire'

// Sync existing phone numbers with SignalWire to get missing SIDs
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    
    // Check authentication
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user's organization
    const { data: member } = await supabase
      .from('organization_members')
      .select('organization_id, role')
      .eq('user_id', user.id)
      .single()

    if (!member || !['org_admin', 'super_admin'].includes(member.role)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    // Check if SignalWire is configured
    if (!SignalWireService.isConfigured()) {
      return NextResponse.json(
        { error: 'Voice services not configured' },
        { status: 503 }
      )
    }

    // Get organization's phone numbers from database
    const { data: dbNumbers, error: dbError } = await supabase
      .from('phone_numbers')
      .select('id, number, signalwire_phone_number_sid, organization_id')
      .eq('organization_id', member.organization_id)
      .is('signalwire_phone_number_sid', null) // Only sync numbers missing SIDs

    if (dbError) throw dbError

    if (!dbNumbers || dbNumbers.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No phone numbers need synchronization',
        synced: 0,
        errors: []
      })
    }

    // Get all phone numbers from SignalWire
    const signalwireNumbers = await signalwireService.listOwnedNumbers()

    const results = []
    const errors = []

    for (const dbNumber of dbNumbers) {
      try {
        // Find matching number in SignalWire (remove formatting for comparison)
        const cleanDbNumber = dbNumber.number.replace(/\D/g, '')
        const matchingSwNumber = signalwireNumbers.find(swNum => {
          const cleanSwNumber = swNum.phone_number.replace(/\D/g, '')
          return cleanSwNumber === cleanDbNumber
        })

        if (matchingSwNumber) {
          // Update database with SignalWire SID
          await supabase
            .from('phone_numbers')
            .update({
              signalwire_phone_number_sid: matchingSwNumber.sid,
              updated_at: new Date().toISOString()
            })
            .eq('id', dbNumber.id)

          results.push({
            id: dbNumber.id,
            number: dbNumber.number,
            signalwireSid: matchingSwNumber.sid,
            status: 'synced'
          })
        } else {
          errors.push({
            id: dbNumber.id,
            number: dbNumber.number,
            error: 'Phone number not found in SignalWire account'
          })
        }
      } catch (error) {
        console.error(`Error syncing number ${dbNumber.number}:`, error)
        errors.push({
          id: dbNumber.id,
          number: dbNumber.number,
          error: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    }

    return NextResponse.json({
      success: true,
      synced: results,
      errors,
      total: dbNumbers.length,
      successful: results.length,
      failed: errors.length,
      message: `Synchronized ${results.length} of ${dbNumbers.length} phone numbers`
    })
  } catch (error) {
    console.error('Error syncing phone numbers:', error)
    return NextResponse.json(
      { error: 'Failed to sync phone numbers with SignalWire' },
      { status: 500 }
    )
  }
}