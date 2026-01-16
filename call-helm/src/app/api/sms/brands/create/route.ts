import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { signalwireService, SignalWireService } from '@/lib/services/signalwire'
import { encryptEIN, isEncryptionConfigured } from '@/lib/security/encryption'

// Create a new SMS brand for 10DLC compliance
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
      brandName,
      legalCompanyName,
      einTaxId,
      businessType,
      industry,
      websiteUrl,
      address,
      phoneNumber,
      email
    } = await request.json()
    
    // Validate required fields
    if (!brandName || !legalCompanyName || !einTaxId || !businessType || 
        !industry || !address || !phoneNumber || !email) {
      return NextResponse.json(
        { error: 'Missing required brand information' },
        { status: 400 }
      )
    }

    // Validate address
    if (!address.street || !address.city || !address.state || 
        !address.zip || !address.country) {
      return NextResponse.json(
        { error: 'Complete address is required' },
        { status: 400 }
      )
    }

    // Check if SignalWire is configured
    if (!SignalWireService.isConfigured()) {
      return NextResponse.json(
        { error: 'SMS services not configured' },
        { status: 503 }
      )
    }

    // Check if brand name already exists for this organization
    const { data: existingBrand } = await supabase
      .from('campaign_registry_brands')
      .select('id, brand_name')
      .eq('organization_id', member.organization_id)
      .eq('brand_name', brandName)
      .single()

    if (existingBrand) {
      return NextResponse.json(
        { error: `Brand name "${brandName}" already exists for your organization` },
        { status: 409 }
      )
    }

    // Encrypt the EIN before storing
    let storedEIN: string = einTaxId
    let einIsEncrypted = false

    if (isEncryptionConfigured()) {
      const encryptedEIN = encryptEIN(einTaxId)
      if (encryptedEIN) {
        storedEIN = encryptedEIN
        einIsEncrypted = true
      }
    } else {
      console.warn('DATA_ENCRYPTION_KEY not configured - EIN will be stored unencrypted')
    }

    // Store brand in our database first
    const { data: dbBrand, error: dbError } = await supabase
      .from('campaign_registry_brands')
      .insert({
        organization_id: member.organization_id,
        brand_name: brandName,
        legal_company_name: legalCompanyName,
        ein_tax_id: storedEIN,
        ein_encrypted: einIsEncrypted,
        business_type: businessType,
        industry,
        website_url: websiteUrl,
        address,
        phone_number: phoneNumber,
        email,
        status: 'pending',
        metadata: {
          created_by: user.id,
          created_at: new Date().toISOString()
        }
      })
      .select()
      .single()

    if (dbError) {
      console.error('Database error creating brand:', dbError)
      return NextResponse.json(
        { error: 'Failed to create brand record' },
        { status: 500 }
      )
    }

    // Submit to SignalWire Campaign Registry
    try {
      console.log(`Creating brand "${brandName}" in SignalWire Campaign Registry`)
      
      const signalwireBrand = await signalwireService.createBrand({
        brandName,
        legalCompanyName,
        einTaxId,
        businessType,
        industry,
        websiteUrl,
        address,
        phoneNumber,
        email
      })

      // Update our database with SignalWire's brand ID
      const { data: updatedBrand, error: updateError } = await supabase
        .from('campaign_registry_brands')
        .update({
          signalwire_brand_id: signalwireBrand.id,
          status: signalwireBrand.status,
          metadata: {
            ...dbBrand.metadata,
            signalwire_submitted_at: new Date().toISOString(),
            signalwire_brand_id: signalwireBrand.id
          }
        })
        .eq('id', dbBrand.id)
        .select()
        .single()

      if (updateError) {
        console.error('Error updating brand with SignalWire ID:', updateError)
        // Don't fail the request since the brand was created successfully
      }

      console.log(`Successfully created brand "${brandName}" with SignalWire ID: ${signalwireBrand.id}`)

      return NextResponse.json({
        success: true,
        brand: {
          id: updatedBrand?.id || dbBrand.id,
          brandName: updatedBrand?.brand_name || dbBrand.brand_name,
          legalCompanyName: updatedBrand?.legal_company_name || dbBrand.legal_company_name,
          businessType: updatedBrand?.business_type || dbBrand.business_type,
          industry: updatedBrand?.industry || dbBrand.industry,
          status: updatedBrand?.status || signalwireBrand.status,
          signalwireBrandId: signalwireBrand.id,
          createdAt: updatedBrand?.created_at || dbBrand.created_at,
          estimatedApprovalTime: '3-5 business days',
          nextSteps: [
            'Your brand is being reviewed by the Campaign Registry',
            'You will receive an email notification when approved',
            'Once approved, you can create SMS campaigns',
            'Monitor the status in your SMS settings'
          ]
        }
      })
    } catch (signalwireError) {
      console.error('SignalWire brand creation error:', signalwireError)
      
      // Update our database to reflect the failure
      await supabase
        .from('campaign_registry_brands')
        .update({
          status: 'rejected',
          rejection_reason: signalwireError instanceof Error ? signalwireError.message : 'Unknown SignalWire error',
          metadata: {
            ...dbBrand.metadata,
            signalwire_error_at: new Date().toISOString(),
            signalwire_error: signalwireError instanceof Error ? signalwireError.message : 'Unknown error'
          }
        })
        .eq('id', dbBrand.id)

      return NextResponse.json(
        { 
          error: 'Failed to submit brand to Campaign Registry. Please check your information and try again.',
          details: signalwireError instanceof Error ? signalwireError.message : 'Unknown error'
        },
        { status: 422 }
      )
    }
  } catch (error) {
    console.error('Error creating SMS brand:', error)
    return NextResponse.json(
      { error: 'Failed to create SMS brand' },
      { status: 500 }
    )
  }
}