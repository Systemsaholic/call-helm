import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { telnyxService, TelnyxService } from '@/lib/services/telnyx'

// Sync existing phone numbers with Telnyx to get missing IDs
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

    // Check if Telnyx is configured
    if (!TelnyxService.isConfigured()) {
      return NextResponse.json(
        { error: 'Voice services not configured' },
        { status: 503 }
      )
    }

    // Get organization's phone numbers from database
    const { data: dbNumbers, error: dbError } = await supabase
      .from('phone_numbers')
      .select('id, number, telnyx_phone_number_id, organization_id')
      .eq('organization_id', member.organization_id)
      .is('telnyx_phone_number_id', null) // Only sync numbers missing IDs

    if (dbError) throw dbError

    if (!dbNumbers || dbNumbers.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No phone numbers need synchronization',
        synced: 0,
        errors: []
      })
    }

    // Get all phone numbers from Telnyx
    const telnyxNumbers = await telnyxService.listOwnedNumbers()

    const results: { id: string; number: string; telnyxId: string; status: string }[] = []
    const errors: { id: string; number: string; error: string }[] = []

    for (const dbNumber of dbNumbers) {
      try {
        // Find matching number in Telnyx (remove formatting for comparison)
        const cleanDbNumber = dbNumber.number.replace(/\D/g, '')
        const matchingTelnyxNumber = telnyxNumbers.find(tNum => {
          const cleanTelnyxNumber = tNum.phoneNumber.replace(/\D/g, '')
          return cleanTelnyxNumber === cleanDbNumber
        })

        if (matchingTelnyxNumber) {
          // Update database with Telnyx ID
          await supabase
            .from('phone_numbers')
            .update({
              telnyx_phone_number_id: matchingTelnyxNumber.id,
              provider: 'telnyx',
              updated_at: new Date().toISOString()
            })
            .eq('id', dbNumber.id)

          results.push({
            id: dbNumber.id,
            number: dbNumber.number,
            telnyxId: matchingTelnyxNumber.id,
            status: 'synced'
          })
        } else {
          errors.push({
            id: dbNumber.id,
            number: dbNumber.number,
            error: 'Phone number not found in Telnyx account'
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
      { error: 'Failed to sync phone numbers with Telnyx' },
      { status: 500 }
    )
  }
}