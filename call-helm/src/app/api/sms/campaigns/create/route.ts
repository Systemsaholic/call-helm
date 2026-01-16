import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { telnyxService, TelnyxService } from '@/lib/services/telnyx'

// Create a new SMS campaign for 10DLC compliance
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
      brandId,
      campaignName,
      useCase,
      useCaseDescription,
      messageSamples = [],
      optInKeywords = ['START', 'YES', 'JOIN'],
      optOutKeywords = ['STOP', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT'],
      helpKeywords = ['HELP', 'INFO'],
      helpMessage = 'Reply STOP to opt out, HELP for help',
      optInMessage,
      optOutMessage = 'You have been unsubscribed. No more messages will be sent.',
      monthlyMessageVolume = 1000,
      subscriberOptinFlow,
      subscriberOptinFlowDescription,
      ageGating = false,
      directLending = false,
      embeddedLink = false,
      embeddedPhone = false,
      affiliateMarketing = false
    } = await request.json()
    
    // Validate required fields
    if (!brandId || !campaignName || !useCase || !useCaseDescription || 
        !messageSamples.length || !subscriberOptinFlow || !subscriberOptinFlowDescription) {
      return NextResponse.json(
        { error: 'Missing required campaign information' },
        { status: 400 }
      )
    }

    // Validate message samples
    if (messageSamples.length < 1 || messageSamples.length > 5) {
      return NextResponse.json(
        { error: 'Please provide 1-5 message samples' },
        { status: 400 }
      )
    }

    // Check if Telnyx is configured
    if (!TelnyxService.isConfigured()) {
      return NextResponse.json(
        { error: 'SMS services not configured' },
        { status: 503 }
      )
    }

    // Verify brand exists and is approved
    const { data: brand } = await supabase
      .from('campaign_registry_brands')
      .select('id, brand_name, telnyx_brand_id, status')
      .eq('id', brandId)
      .eq('organization_id', member.organization_id)
      .single()

    if (!brand) {
      return NextResponse.json(
        { error: 'Brand not found or does not belong to your organization' },
        { status: 404 }
      )
    }

    if (brand.status !== 'approved') {
      return NextResponse.json(
        { error: `Brand must be approved before creating campaigns. Current status: ${brand.status}` },
        { status: 400 }
      )
    }

    if (!brand.telnyx_brand_id) {
      return NextResponse.json(
        { error: 'Brand is not properly registered with Telnyx Campaign Registry' },
        { status: 400 }
      )
    }

    // Check if campaign name already exists for this brand
    const { data: existingCampaign } = await supabase
      .from('campaign_registry_campaigns')
      .select('id, campaign_name')
      .eq('brand_id', brandId)
      .eq('campaign_name', campaignName)
      .single()

    if (existingCampaign) {
      return NextResponse.json(
        { error: `Campaign name "${campaignName}" already exists for this brand` },
        { status: 409 }
      )
    }

    // Store campaign in our database first
    const { data: dbCampaign, error: dbError } = await supabase
      .from('campaign_registry_campaigns')
      .insert({
        organization_id: member.organization_id,
        brand_id: brandId,
        campaign_name: campaignName,
        use_case: useCase,
        use_case_description: useCaseDescription,
        message_samples: messageSamples,
        opt_in_keywords: optInKeywords,
        opt_out_keywords: optOutKeywords,
        help_keywords: helpKeywords,
        help_message: helpMessage,
        opt_in_message: optInMessage,
        opt_out_message: optOutMessage,
        monthly_message_volume: monthlyMessageVolume,
        subscriber_optin_flow: subscriberOptinFlow,
        subscriber_optin_flow_description: subscriberOptinFlowDescription,
        age_gating: ageGating,
        direct_lending: directLending,
        embedded_link: embeddedLink,
        embedded_phone: embeddedPhone,
        affiliate_marketing: affiliateMarketing,
        status: 'pending',
        metadata: {
          created_by: user.id,
          created_at: new Date().toISOString()
        }
      })
      .select()
      .single()

    if (dbError) {
      console.error('Database error creating campaign:', dbError)
      return NextResponse.json(
        { error: 'Failed to create campaign record' },
        { status: 500 }
      )
    }

    // Submit to Telnyx Campaign Registry
    try {
      console.log(`Creating campaign "${campaignName}" in Telnyx Campaign Registry`)

      const telnyxCampaign = await telnyxService.createCampaign({
        brandId: brand.telnyx_brand_id,
        campaignName,
        useCase,
        useCaseDescription,
        messageSamples,
        optInKeywords,
        optOutKeywords,
        helpKeywords,
        helpMessage,
        optInMessage,
        optOutMessage,
        monthlyMessageVolume,
        subscriberOptinFlow,
        subscriberOptinFlowDescription,
        ageGating,
        directLending,
        embeddedLink,
        embeddedPhone,
        affiliateMarketing
      })

      // Update our database with Telnyx's campaign ID
      const { data: updatedCampaign, error: updateError } = await supabase
        .from('campaign_registry_campaigns')
        .update({
          telnyx_campaign_id: telnyxCampaign.id,
          status: telnyxCampaign.status,
          metadata: {
            ...dbCampaign.metadata,
            telnyx_submitted_at: new Date().toISOString(),
            telnyx_campaign_id: telnyxCampaign.id
          }
        })
        .eq('id', dbCampaign.id)
        .select()
        .single()

      if (updateError) {
        console.error('Error updating campaign with Telnyx ID:', updateError)
        // Don't fail the request since the campaign was created successfully
      }

      console.log(`Successfully created campaign "${campaignName}" with Telnyx ID: ${telnyxCampaign.id}`)

      return NextResponse.json({
        success: true,
        campaign: {
          id: updatedCampaign?.id || dbCampaign.id,
          campaignName: updatedCampaign?.campaign_name || dbCampaign.campaign_name,
          brandId: updatedCampaign?.brand_id || dbCampaign.brand_id,
          brandName: brand.brand_name,
          useCase: updatedCampaign?.use_case || dbCampaign.use_case,
          useCaseDescription: updatedCampaign?.use_case_description || dbCampaign.use_case_description,
          status: updatedCampaign?.status || telnyxCampaign.status,
          telnyxCampaignId: telnyxCampaign.id,
          monthlyMessageVolume: updatedCampaign?.monthly_message_volume || dbCampaign.monthly_message_volume,
          createdAt: updatedCampaign?.created_at || dbCampaign.created_at,
          estimatedApprovalTime: getEstimatedApprovalTime(useCase),
          nextSteps: [
            'Your campaign is being reviewed by the Campaign Registry',
            'Review time varies by use case and complexity',
            'You will receive an email notification when approved',
            'Once approved, you can assign phone numbers to this campaign'
          ]
        }
      })
    } catch (telnyxError) {
      console.error('Telnyx campaign creation error:', telnyxError)

      // Update our database to reflect the failure
      await supabase
        .from('campaign_registry_campaigns')
        .update({
          status: 'rejected',
          rejection_reason: telnyxError instanceof Error ? telnyxError.message : 'Unknown Telnyx error',
          metadata: {
            ...dbCampaign.metadata,
            telnyx_error_at: new Date().toISOString(),
            telnyx_error: telnyxError instanceof Error ? telnyxError.message : 'Unknown error'
          }
        })
        .eq('id', dbCampaign.id)

      return NextResponse.json(
        {
          error: 'Failed to submit campaign to Campaign Registry. Please check your information and try again.',
          details: telnyxError instanceof Error ? telnyxError.message : 'Unknown error'
        },
        { status: 422 }
      )
    }
  } catch (error) {
    console.error('Error creating SMS campaign:', error)
    return NextResponse.json(
      { error: 'Failed to create SMS campaign' },
      { status: 500 }
    )
  }
}

function getEstimatedApprovalTime(useCase: string): string {
  // Different use cases have different approval times
  const approvalTimes: { [key: string]: string } = {
    'customer_care': '1-3 business days',
    'account_notifications': '1-3 business days', 
    'delivery_notifications': '2-5 business days',
    'marketing': '5-10 business days',
    'mixed': '7-14 business days',
    'other': '7-14 business days'
  }
  
  return approvalTimes[useCase] || '5-10 business days'
}