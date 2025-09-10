import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    
    // Get status update from SignalWire
    const formData = await request.formData()
    const callSid = formData.get('CallSid') as string
    const callStatus = formData.get('CallStatus') as string
    const from = formData.get('From') as string
    const to = formData.get('To') as string
    const duration = formData.get('CallDuration') as string
    
    console.log('Call status update:', {
      callSid,
      callStatus,
      from,
      to,
      duration
    })

    // Find the phone number record to get organization
    const { data: phoneNumber } = await supabase
      .from('phone_numbers')
      .select('organization_id')
      .or(`number.eq.${from},number.eq.${to}`)
      .single()

    if (phoneNumber) {
      // Update call record
      const updateData: any = {
        status: callStatus,
        updated_at: new Date().toISOString()
      }

      if (callStatus === 'completed' && duration) {
        updateData.duration_seconds = parseInt(duration)
        updateData.ended_at = new Date().toISOString()
      }

      await supabase
        .from('calls')
        .update(updateData)
        .eq('call_sid', callSid)
        .eq('organization_id', phoneNumber.organization_id)
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error('Error handling call status:', error)
    return NextResponse.json({ error: 'Status update failed' }, { status: 500 })
  }
}