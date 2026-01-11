import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { signalwireService } from '@/lib/services/signalwire'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    
    // Check authentication
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get request body
    const { areaCode, region, contains, locality, country = 'US', city } = await request.json()
    
    if (!areaCode && !region && !contains && !locality && !city) {
      return NextResponse.json(
        { error: 'Please provide search criteria (area code, region, or city)' },
        { status: 400 }
      )
    }

    // Check if SignalWire is configured
    if (!process.env.SIGNALWIRE_PROJECT_ID || !process.env.SIGNALWIRE_API_TOKEN) {
      return NextResponse.json(
        { error: 'Voice services not configured' },
        { status: 503 }
      )
    }

    let numbers: any[] = []
    let searchMethod = 'region' // Track how we searched

    // If city is provided, look up area codes first
    if (city && region && !areaCode) {
      // Map province codes to full names for Canadian provinces
      let stateProvince = region
      if (country === 'CA') {
        const provinceMap: { [key: string]: string } = {
          'AB': 'Alberta',
          'BC': 'British Columbia',
          'MB': 'Manitoba',
          'NB': 'New Brunswick',
          'NL': 'Newfoundland and Labrador',
          'NS': 'Nova Scotia',
          'NT': 'Northwest Territories',
          'NU': 'Nunavut',
          'ON': 'Ontario',
          'PE': 'Prince Edward Island',
          'QC': 'Québec',
          'SK': 'Saskatchewan',
          'YT': 'Yukon Territory'
        }
        stateProvince = provinceMap[region] || region
      }
      
      console.log(`Searching for area codes for ${city}, ${stateProvince}, ${country}`)
      
      // Look up area codes for the city
      const { data: areaCodes, error: areaCodeError } = await supabase
        .rpc('get_area_codes_for_city', {
          p_city: city,
          p_state_province: stateProvince,
          p_country_code: country
        })

      if (!areaCodeError && areaCodes && areaCodes.length > 0) {
        console.log(`Found area codes for ${city}: ${areaCodes.map((ac: any) => ac.area_code).join(', ')}`)
        searchMethod = 'city'
        
        // Search for numbers in each area code (limit results per area code)
        const numbersPerAreaCode = Math.ceil((locality || 100) / areaCodes.length)
        const searchPromises = areaCodes.map((ac: any) => 
          signalwireService.searchAvailableNumbers({
            areaCode: ac.area_code,
            country,
            contains,
            limit: numbersPerAreaCode
          })
        )

        const results = await Promise.all(searchPromises)
        numbers = results.flat()
        
        // Add metadata about which area code each number came from
        numbers = numbers.map((num, idx) => ({
          ...num,
          searchMethod: 'city',
          searchedCity: city
        }))
      } else {
        // No area codes found for city, log it and fall back to region search
        console.log(`No area codes found for ${city}, falling back to region search`)
        
        // Log the miss for monitoring
        await supabase.rpc('log_area_code_search_miss', {
          p_city: city,
          p_state_province: stateProvince,
          p_country_code: country
        })
        
        // Fall back to region search
        numbers = await signalwireService.searchAvailableNumbers({
          region,
          contains,
          locality,
          country
        })
        searchMethod = 'region-fallback'
      }
    } else {
      // Regular search by area code or region
      numbers = await signalwireService.searchAvailableNumbers({
        areaCode,
        region,
        contains,
        locality,
        country
      })
    }

    // Limit results to 100 to show more options (SignalWire can return up to 200)
    const limitedNumbers = numbers.slice(0, 100)

    // Enhance results with additional metadata for self-service
    const enhancedNumbers = limitedNumbers.map((number: any) => ({
      ...number,
      estimatedMonthlyCost: 1.50, // Standard SignalWire pricing
      estimatedSetupCost: 0.00,
      available: true,
      capabilities: {
        voice: true,
        sms: true,
        mms: false // Most numbers support MMS but we'll be conservative
      }
    }))

    return NextResponse.json({ 
      success: true,
      numbers: enhancedNumbers,
      total: numbers.length,
      searchMethod,
      searchedCity: city || null,
      pricing: {
        monthlyRate: 1.50,
        setupFee: 0.00,
        currency: 'USD',
        note: 'Prices may vary by number type and region'
      }
    })
  } catch (error) {
    console.error('Error searching phone numbers:', error)
    return NextResponse.json(
      { error: 'Failed to search available numbers' },
      { status: 500 }
    )
  }
}