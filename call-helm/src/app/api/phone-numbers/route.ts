import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    // Check authentication
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user's organization
    const { data: member } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', user.id)
      .single()

    if (!member) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
    }

    // Fetch phone numbers
    const { data: phoneNumbers, error } = await supabase
      .from('phone_numbers')
      .select('*')
      .eq('organization_id', member.organization_id)
      .order('is_primary', { ascending: false })
      .order('created_at', { ascending: true })

    if (error) {
      console.error('Error fetching phone numbers:', error)
      return NextResponse.json({ error: 'Failed to fetch phone numbers' }, { status: 500 })
    }

    return NextResponse.json({ phoneNumbers: phoneNumbers || [] })

  } catch (error) {
    console.error('Phone numbers GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    // Check authentication
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user's organization and check admin role
    const { data: member } = await supabase
      .from('organization_members')
      .select('organization_id, role')
      .eq('user_id', user.id)
      .single()

    if (!member) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
    }

    if (member.role !== 'org_admin' && member.role !== 'super_admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const body = await request.json()
    const { number, friendly_name, capabilities, is_primary } = body

    // Validate required fields
    if (!number || !friendly_name) {
      return NextResponse.json({ 
        error: 'Phone number and friendly name are required' 
      }, { status: 400 })
    }

    // If this is marked as primary, unset other primary numbers
    if (is_primary) {
      await supabase
        .from('phone_numbers')
        .update({ is_primary: false })
        .eq('organization_id', member.organization_id)
    }

    // Create the phone number
    const { data: phoneNumber, error } = await supabase
      .from('phone_numbers')
      .insert({
        organization_id: member.organization_id,
        number,
        friendly_name,
        capabilities: capabilities || { voice: true, sms: false, mms: false, fax: false },
        is_primary: is_primary || false,
        status: 'active',
        provider: 'signalwire'
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating phone number:', error)
      return NextResponse.json({ error: 'Failed to create phone number' }, { status: 500 })
    }

    // Update voice integration with the new number
    const { data: voiceIntegration } = await supabase
      .from('voice_integrations')
      .select('phone_numbers, default_caller_id')
      .eq('organization_id', member.organization_id)
      .single()

    if (voiceIntegration) {
      const updatedNumbers = [...(voiceIntegration.phone_numbers || []), number]
      const updates: any = { phone_numbers: updatedNumbers }
      
      // If this is primary or the first number, set as default caller ID
      if (is_primary || !voiceIntegration.default_caller_id) {
        updates.default_caller_id = number
      }

      await supabase
        .from('voice_integrations')
        .update(updates)
        .eq('organization_id', member.organization_id)
    }

    return NextResponse.json({ phoneNumber })

  } catch (error) {
    console.error('Phone number POST error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    // Check authentication
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user's organization and check admin role
    const { data: member } = await supabase
      .from('organization_members')
      .select('organization_id, role')
      .eq('user_id', user.id)
      .single()

    if (!member) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
    }

    if (member.role !== 'org_admin' && member.role !== 'super_admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const body = await request.json()
    const { id, ...updates } = body

    if (!id) {
      return NextResponse.json({ error: 'Phone number ID is required' }, { status: 400 })
    }

    // If setting as primary, unset other primary numbers
    if (updates.is_primary) {
      await supabase
        .from('phone_numbers')
        .update({ is_primary: false })
        .eq('organization_id', member.organization_id)
        .neq('id', id)

      // Update default caller ID in voice integration
      const { data: phoneNumber } = await supabase
        .from('phone_numbers')
        .select('number')
        .eq('id', id)
        .single()

      if (phoneNumber) {
        await supabase
          .from('voice_integrations')
          .update({ default_caller_id: phoneNumber.number })
          .eq('organization_id', member.organization_id)
      }
    }

    // Update the phone number
    const { data, error } = await supabase
      .from('phone_numbers')
      .update(updates)
      .eq('id', id)
      .eq('organization_id', member.organization_id)
      .select()
      .single()

    if (error) {
      console.error('Error updating phone number:', error)
      return NextResponse.json({ error: 'Failed to update phone number' }, { status: 500 })
    }

    return NextResponse.json({ phoneNumber: data })

  } catch (error) {
    console.error('Phone number PATCH error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    // Check authentication
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user's organization and check admin role
    const { data: member } = await supabase
      .from('organization_members')
      .select('organization_id, role')
      .eq('user_id', user.id)
      .single()

    if (!member) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
    }

    if (member.role !== 'org_admin' && member.role !== 'super_admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'Phone number ID is required' }, { status: 400 })
    }

    // Get the phone number details before deletion
    const { data: phoneNumber } = await supabase
      .from('phone_numbers')
      .select('number, is_primary')
      .eq('id', id)
      .eq('organization_id', member.organization_id)
      .single()

    if (!phoneNumber) {
      return NextResponse.json({ error: 'Phone number not found' }, { status: 404 })
    }

    // Delete the phone number
    const { error } = await supabase
      .from('phone_numbers')
      .delete()
      .eq('id', id)
      .eq('organization_id', member.organization_id)

    if (error) {
      console.error('Error deleting phone number:', error)
      return NextResponse.json({ error: 'Failed to delete phone number' }, { status: 500 })
    }

    // Update voice integration to remove the number
    const { data: voiceIntegration } = await supabase
      .from('voice_integrations')
      .select('phone_numbers, default_caller_id')
      .eq('organization_id', member.organization_id)
      .single()

    if (voiceIntegration) {
      const updatedNumbers = (voiceIntegration.phone_numbers || []).filter((n: string) => n !== phoneNumber.number)
      const updates: any = { phone_numbers: updatedNumbers }
      
      // If this was the default caller ID, set another one
      if (voiceIntegration.default_caller_id === phoneNumber.number) {
        updates.default_caller_id = updatedNumbers[0] || null
      }

      await supabase
        .from('voice_integrations')
        .update(updates)
        .eq('organization_id', member.organization_id)
    }

    return NextResponse.json({ success: true })

  } catch (error) {
    console.error('Phone number DELETE error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}