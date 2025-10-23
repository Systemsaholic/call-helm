import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { signalwireService, SignalWireService } from '@/lib/services/signalwire'

// Get organization's SMS campaigns
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

    // Get organization's campaigns with brand info
    const { data: campaigns, error } = await supabase
      .from('campaign_registry_campaigns')
      .select(`
        *,
        brand:campaign_registry_brands!inner(
          id,
          brand_name,
          status
        )
      `)
      .eq('organization_id', member.organization_id)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Database error fetching campaigns:', error)
      return NextResponse.json(
        { error: 'Failed to fetch campaigns' },
        { status: 500 }
      )
    }

    // If SignalWire is configured, sync status for active campaigns
    if (SignalWireService.isConfigured() && campaigns) {
      const updatedCampaigns = []
      
      for (const campaign of campaigns) {
        let updatedCampaign = { ...campaign }
        
        // Only sync campaigns that have SignalWire IDs and are not in final states
        if (campaign.signalwire_campaign_id && 
            ['pending', 'submitted'].includes(campaign.status)) {
          try {
            const signalwireStatus = await signalwireService.getCampaignStatus(campaign.signalwire_campaign_id)
            
            // Update database if status has changed
            if (signalwireStatus.status !== campaign.status) {
              const updateData: any = {
                status: signalwireStatus.status,
                updated_at: new Date().toISOString()
              }

              if (signalwireStatus.approvalDate && !campaign.approval_date) {
                updateData.approval_date = signalwireStatus.approvalDate
              }

              if (signalwireStatus.rejectionReason) {
                updateData.rejection_reason = signalwireStatus.rejectionReason
              }

              await supabase
                .from('campaign_registry_campaigns')
                .update(updateData)
                .eq('id', campaign.id)

              updatedCampaign = { ...updatedCampaign, ...updateData }
            }
          } catch (syncError) {
            console.error(`Error syncing campaign ${campaign.id}:`, syncError)
            // Continue with other campaigns even if one fails
          }
        }
        
        updatedCampaigns.push(updatedCampaign)
      }
      
      campaigns.splice(0, campaigns.length, ...updatedCampaigns)
    }

    // Format response
    const formattedCampaigns = campaigns?.map(campaign => ({
      id: campaign.id,
      campaignName: campaign.campaign_name,
      brandId: campaign.brand_id,
      brandName: campaign.brand.brand_name,
      useCase: campaign.use_case,
      useCaseDescription: campaign.use_case_description,
      status: campaign.status,
      signalwireCampaignId: campaign.signalwire_campaign_id,
      approvalDate: campaign.approval_date,
      monthlyMessageVolume: campaign.monthly_message_volume,
      createdAt: campaign.created_at,
      estimatedApprovalTime: getEstimatedApprovalTime(campaign.use_case, campaign.status),
      nextSteps: getNextSteps(campaign.status)
    })) || []

    const summary = {
      total: formattedCampaigns.length,
      pending: formattedCampaigns.filter(c => c.status === 'pending').length,
      submitted: formattedCampaigns.filter(c => c.status === 'submitted').length,
      approved: formattedCampaigns.filter(c => c.status === 'approved').length,
      rejected: formattedCampaigns.filter(c => c.status === 'rejected').length,
      suspended: formattedCampaigns.filter(c => c.status === 'suspended').length
    }

    return NextResponse.json({
      success: true,
      campaigns: formattedCampaigns,
      summary
    })
  } catch (error) {
    console.error('Error getting SMS campaigns:', error)
    return NextResponse.json(
      { error: 'Failed to get SMS campaigns' },
      { status: 500 }
    )
  }
}

function getEstimatedApprovalTime(useCase: string, status: string): string {
  if (status === 'approved') return 'Approved'
  if (status === 'rejected') return 'Rejected'
  if (status === 'suspended') return 'Suspended'
  
  // Different use cases have different approval times
  const approvalTimes: { [key: string]: string } = {
    'customer_care': '1-3 business days',
    'account_notifications': '1-3 business days', 
    'delivery_notifications': '2-5 business days',
    'two_factor_auth': '1-2 business days',
    'alerts_notifications': '2-5 business days',
    'appointment_reminders': '2-5 business days',
    'surveys_polls': '5-7 business days',
    'marketing': '7-14 business days',
    'mixed': '7-14 business days',
    'other': '5-10 business days'
  }
  
  return approvalTimes[useCase] || '5-10 business days'
}

function getNextSteps(status: string): string[] {
  switch (status) {
    case 'pending':
      return [
        'Campaign information is being prepared for submission',
        'Wait for submission to Campaign Registry'
      ]
    case 'submitted':
      return [
        'Campaign is being reviewed by the Campaign Registry',
        'Review times vary by use case and complexity',
        'You will be notified when approved',
        'Ensure your brand remains in good standing'
      ]
    case 'approved':
      return [
        'Your campaign is approved and ready to use',
        'You can now assign phone numbers to this campaign',
        'Start sending messages within your approved use case'
      ]
    case 'rejected':
      return [
        'Review the rejection reason',
        'Correct any issues with your campaign information',
        'Submit a new campaign application'
      ]
    case 'suspended':
      return [
        'Contact support to understand suspension reason',
        'Take corrective action as advised',
        'Request reinstatement when ready'
      ]
    default:
      return []
  }
}