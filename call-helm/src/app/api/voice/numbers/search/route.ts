import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { telnyxService } from '@/lib/services/telnyx'

// Canadian area codes for auto-detection
const CANADIAN_AREA_CODES = new Set([
  '204', '226', '236', '249', '250', '263', '289', '306', '343', '354', '365', '367',
  '382', '403', '416', '418', '428', '431', '437', '438', '450', '460', '468', '474',
  '506', '514', '519', '548', '579', '581', '584', '587', '604', '613', '639', '647',
  '672', '683', '705', '709', '742', '753', '778', '780', '782', '807', '819', '825',
  '867', '873', '879', '902', '905'
])

function detectCountryFromAreaCode(areaCode: string): string {
  return CANADIAN_AREA_CODES.has(areaCode) ? 'CA' : 'US'
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()

    // Check authentication
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get request body
    let { areaCode, region, contains, locality, country, city } = await request.json()

    // Auto-detect country from area code if not specified
    if (areaCode && !country) {
      country = detectCountryFromAreaCode(areaCode)
      console.log(`Auto-detected country ${country} for area code ${areaCode}`)
    }
    country = country || 'US'
    
    if (!areaCode && !region && !contains && !locality && !city) {
      return NextResponse.json(
        { error: 'Please provide search criteria (area code, region, or city)' },
        { status: 400 }
      )
    }

    // Check if Telnyx is configured
    if (!process.env.TELNYX_API_KEY) {
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
          telnyxService.searchAvailableNumbers({
            areaCode: ac.area_code,
            countryCode: country,
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
        numbers = await telnyxService.searchAvailableNumbers({
          administrativeArea: region,
          contains,
          locality,
          countryCode: country
        })
        searchMethod = 'region-fallback'
      }
    } else {
      // Regular search by area code or region
      numbers = await telnyxService.searchAvailableNumbers({
        areaCode,
        administrativeArea: region,
        contains,
        locality,
        countryCode: country
      })
    }

    // Limit results to 100 to show more options
    const limitedNumbers = numbers.slice(0, 100)

    // Enhance results with additional metadata for self-service
    const enhancedNumbers = limitedNumbers.map((number: any) => ({
      ...number,
      estimatedMonthlyCost: number.monthlyPrice || 1.50,
      estimatedSetupCost: number.upfrontPrice || 0.00,
      available: true,
      capabilities: {
        voice: number.features?.includes('voice') ?? true,
        sms: number.features?.includes('sms') ?? true,
        mms: number.features?.includes('mms') ?? false
      }
    }))

    return NextResponse.json({
      success: true,
      numbers: enhancedNumbers,
      total: numbers.length,
      searchMethod,
      searchedCity: city || null,
      pricing: {
        monthlyRate: 1.00, // Telnyx base rate
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