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
    const { phoneNumber, forwardingNumber, organizationId } = await request.json()
    
    if (!phoneNumber || !forwardingNumber) {
      return NextResponse.json(
        { error: 'Phone number and forwarding number are required' },
        { status: 400 }
      )
    }

    // Verify user belongs to organization
    const { data: member } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', user.id)
      .eq('organization_id', organizationId)
      .single()

    if (!member) {
      return NextResponse.json({ error: 'Unauthorized for this organization' }, { status: 403 })
    }

    // Purchase the phone number
    const voiceUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/voice/webhook`
    const smsUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/voice/sms`
    
    const purchasedNumber = await signalwireService.purchaseNumber(phoneNumber, {
      friendlyName: `Business Number - ${organizationId}`,
      voiceUrl,
      smsUrl
    })

    // Update voice integration
    const { error: updateError } = await supabase
      .from('voice_integrations')
      .update({
        verified_number: phoneNumber,
        forwarding_number: forwardingNumber,
        verification_status: 'verified',
        number_type: 'platform',
        platform_number_sid: purchasedNumber.sid,
        updated_at: new Date().toISOString()
      })
      .eq('organization_id', organizationId)

    if (updateError) {
      // Try to release the number if database update fails
      try {
        await signalwireService.releaseNumber(purchasedNumber.sid)
      } catch (releaseError) {
        console.error('Failed to release number after error:', releaseError)
      }
      throw updateError
    }

    // Create phone number record
    const { error: phoneError } = await supabase
      .from('phone_numbers')
      .insert({
        organization_id: organizationId,
        number: phoneNumber,
        friendly_name: 'Platform Business Number',
        capabilities: {
          voice: true,
          sms: purchasedNumber.capabilities?.sms || false,
          mms: purchasedNumber.capabilities?.mms || false
        },
        status: 'active',
        is_primary: true,
        number_source: 'platform',
        forwarding_enabled: true,
        forwarding_destination: forwardingNumber,
        sid: purchasedNumber.sid,
        metadata: {
          purchased_at: new Date().toISOString(),
          monthly_price: 0
        }
      })

    if (phoneError) {
      console.error('Error creating phone number record:', phoneError)
    }

    // Configure call forwarding
    await signalwireService.configureForwarding(purchasedNumber.sid, forwardingNumber)

    return NextResponse.json({ 
      success: true,
      message: 'Phone number provisioned successfully',
      number: {
        phoneNumber: purchasedNumber.phoneNumber,
        sid: purchasedNumber.sid,
        forwardingNumber
      }
    })
  } catch (error) {
    console.error('Error provisioning phone number:', error)
    return NextResponse.json(
      { error: 'Failed to provision phone number' },
      { status: 500 }
    )
  }
}