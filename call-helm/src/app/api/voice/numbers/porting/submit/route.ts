import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { telnyxService, TelnyxService } from '@/lib/services/telnyx'
import { voiceLogger } from '@/lib/logger'

// Submit a number porting request
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

    const {
      phoneNumber,
      currentProvider,
      accountNumber,
      pinCode,
      authorizedContactName,
      authorizedContactEmail,
      authorizedContactPhone,
      billingAddress,
      serviceAddress,
      requestedPortDate,
      loaDocumentUrl,
      supportingDocuments = []
    } = await request.json()
    
    // Validate required fields
    if (!phoneNumber || !currentProvider || !accountNumber || !pinCode ||
        !authorizedContactName || !authorizedContactEmail || !authorizedContactPhone ||
        !billingAddress) {
      return NextResponse.json(
        { error: 'Missing required porting information' },
        { status: 400 }
      )
    }

    // Validate billing address
    if (!billingAddress.street || !billingAddress.city || !billingAddress.state || 
        !billingAddress.zip || !billingAddress.country) {
      return NextResponse.json(
        { error: 'Complete billing address is required' },
        { status: 400 }
      )
    }

    // Check if Telnyx is configured
    if (!TelnyxService.isConfigured()) {
      return NextResponse.json(
        { error: 'Voice services not configured' },
        { status: 503 }
      )
    }

    // Check if number already exists in ANY organization (global uniqueness)
    const { data: existingNumber } = await supabase
      .from('phone_numbers')
      .select('id, organization_id, acquisition_method, porting_status')
      .eq('number', phoneNumber)
      .maybeSingle()

    if (existingNumber) {
      const isSameOrg = existingNumber.organization_id === member.organization_id

      if (!isSameOrg) {
        return NextResponse.json(
          { error: 'This phone number is already assigned to another organization' },
          { status: 409 }
        )
      }

      if (existingNumber.acquisition_method === 'ported') {
        return NextResponse.json(
          { error: 'This number has already been ported to your organization' },
          { status: 409 }
        )
      } else if (existingNumber.porting_status &&
                 ['pending', 'submitted', 'in_progress'].includes(existingNumber.porting_status)) {
        return NextResponse.json(
          { error: 'A porting request for this number is already in progress' },
          { status: 409 }
        )
      }
    }

    // Check for existing porting request
    const { data: existingRequest } = await supabase
      .from('number_porting_requests')
      .select('id, status')
      .eq('organization_id', member.organization_id)
      .eq('phone_number', phoneNumber)
      .in('status', ['pending', 'submitted', 'in_progress'])
      .single()

    if (existingRequest) {
      return NextResponse.json(
        { error: 'A porting request for this number is already in progress' },
        { status: 409 }
      )
    }

    // Store porting request in our database first
    const { data: portingRequest, error: dbError } = await supabase
      .from('number_porting_requests')
      .insert({
        organization_id: member.organization_id,
        phone_number: phoneNumber,
        current_provider: currentProvider,
        account_number: accountNumber,
        pin_code: pinCode,
        authorized_contact_name: authorizedContactName,
        authorized_contact_email: authorizedContactEmail,
        authorized_contact_phone: authorizedContactPhone,
        billing_address: billingAddress,
        service_address: serviceAddress,
        status: 'pending',
        requested_port_date: requestedPortDate,
        loa_document_url: loaDocumentUrl,
        supporting_documents: supportingDocuments,
        status_details: {
          submitted_at: new Date().toISOString(),
          submitted_by: user.id
        }
      })
      .select()
      .single()

    if (dbError) {
      voiceLogger.error('Database error creating porting request', { error: dbError })
      return NextResponse.json(
        { error: 'Failed to create porting request' },
        { status: 500 }
      )
    }

    // Submit to Telnyx (this is where the real porting happens)
    try {
      voiceLogger.info('Submitting porting request to Telnyx', { data: { phoneNumber } })

      const telnyxRequest = await telnyxService.createPortingOrder({
        phoneNumbers: [phoneNumber],
        loaConfiguration: {
          name: authorizedContactName,
          email: authorizedContactEmail,
          phoneNumber: authorizedContactPhone
        },
        endUser: {
          billingAddress,
          serviceAddress: serviceAddress || billingAddress
        },
        currentProvider,
        accountNumber,
        pinCode,
        requestedPortDate
      })

      // Update our database with Telnyx's porting request ID
      await supabase
        .from('number_porting_requests')
        .update({
          telnyx_porting_id: telnyxRequest.id,
          status: 'submitted',
          status_details: {
            ...portingRequest.status_details,
            telnyx_submitted_at: new Date().toISOString(),
            telnyx_request_id: telnyxRequest.id
          }
        })
        .eq('id', portingRequest.id)

      // Create placeholder phone number record if it doesn't exist
      if (!existingNumber) {
        await supabase
          .from('phone_numbers')
          .insert({
            organization_id: member.organization_id,
            number: phoneNumber,
            friendly_name: `Porting: ${phoneNumber}`,
            capabilities: {
              voice: true,
              sms: true,
              mms: false,
              fax: false
            },
            status: 'pending',
            provider: 'telnyx',
            acquisition_method: 'ported',
            verification_status: 'pending',
            porting_request_id: portingRequest.id,
            porting_status: 'submitted',
            webhook_configured: false,
            monthly_cost: 1.50, // Standard rate
            metadata: {
              porting_request_created_at: new Date().toISOString(),
              porting_requested_by: user.id
            }
          })
      } else {
        // Update existing record
        await supabase
          .from('phone_numbers')
          .update({
            acquisition_method: 'ported',
            porting_request_id: portingRequest.id,
            porting_status: 'submitted',
            status: 'pending',
            updated_at: new Date().toISOString()
          })
          .eq('id', existingNumber.id)
      }

      voiceLogger.info('Successfully submitted porting request', { data: { phoneNumber, telnyxPortingId: telnyxRequest.id } })

      return NextResponse.json({
        success: true,
        portingRequest: {
          id: portingRequest.id,
          phoneNumber: portingRequest.phone_number,
          status: 'submitted',
          telnyxPortingId: telnyxRequest.id,
          requestedPortDate: portingRequest.requested_port_date,
          estimatedCompletionTime: '7-10 business days',
          nextSteps: [
            'Telnyx will review your porting request',
            'You may be contacted if additional information is needed',
            'You will receive notifications as the porting progresses',
            'The number will be automatically configured once porting completes'
          ]
        }
      })
    } catch (telnyxError) {
      voiceLogger.error('Telnyx porting submission error', { error: telnyxError })
      
      // Update our database to reflect the failure
      await supabase
        .from('number_porting_requests')
        .update({
          status: 'failed',
          rejection_reason: telnyxError instanceof Error ? telnyxError.message : 'Unknown Telnyx error',
          status_details: {
            ...portingRequest.status_details,
            telnyx_error_at: new Date().toISOString(),
            telnyx_error: telnyxError instanceof Error ? telnyxError.message : 'Unknown error'
          }
        })
        .eq('id', portingRequest.id)

      return NextResponse.json(
        {
          error: 'Failed to submit porting request to carrier. Please check your information and try again.',
          details: telnyxError instanceof Error ? telnyxError.message : 'Unknown error'
        },
        { status: 422 }
      )
    }
  } catch (error) {
    voiceLogger.error('Error submitting porting request', { error })
    return NextResponse.json(
      { error: 'Failed to submit porting request' },
      { status: 500 }
    )
  }
}