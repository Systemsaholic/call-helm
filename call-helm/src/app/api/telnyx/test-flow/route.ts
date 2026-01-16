/**
 * Telnyx Full Flow Test
 *
 * Tests Telnyx API functionality:
 * 1. Test outbound voice call
 * 2. Test SMS send
 * 3. Test broadcast (multiple SMS)
 *
 * GET /api/telnyx/test-flow?phone=+16137004540
 */

import { NextRequest, NextResponse } from 'next/server'
import { TelnyxService } from '@/lib/services/telnyx'

const TELNYX_NUMBER = '+16138006184'

interface TestResult {
  step: string
  success: boolean
  data?: unknown
  error?: string
  duration?: number
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const destinationPhone = searchParams.get('phone') || '+16137004540'
  const runVoice = searchParams.get('voice') !== 'false'
  const runSms = searchParams.get('sms') !== 'false'
  const runBroadcast = searchParams.get('broadcast') !== 'false'

  const results: TestResult[] = []

  console.log('[Telnyx Test Flow] Starting full flow test to:', destinationPhone)

  // Format destination phone - handle various input formats
  let formattedDestination = destinationPhone.replace(/\D/g, '')

  // Add country code if missing
  if (formattedDestination.length === 10) {
    formattedDestination = `+1${formattedDestination}`
  } else if (formattedDestination.length === 11 && formattedDestination.startsWith('1')) {
    formattedDestination = `+${formattedDestination}`
  } else if (!formattedDestination.startsWith('+')) {
    formattedDestination = `+${formattedDestination}`
  }

  const telnyx = new TelnyxService()

  // ==========================================
  // STEP 1: Test Voice Call
  // ==========================================
  if (runVoice) {
    const voiceStart = Date.now()
    try {
      // Initiate call via Call Control API
      const callResult = await telnyx.initiateCall({
        from: TELNYX_NUMBER,
        to: formattedDestination,
        clientState: JSON.stringify({
          test: true,
          timestamp: new Date().toISOString()
        }),
        answeringMachineDetection: false
      })

      results.push({
        step: '1. Voice Call (Call Control API)',
        success: true,
        data: {
          callControlId: callResult.callControlId,
          callSessionId: callResult.callSessionId,
          callLegId: callResult.callLegId,
          from: TELNYX_NUMBER,
          to: formattedDestination,
          message: '📞 Call initiated - your phone should ring!'
        },
        duration: Date.now() - voiceStart
      })

      console.log('[Test] Voice call initiated:', callResult.callControlId)

    } catch (error) {
      results.push({
        step: '1. Voice Call (Call Control API)',
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        duration: Date.now() - voiceStart
      })
    }
  } else {
    results.push({
      step: '1. Voice Call',
      success: true,
      data: { skipped: true, reason: 'voice=false' },
      duration: 0
    })
  }

  // ==========================================
  // STEP 2: Test SMS
  // ==========================================
  if (runSms) {
    const smsStart = Date.now()
    try {
      const smsResult = await telnyx.sendMessage({
        from: TELNYX_NUMBER,
        to: formattedDestination,
        text: `🧪 Telnyx SMS Test from Call Helm

Timestamp: ${new Date().toISOString()}

This is a test message to verify Telnyx SMS integration is working correctly.`
      })

      results.push({
        step: '2. SMS Send',
        success: true,
        data: {
          messageId: smsResult.id,
          status: smsResult.status,
          from: TELNYX_NUMBER,
          to: formattedDestination,
          cost: smsResult.cost,
          message: '💬 SMS sent successfully!'
        },
        duration: Date.now() - smsStart
      })

      console.log('[Test] SMS sent:', smsResult.id)

    } catch (error) {
      results.push({
        step: '2. SMS Send',
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        duration: Date.now() - smsStart
      })
    }
  } else {
    results.push({
      step: '2. SMS Send',
      success: true,
      data: { skipped: true, reason: 'sms=false' },
      duration: 0
    })
  }

  // ==========================================
  // STEP 3: Test Broadcast (simulated)
  // ==========================================
  if (runBroadcast) {
    const broadcastStart = Date.now()
    try {
      // Simulate a broadcast by sending a message with broadcast-style content
      const broadcastMessage = `📢 Telnyx Broadcast Test

This is a simulated broadcast message from Call Helm.

Campaign: Test Broadcast
Sent: ${new Date().toLocaleString()}
Recipients: 1 (test mode)

Reply STOP to unsubscribe.`

      const smsResult = await telnyx.sendMessage({
        from: TELNYX_NUMBER,
        to: formattedDestination,
        text: broadcastMessage
      })

      results.push({
        step: '3. Broadcast (SMS)',
        success: true,
        data: {
          messageId: smsResult.id,
          status: smsResult.status,
          from: TELNYX_NUMBER,
          to: formattedDestination,
          cost: smsResult.cost,
          message: '📢 Broadcast message sent!'
        },
        duration: Date.now() - broadcastStart
      })

      console.log('[Test] Broadcast sent:', smsResult.id)

    } catch (error) {
      results.push({
        step: '3. Broadcast (SMS)',
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        duration: Date.now() - broadcastStart
      })
    }
  } else {
    results.push({
      step: '3. Broadcast',
      success: true,
      data: { skipped: true, reason: 'broadcast=false' },
      duration: 0
    })
  }

  // ==========================================
  // Summary
  // ==========================================
  const allSuccess = results.every(r => r.success)
  const totalDuration = results.reduce((sum, r) => sum + (r.duration || 0), 0)

  return NextResponse.json({
    success: allSuccess,
    summary: {
      totalTests: results.length,
      passed: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      totalDuration: `${totalDuration}ms`,
      destination: formattedDestination,
      telnyxNumber: TELNYX_NUMBER
    },
    results,
    nextSteps: allSuccess ? [
      'Voice webhook will fire at /api/voice/telnyx/webhook',
      'SMS status webhook will fire at /api/sms/telnyx/status',
      'Check your phone for the call and messages!'
    ] : [
      'Check error messages above',
      'Verify Telnyx configuration in portal',
      'Ensure phone number is assigned to connection/messaging profile'
    ]
  })
}
