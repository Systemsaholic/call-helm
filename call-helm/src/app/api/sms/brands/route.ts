import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { telnyxService, TelnyxService } from '@/lib/services/telnyx'
import { maskEIN } from '@/lib/security/encryption'
import { smsLogger } from '@/lib/logger'

interface DatabaseBrand {
  id: string
  brand_name: string
  legal_company_name: string
  business_type: string
  industry: string
  status: 'pending' | 'submitted' | 'approved' | 'rejected' | 'suspended'
  telnyx_brand_id?: string
  approval_date?: string
  campaign_count: number
  created_at: string
  ein_tax_id?: string
  ein_encrypted?: boolean
}

interface FormattedBrand {
  id: string
  brandName: string
  legalCompanyName: string
  businessType: string
  industry: string
  status: string
  telnyxBrandId?: string
  approvalDate?: string
  campaignCount: number
  createdAt: string
  canCreateCampaigns: boolean
  statusDisplay: string
  nextSteps: string[]
  maskedEin?: string
}

// Get organization's SMS brands
export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    
    // Check authentication
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user's organization and role
    const { data: member } = await supabase
      .from('organization_members')
      .select('organization_id, role')
      .eq('user_id', user.id)
      .single()

    if (!member) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
    }

    const isAdmin = ['org_admin', 'super_admin'].includes(member.role)

    // Get organization's brands with campaign count
    const { data: brands, error } = await supabase
      .rpc('get_organization_brands', { p_org_id: member.organization_id })

    if (error) {
      smsLogger.error('Database error fetching brands', { error })
      return NextResponse.json(
        { error: 'Failed to fetch brands' },
        { status: 500 }
      )
    }

    // If Telnyx is configured, sync status for active brands
    if (TelnyxService.isConfigured() && brands) {
      const updatedBrands = []

      for (const brand of brands) {
        let updatedBrand = { ...brand }

        // Only sync brands that have Telnyx IDs and are not in final states
        if (brand.telnyx_brand_id &&
            ['pending', 'submitted'].includes(brand.status)) {
          try {
            const telnyxStatus = await telnyxService.getBrandStatus(brand.telnyx_brand_id)

            // Update database if status has changed
            if (telnyxStatus.status !== brand.status) {
              const updateData: Record<string, unknown> = {
                status: telnyxStatus.status,
                updated_at: new Date().toISOString()
              }

              if (telnyxStatus.approvalDate && !brand.approval_date) {
                updateData.approval_date = telnyxStatus.approvalDate
              }

              if (telnyxStatus.rejectionReason) {
                updateData.rejection_reason = telnyxStatus.rejectionReason
              }

              await supabase
                .from('campaign_registry_brands')
                .update(updateData)
                .eq('id', brand.id)

              updatedBrand = { ...updatedBrand, ...updateData }
            }
          } catch (syncError) {
            smsLogger.error('Error syncing brand', { data: { brandId: brand.id }, error: syncError })
            // Continue with other brands even if one fails
          }
        }

        updatedBrands.push(updatedBrand)
      }

      brands.splice(0, brands.length, ...updatedBrands)
    }

    // Format response
    const formattedBrands: FormattedBrand[] = brands?.map((brand: DatabaseBrand) => {
      const formattedBrand: FormattedBrand = {
        id: brand.id,
        brandName: brand.brand_name,
        legalCompanyName: brand.legal_company_name,
        businessType: brand.business_type,
        industry: brand.industry,
        status: brand.status,
        telnyxBrandId: brand.telnyx_brand_id,
        approvalDate: brand.approval_date,
        campaignCount: brand.campaign_count,
        createdAt: brand.created_at,
        canCreateCampaigns: brand.status === 'approved',
        statusDisplay: getStatusDisplay(brand.status),
        nextSteps: getNextSteps(brand.status)
      }

      // Include masked EIN for admin users only
      if (isAdmin && brand.ein_tax_id) {
        formattedBrand.maskedEin = maskEIN(brand.ein_tax_id, brand.ein_encrypted || false)
      }

      return formattedBrand
    }) || []

    const summary = {
      total: formattedBrands.length,
      pending: formattedBrands.filter((b) => b.status === 'pending').length,
      submitted: formattedBrands.filter((b) => b.status === 'submitted').length,
      approved: formattedBrands.filter((b) => b.status === 'approved').length,
      rejected: formattedBrands.filter((b) => b.status === 'rejected').length,
      suspended: formattedBrands.filter((b) => b.status === 'suspended').length
    }

    return NextResponse.json({
      success: true,
      brands: formattedBrands,
      summary
    })
  } catch (error) {
    smsLogger.error('Error getting SMS brands', { error })
    return NextResponse.json(
      { error: 'Failed to get SMS brands' },
      { status: 500 }
    )
  }
}

function getStatusDisplay(status: string): string {
  switch (status) {
    case 'pending':
      return 'Pending Submission'
    case 'submitted':
      return 'Under Review'
    case 'approved':
      return 'Approved'
    case 'rejected':
      return 'Rejected'
    case 'suspended':
      return 'Suspended'
    default:
      return 'Unknown'
  }
}

function getNextSteps(status: string): string[] {
  switch (status) {
    case 'pending':
      return [
        'Brand information is being prepared for submission',
        'Wait for submission to Campaign Registry'
      ]
    case 'submitted':
      return [
        'Brand is being reviewed by the Campaign Registry',
        'Review typically takes 3-5 business days',
        'You will be notified when approved'
      ]
    case 'approved':
      return [
        'Your brand is approved and ready to use',
        'You can now create SMS campaigns',
        'Assign phone numbers to campaigns'
      ]
    case 'rejected':
      return [
        'Review the rejection reason',
        'Correct any issues with your brand information',
        'Submit a new brand application'
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