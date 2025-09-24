import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(request: NextRequest) {
  try {
    // Use service role client for webhook - no RLS restrictions
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Get status update from SignalWire
    const formData = await request.formData()
    const callSid = formData.get("CallSid") as string
    const callStatus = formData.get("CallStatus") as string
    const from = formData.get("From") as string
    const to = formData.get("To") as string
    const duration = formData.get("CallDuration") as string

    console.log("=== SIGNALWIRE STATUS WEBHOOK ===")
    console.log("Call status update:", {
      callSid,
      callStatus,
      from,
      to,
      duration
    })

    // Find the phone number record to get organization (properly parameterized)
    // Validate phone numbers first
    const sanitizedFrom = String(from || '').slice(0, 50) // Limit length
    const sanitizedTo = String(to || '').slice(0, 50) // Limit length
    
    console.log("Looking for phone numbers:", { sanitizedFrom, sanitizedTo })
    
    // First try to find by exact match
    const { data: phoneNumbers, error: phoneError } = await supabase
      .from("phone_numbers")
      .select("organization_id, number")
      .in("number", [sanitizedFrom, sanitizedTo])
      
    console.log("Phone number lookup result:", { phoneNumbers, phoneError, count: phoneNumbers?.length })
    
    // Take the first match (prefer From number if both exist)
    const phoneNumber = phoneNumbers?.find(p => p.number === sanitizedFrom) || phoneNumbers?.[0]

    if (phoneNumber && callSid && callStatus) {
      console.log("Found phone number org:", phoneNumber.organization_id)
      
      // Map SignalWire status to our database enum values
      const statusMap: Record<string, string> = {
        'initiated': 'answered', // Use 'answered' as placeholder in enum
        'ringing': 'answered',
        'answered': 'answered',
        'in-progress': 'answered',
        'completed': 'answered',
        'busy': 'busy',
        'no-answer': 'missed',
        'failed': 'failed',
        'canceled': 'failed'
      }

      const dbStatus = statusMap[callStatus] || 'failed'

      // First try to find by external_id (agent leg)
      let { data: existingCall, error: findError } = await supabase
        .from("calls")
        .select("id, metadata, caller_number, called_number")
        .eq("metadata->>external_id", callSid)
        .eq("organization_id", phoneNumber.organization_id)
        .single()
      
      // If not found, try to find by phone numbers (contact leg)
      if (!existingCall && (from?.includes('+1613800') || to?.includes('+1613800'))) {
        const { data: callByNumbers } = await supabase
          .from("calls")
          .select("id, metadata, caller_number, called_number")
          .eq("organization_id", phoneNumber.organization_id)
          .or(`caller_number.eq.${sanitizedFrom},called_number.eq.${sanitizedTo}`)
          .order('created_at', { ascending: false })
          .limit(1)
          .single()
        
        existingCall = callByNumbers
        console.log("Found call by phone numbers for contact leg:", existingCall?.id)
      }

      console.log("Found existing call:", existingCall?.id, "Error:", findError)

      if (existingCall) {
        // Define status progression order (lower index = earlier in flow)
        const statusOrder = [
          'initiated',
          'ringing', 
          'answered',
          'in-progress',
          'contact-connected',
          'completed',
          'busy',
          'no-answer',
          'failed',
          'canceled'
        ]
        
        // Check if this would be a backwards status update
        const currentStatus = existingCall.metadata?.call_status
        const currentIndex = statusOrder.indexOf(currentStatus)
        const newIndex = statusOrder.indexOf(callStatus)
        
        // Don't allow going backwards from completed/failed/canceled states
        const terminalStatuses = ['completed', 'failed', 'canceled', 'busy', 'no-answer']
        if (currentStatus && terminalStatuses.includes(currentStatus)) {
          console.log(`Ignoring status regression: ${currentStatus} -> ${callStatus}`)
          return NextResponse.json({ received: true, ignored: true })
        }
        
        // Don't allow going backwards in general (except for contact-connected which is special)
        if (currentIndex >= 0 && newIndex >= 0 && newIndex < currentIndex && callStatus !== 'contact-connected') {
          console.log(`Ignoring backwards status update: ${currentStatus} (${currentIndex}) -> ${callStatus} (${newIndex})`)
          return NextResponse.json({ received: true, ignored: true })
        }
        
        const updatedMetadata = {
          ...existingCall.metadata,
          call_status: callStatus,
          webhook_updated_at: new Date().toISOString()
        }
        
        // If this is a different call SID but same phone numbers, it's the contact leg
        if (existingCall.metadata?.external_id !== callSid) {
          console.log("Detected contact leg:", callSid, "for main call:", existingCall.metadata?.external_id)
          updatedMetadata.contact_call_sid = callSid
          
          // If contact answers, update status to show both parties connected
          if (callStatus === 'answered' || callStatus === 'in-progress') {
            updatedMetadata.call_status = 'contact-connected'
            updatedMetadata.contact_answered_at = new Date().toISOString()
          }
        }
        
        // Prepare update data
        const updateData: any = {
          status: dbStatus,
          metadata: updatedMetadata,
          updated_at: new Date().toISOString(),
          webhook_last_received_at: new Date().toISOString() // Track webhook receipt
        }

        // Add end_time and duration for completed calls
        if (callStatus === "completed" && duration) {
          const secs = Number.parseInt(duration, 10)
          if (!Number.isNaN(secs)) {
            updateData.duration = secs
            updateData.end_time = new Date().toISOString()
          }
        }

        // Update call record
        const { data: updateResult, error: updateError } = await supabase
          .from("calls")
          .update(updateData)
          .eq("id", existingCall.id)
          .select()
        
        if (updateError) {
          console.error('Error updating call record:', updateError)
        } else {
          console.log('Updated call record with status:', callStatus, 'Result:', updateResult?.[0]?.id)
        }
      } else {
        console.log("Call record not found for SID:", callSid)
      }
    } else {
      console.log("Missing required data - phoneNumber:", !!phoneNumber, "callSid:", !!callSid, "callStatus:", !!callStatus)
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error('Error handling call status:', error)
    return NextResponse.json({ error: 'Status update failed' }, { status: 500 })
  }
}