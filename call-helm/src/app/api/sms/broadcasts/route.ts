import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { billingService } from '@/lib/services/billing'
import { smsLogger } from '@/lib/logger'

interface CreateBroadcastRequest {
  name: string
  messageTemplate: string
  fromPhoneNumberId: string
  recipients: Array<{
    phoneNumber: string
    contactName?: string
    variables?: Record<string, string>
  }>
  scheduledAt?: string
}

// Format phone number to E.164 format
function formatPhoneNumber(phone: string): string {
  const cleaned = phone.replace(/\D/g, '')
  if (cleaned.length === 10) {
    return `+1${cleaned}`
  } else if (cleaned.length === 11 && cleaned.startsWith('1')) {
    return `+${cleaned}`
  }
  return cleaned.startsWith('+') ? phone : `+${cleaned}`
}

// Validate phone number format
function isValidPhoneNumber(phone: string): boolean {
  const formatted = formatPhoneNumber(phone)
  return /^\+1\d{10}$/.test(formatted)
}

// GET - List broadcasts for organization
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user's organization
    const { data: member } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .single()

    if (!member) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
    }

    // Check feature access
    const featureCheck = await billingService.checkFeatureAccess(
      member.organization_id,
      'sms_broadcasts'
    )
    if (!featureCheck.hasAccess) {
      return NextResponse.json({
        error: 'SMS broadcasts require a Professional plan or higher',
        code: 'FEATURE_NOT_AVAILABLE'
      }, { status: 403 })
    }

    // Get query params for filtering
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')

    // Build query
    let query = supabase
      .from('sms_broadcasts')
      .select(`
        *,
        phone_numbers (
          id,
          number,
          friendly_name
        ),
        campaign_registry_campaigns (
          id,
          campaign_name,
          status
        )
      `, { count: 'exact' })
      .eq('organization_id', member.organization_id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (status) {
      query = query.eq('status', status)
    }

    const { data: broadcasts, error, count } = await query

    if (error) {
      smsLogger.error('Error fetching broadcasts', { error })
      return NextResponse.json({ error: 'Failed to fetch broadcasts' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      broadcasts: broadcasts || [],
      total: count || 0,
      limit,
      offset
    })
  } catch (error) {
    smsLogger.error('Error in broadcasts GET', { error })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST - Create a new broadcast
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user's organization
    const { data: member } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .single()

    if (!member) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
    }

    const body: CreateBroadcastRequest = await request.json()
    const { name, messageTemplate, fromPhoneNumberId, recipients, scheduledAt } = body

    // Validate required fields
    if (!name || !messageTemplate || !fromPhoneNumberId || !recipients?.length) {
      return NextResponse.json({
        error: 'Missing required fields: name, messageTemplate, fromPhoneNumberId, recipients'
      }, { status: 400 })
    }

    // Check broadcast feature access
    const broadcastCheck = await billingService.canSendBroadcast(
      member.organization_id,
      recipients.length
    )
    if (!broadcastCheck.canSend) {
      return NextResponse.json({
        error: broadcastCheck.reason,
        code: broadcastCheck.requiresUpgrade ? 'PLAN_UPGRADE_REQUIRED' : 'BROADCAST_NOT_ALLOWED'
      }, { status: 403 })
    }

    // Validate phone number belongs to organization
    const { data: phoneNumber } = await supabase
      .from('phone_numbers')
      .select('id, number, status')
      .eq('id', fromPhoneNumberId)
      .eq('organization_id', member.organization_id)
      .single()

    if (!phoneNumber) {
      return NextResponse.json({ error: 'Phone number not found' }, { status: 404 })
    }

    if (phoneNumber.status !== 'active') {
      return NextResponse.json({
        error: 'Phone number is not active',
        code: 'PHONE_NUMBER_INACTIVE'
      }, { status: 400 })
    }

    // Validate 10DLC compliance
    const compliance = await billingService.validate10DLCCompliance(fromPhoneNumberId)
    if (!compliance.valid) {
      return NextResponse.json({
        error: compliance.error,
        code: '10DLC_NOT_COMPLIANT'
      }, { status: 400 })
    }

    // Process recipients - dedupe and validate
    const uniqueRecipients = new Map<string, typeof recipients[0]>()
    const invalidNumbers: string[] = []

    for (const recipient of recipients) {
      const formatted = formatPhoneNumber(recipient.phoneNumber)

      if (!isValidPhoneNumber(formatted)) {
        invalidNumbers.push(recipient.phoneNumber)
        continue
      }

      // Keep first occurrence (deduplication)
      if (!uniqueRecipients.has(formatted)) {
        uniqueRecipients.set(formatted, {
          ...recipient,
          phoneNumber: formatted
        })
      }
    }

    if (uniqueRecipients.size === 0) {
      return NextResponse.json({
        error: 'No valid recipients provided',
        invalidNumbers
      }, { status: 400 })
    }

    // Check for opted-out contacts
    const phoneNumbers = Array.from(uniqueRecipients.keys())
    const { data: optedOutConversations } = await supabase
      .from('sms_conversations')
      .select('phone_number')
      .eq('organization_id', member.organization_id)
      .eq('is_opted_out', true)
      .in('phone_number', phoneNumbers)

    const optedOutNumbers = new Set(optedOutConversations?.map(c => c.phone_number) || [])

    // Create broadcast record
    const { data: broadcast, error: broadcastError } = await supabase
      .from('sms_broadcasts')
      .insert({
        organization_id: member.organization_id,
        name,
        message_template: messageTemplate,
        from_phone_number_id: fromPhoneNumberId,
        campaign_id: compliance.campaignId,
        status: scheduledAt ? 'scheduled' : 'draft',
        scheduled_at: scheduledAt || null,
        total_recipients: uniqueRecipients.size,
        created_by: user.id
      })
      .select()
      .single()

    if (broadcastError) {
      smsLogger.error('Error creating broadcast', { error: broadcastError })
      return NextResponse.json({ error: 'Failed to create broadcast' }, { status: 500 })
    }

    // Create recipient records
    const recipientRecords = Array.from(uniqueRecipients.values()).map(recipient => ({
      broadcast_id: broadcast.id,
      phone_number: recipient.phoneNumber,
      contact_name: recipient.contactName || null,
      variables: recipient.variables || {},
      status: optedOutNumbers.has(recipient.phoneNumber) ? 'skipped' : 'pending',
      skip_reason: optedOutNumbers.has(recipient.phoneNumber) ? 'opted_out' : null
    }))

    const { error: recipientsError } = await supabase
      .from('sms_broadcast_recipients')
      .insert(recipientRecords)

    if (recipientsError) {
      smsLogger.error('Error creating broadcast recipients', { error: recipientsError })
      // Rollback broadcast
      await supabase.from('sms_broadcasts').delete().eq('id', broadcast.id)
      return NextResponse.json({ error: 'Failed to create broadcast recipients' }, { status: 500 })
    }

    // Update opted_out_skipped count
    const optedOutCount = recipientRecords.filter(r => r.status === 'skipped').length
    if (optedOutCount > 0) {
      await supabase
        .from('sms_broadcasts')
        .update({ opted_out_skipped: optedOutCount })
        .eq('id', broadcast.id)
    }

    return NextResponse.json({
      success: true,
      broadcast: {
        ...broadcast,
        opted_out_skipped: optedOutCount
      },
      stats: {
        totalRecipients: uniqueRecipients.size,
        validRecipients: uniqueRecipients.size - optedOutCount,
        optedOut: optedOutCount,
        duplicatesRemoved: recipients.length - uniqueRecipients.size,
        invalidNumbers
      },
      smsUsageWarning: broadcastCheck.reason
    }, { status: 201 })
  } catch (error) {
    smsLogger.error('Error in broadcasts POST', { error })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
