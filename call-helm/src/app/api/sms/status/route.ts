import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// SignalWire SMS status webhook handler
export async function POST(request: NextRequest) {
  try {
    console.log('=== SMS STATUS WEBHOOK ===')
    
    // Parse form-encoded data from SignalWire
    const formData = await request.formData()
    const data: any = {}
    formData.forEach((value, key) => {
      data[key] = value
    })
    
    console.log('SMS Status Update:', {
      messageSid: data.MessageSid,
      messageStatus: data.MessageStatus,
      to: data.To,
      from: data.From,
      errorCode: data.ErrorCode,
      errorMessage: data.ErrorMessage
    })
    
    const messageSid = data.MessageSid
    const messageStatus = data.MessageStatus
    const errorCode = data.ErrorCode
    const errorMessage = data.ErrorMessage
    
    if (!messageSid || !messageStatus) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }
    
    // Use service role client to bypass RLS
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    
    // Map SignalWire status to our status
    let mappedStatus = messageStatus.toLowerCase()
    if (mappedStatus === 'sent') {
      mappedStatus = 'sent'
    } else if (mappedStatus === 'delivered') {
      mappedStatus = 'delivered'
    } else if (mappedStatus === 'undelivered' || mappedStatus === 'failed') {
      mappedStatus = 'failed'
    } else if (mappedStatus === 'queued' || mappedStatus === 'accepted') {
      mappedStatus = 'queued'
    } else if (mappedStatus === 'sending') {
      mappedStatus = 'sending'
    }
    
    // Update message status in database
    const updateData: any = {
      status: mappedStatus,
      updated_at: new Date().toISOString()
    }
    
    if (mappedStatus === 'delivered') {
      updateData.delivered_at = new Date().toISOString()
    }
    
    if (errorCode || errorMessage) {
      updateData.error_message = `Error ${errorCode}: ${errorMessage}`
    }
    
    const { error: updateError } = await supabase
      .from('sms_messages')
      .update(updateData)
      .eq('signalwire_message_sid', messageSid)
    
    if (updateError) {
      console.error('Error updating message status:', updateError)
      return NextResponse.json({ error: 'Failed to update status' }, { status: 500 })
    }
    
    console.log(`SMS ${messageSid} status updated to ${mappedStatus}`)
    
    // Return empty response for SignalWire (they expect 204 No Content)
    return new Response(null, { status: 204 })
    
  } catch (error) {
    console.error('SMS status webhook error:', error)
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

// SignalWire may send HEAD requests to verify webhook
export async function HEAD() {
  return new Response(null, { status: 200 })
}

// SignalWire may send GET requests to verify webhook
export async function GET() {
  return NextResponse.json({ 
    status: 'ok',
    message: 'SMS status webhook endpoint' 
  })
}