/**
 * Telnyx Connection Test Endpoint
 *
 * GET /api/telnyx/test - Test API connection and list configuration
 */

import { NextResponse } from 'next/server'
import { TelnyxService } from '@/lib/services/telnyx'

export async function GET() {
  try {
    // Check configuration
    const configStatus = TelnyxService.getConfigurationStatus()

    if (!configStatus.apiKey) {
      return NextResponse.json({
        success: false,
        error: 'TELNYX_API_KEY not configured',
        config: configStatus
      }, { status: 500 })
    }

    const telnyx = new TelnyxService()

    // Test 1: List owned phone numbers
    let numbers: unknown[] = []
    let numbersError: string | null = null
    try {
      numbers = await telnyx.listOwnedNumbers({ limit: 5 })
    } catch (e) {
      numbersError = e instanceof Error ? e.message : 'Unknown error'
    }

    // Test 2: Search available numbers (just to verify API works)
    let availableNumbers: unknown[] = []
    let searchError: string | null = null
    try {
      availableNumbers = await telnyx.searchAvailableNumbers({
        countryCode: 'US',
        areaCode: '312',
        limit: 3
      })
    } catch (e) {
      searchError = e instanceof Error ? e.message : 'Unknown error'
    }

    return NextResponse.json({
      success: true,
      config: configStatus,
      tests: {
        ownedNumbers: {
          success: !numbersError,
          count: numbers.length,
          numbers: numbers,
          error: numbersError
        },
        searchNumbers: {
          success: !searchError,
          count: availableNumbers.length,
          sample: availableNumbers.slice(0, 2),
          error: searchError
        }
      },
      webhooks: {
        voice: '/api/voice/telnyx/webhook',
        smsReceive: '/api/sms/telnyx/receive',
        smsStatus: '/api/sms/telnyx/status'
      }
    })
  } catch (error) {
    console.error('[Telnyx Test] Error:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
