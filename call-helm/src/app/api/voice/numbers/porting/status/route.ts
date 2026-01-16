import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { telnyxService, TelnyxService } from '@/lib/services/telnyx'

// Get porting request status for organization
export async function GET(request: NextRequest) {
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
      .select('organization_id')
      .eq('user_id', user.id)
      .single()

    if (!member) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
    }

    const { searchParams } = new URL(request.url)
    const portingRequestId = searchParams.get('id')
    const phoneNumber = searchParams.get('number')

    let query = supabase
      .from('number_porting_requests')
      .select('*')
      .eq('organization_id', member.organization_id)

    if (portingRequestId) {
      query = query.eq('id', portingRequestId)
    } else if (phoneNumber) {
      query = query.eq('phone_number', phoneNumber)
    }

    const { data: portingRequests, error } = await query.order('created_at', { ascending: false })

    if (error) {
      console.error('Database error fetching porting requests:', error)
      return NextResponse.json(
        { error: 'Failed to fetch porting requests' },
        { status: 500 }
      )
    }

    if (!portingRequests || portingRequests.length === 0) {
      return NextResponse.json(
        { error: 'No porting requests found' },
        { status: 404 }
      )
    }

    // If Telnyx is configured, sync status for active requests
    if (TelnyxService.isConfigured()) {
      const updatedRequests = []

      for (const request of portingRequests) {
        let updatedRequest = { ...request }

        // Only sync active requests that have Telnyx IDs
        if (request.telnyx_porting_id &&
            ['submitted', 'in_progress'].includes(request.status)) {
          try {
            const telnyxStatus = await telnyxService.getPortingOrderStatus(request.telnyx_porting_id)

            // Update database if status has changed
            if (telnyxStatus.status !== request.status ||
                JSON.stringify(telnyxStatus.statusDetails) !== JSON.stringify(request.status_details)) {

              const updateData: Record<string, unknown> = {
                status: telnyxStatus.status,
                status_details: {
                  ...request.status_details,
                  telnyx_status: telnyxStatus.statusDetails,
                  last_sync_at: new Date().toISOString()
                },
                updated_at: new Date().toISOString()
              }

              if (telnyxStatus.actualPortDate && !request.actual_port_date) {
                updateData.actual_port_date = telnyxStatus.actualPortDate
              }

              if (telnyxStatus.rejectionReason) {
                updateData.rejection_reason = telnyxStatus.rejectionReason
              }

              await supabase
                .from('number_porting_requests')
                .update(updateData)
                .eq('id', request.id)

              updatedRequest = { ...updatedRequest, ...updateData }

              // If porting is completed, update the phone number
              if (telnyxStatus.status === 'completed') {
                await supabase
                  .from('phone_numbers')
                  .update({
                    status: 'active',
                    porting_status: 'completed',
                    porting_date: telnyxStatus.actualPortDate || new Date().toISOString(),
                    verification_status: 'verified',
                    updated_at: new Date().toISOString()
                  })
                  .eq('porting_request_id', request.id)
              }
            }
          } catch (syncError) {
            console.error(`Error syncing porting request ${request.id}:`, syncError)
            // Continue with other requests even if one fails
          }
        }

        updatedRequests.push(updatedRequest)
      }

      portingRequests.splice(0, portingRequests.length, ...updatedRequests)
    }

    // Format response
    const formattedRequests = portingRequests.map(request => ({
      id: request.id,
      phoneNumber: request.phone_number,
      currentProvider: request.current_provider,
      authorizedContactName: request.authorized_contact_name,
      authorizedContactEmail: request.authorized_contact_email,
      authorizedContactPhone: request.authorized_contact_phone,
      status: request.status,
      statusDetails: request.status_details,
      requestedPortDate: request.requested_port_date,
      actualPortDate: request.actual_port_date,
      rejectionReason: request.rejection_reason,
      telnyxPortingId: request.telnyx_porting_id,
      createdAt: request.created_at,
      updatedAt: request.updated_at,
      estimatedCompletion: getEstimatedCompletion(request.status, request.created_at),
      nextSteps: getNextSteps(request.status)
    }))

    // Return single request if ID was specified, otherwise return array
    if (portingRequestId || phoneNumber) {
      return NextResponse.json({
        success: true,
        portingRequest: formattedRequests[0]
      })
    }

    return NextResponse.json({
      success: true,
      portingRequests: formattedRequests,
      summary: {
        total: formattedRequests.length,
        pending: formattedRequests.filter(r => r.status === 'pending').length,
        submitted: formattedRequests.filter(r => r.status === 'submitted').length,
        inProgress: formattedRequests.filter(r => r.status === 'in_progress').length,
        completed: formattedRequests.filter(r => r.status === 'completed').length,
        failed: formattedRequests.filter(r => r.status === 'failed').length,
        cancelled: formattedRequests.filter(r => r.status === 'cancelled').length
      }
    })
  } catch (error) {
    console.error('Error getting porting status:', error)
    return NextResponse.json(
      { error: 'Failed to get porting request status' },
      { status: 500 }
    )
  }
}

function getEstimatedCompletion(status: string, createdAt: string): string {
  const created = new Date(createdAt)
  const now = new Date()
  const daysSinceCreated = Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24))
  
  switch (status) {
    case 'pending':
      return '7-10 business days from submission'
    case 'submitted':
      return `${Math.max(1, 7 - daysSinceCreated)}-${Math.max(1, 10 - daysSinceCreated)} business days remaining`
    case 'in_progress':
      return `${Math.max(1, 3 - daysSinceCreated)}-${Math.max(1, 5 - daysSinceCreated)} business days remaining`
    case 'completed':
      return 'Completed'
    case 'failed':
      return 'Failed'
    case 'cancelled':
      return 'Cancelled'
    default:
      return 'Unknown'
  }
}

function getNextSteps(status: string): string[] {
  switch (status) {
    case 'pending':
      return [
        'Waiting for submission to carrier',
        'Ensure all required documents are uploaded',
        'Be ready to respond to any carrier requests for additional information'
      ]
    case 'submitted':
      return [
        'Carrier is reviewing your porting request',
        'You may be contacted if additional information is needed',
        'Monitor your email for updates from the carrier'
      ]
    case 'in_progress':
      return [
        'Porting is actively in progress',
        'Your number will be transferred soon',
        'Webhooks will be automatically configured once complete'
      ]
    case 'completed':
      return [
        'Your number has been successfully ported',
        'The number is now active and ready to use',
        'Test voice and SMS functionality'
      ]
    case 'failed':
      return [
        'Review the rejection reason',
        'Correct any issues with your information',
        'Submit a new porting request if needed'
      ]
    case 'cancelled':
      return [
        'The porting request has been cancelled',
        'You can submit a new request if needed'
      ]
    default:
      return []
  }
}