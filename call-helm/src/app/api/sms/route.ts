import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { smsLogger } from '@/lib/logger'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    // Get user and organization
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: member } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', user.id)
      .single()

    if (!member) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
    }

    // Get SMS messages
    const { searchParams } = new URL(request.url)
    const phoneNumberId = searchParams.get('phoneNumberId')
    const contactId = searchParams.get('contactId')
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')

    let query = supabase
      .from('sms_messages')
      .select(`
        *,
        phone_numbers!sms_messages_phone_number_id_fkey(number, friendly_name),
        contacts!sms_messages_contact_id_fkey(first_name, last_name, phone)
      `)
      .eq('organization_id', member.organization_id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (phoneNumberId) {
      query = query.eq('phone_number_id', phoneNumberId)
    }

    if (contactId) {
      query = query.eq('contact_id', contactId)
    }

    const { data: messages, error } = await query

    if (error) throw error

    // Get conversation threads
    const { data: conversations } = await supabase
      .from('sms_messages')
      .select('contact_id, phone_number_id')
      .eq('organization_id', member.organization_id)
      .order('created_at', { ascending: false })

    // Group by unique conversations
    const uniqueConversations = new Map()
    conversations?.forEach(conv => {
      const key = `${conv.contact_id}-${conv.phone_number_id}`
      if (!uniqueConversations.has(key)) {
        uniqueConversations.set(key, conv)
      }
    })

    return NextResponse.json({
      success: true,
      messages,
      conversations: Array.from(uniqueConversations.values()),
      total: messages?.length || 0
    })

  } catch (error) {
    smsLogger.error('Error fetching SMS messages', { error })
    return NextResponse.json(
      { error: 'Failed to fetch SMS messages' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const body = await request.json()
    
    const { to, from, message, phoneNumberId, contactId } = body

    // Get user and organization
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: member } = await supabase
      .from('organization_members')
      .select('organization_id, organization:organizations(*)')
      .eq('user_id', user.id)
      .single()

    if (!member) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
    }

    // Check SMS quota
    const { data: limits } = await supabase
      .rpc('get_organization_limits_and_usage', {
        p_organization_id: member.organization_id
      })

    if (limits) {
      const usage = limits[0]
      if (usage.used_sms_messages >= usage.max_sms_messages) {
        return NextResponse.json(
          { error: 'SMS quota exceeded. Please upgrade your plan.' },
          { status: 402 }
        )
      }
    }

    // Send SMS via Telnyx
    const telnyxResponse = await fetch(
      'https://api.telnyx.com/v2/messages',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.TELNYX_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: from,
          to: to,
          text: message,
        }),
      }
    )

    if (!telnyxResponse.ok) {
      const error = await telnyxResponse.json()
      throw new Error(error.errors?.[0]?.detail || 'Failed to send SMS')
    }

    const smsData = await telnyxResponse.json()

    // Store SMS in database
    const { data: savedMessage, error: saveError } = await supabase
      .from('sms_messages')
      .insert({
        organization_id: member.organization_id,
        phone_number_id: phoneNumberId,
        contact_id: contactId,
        direction: 'outbound',
        from_number: from,
        to_number: to,
        body: message,
        status: 'sent',
        telnyx_message_id: smsData.data?.id,
        segments: Math.ceil(message.length / 160),
        cost: smsData.price || 0,
      })
      .select()
      .single()

    if (saveError) throw saveError

    // Track usage
    await supabase.rpc('track_usage', {
      p_organization_id: member.organization_id,
      p_resource_type: 'sms_messages',
      p_amount: 1,
      p_metadata: { message_id: savedMessage.id }
    })

    return NextResponse.json({
      success: true,
      message: savedMessage,
      sid: smsData.sid
    })

  } catch (error) {
    smsLogger.error('Error sending SMS', { error })
    return NextResponse.json(
      { error: 'Failed to send SMS' },
      { status: 500 }
    )
  }
}