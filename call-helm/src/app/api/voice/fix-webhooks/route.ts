import { NextRequest, NextResponse } from 'next/server'
import { telnyxService } from '@/lib/services/telnyx'

// Note: With Telnyx, webhooks are configured at the connection level, not per-number
// This endpoint is kept for backward compatibility but functionality is limited
export async function GET(request: NextRequest) {
  try {
    // Get the current app URL from environment
    const appUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL

    if (!appUrl) {
      return NextResponse.json({ error: "App URL not configured" }, { status: 500 })
    }

    console.log('=== TELNYX WEBHOOK INFO ===')
    console.log('App URL:', appUrl)
    console.log('Note: Telnyx webhooks are configured at the connection level in the Telnyx portal')

    // List all owned numbers for reference
    const numbers = await telnyxService.listOwnedNumbers()
    console.log('Found numbers:', numbers.map(n => n.phoneNumber))

    // With Telnyx, webhooks are configured at the connection level
    // This endpoint now just returns info about the numbers
    const results = numbers.map(number => ({
      phoneNumber: number.phoneNumber,
      telnyxId: number.id,
      status: 'info',
      note: 'Webhooks are configured at the Telnyx connection level',
      expectedWebhookUrl: `${appUrl}/api/voice/telnyx/webhook`
    }))

    return NextResponse.json({
      success: true,
      message: `Found ${numbers.length} phone numbers. Webhooks are configured at connection level in Telnyx.`,
      appUrl,
      expectedWebhookUrl: `${appUrl}/api/voice/telnyx/webhook`,
      results
    })

  } catch (error) {
    console.error('Error getting webhook info:', error)
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Failed to get webhook info'
    }, { status: 500 })
  }
}