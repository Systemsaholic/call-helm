import { NextRequest, NextResponse } from 'next/server'
import { SignalWireService } from '@/lib/services/signalwire'

export async function GET(request: NextRequest) {
  try {
    const signalwireService = new SignalWireService()
    
    // Get the current app URL from environment
    const appUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL
    
    if (!appUrl) {
      return NextResponse.json({ error: "App URL not configured" }, { status: 500 })
    }
    
    console.log('=== FIXING SIGNALWIRE WEBHOOKS ===')
    console.log('App URL:', appUrl)
    
    // List all owned numbers
    const numbers = await signalwireService.listOwnedNumbers()
    console.log('Found numbers:', numbers.map(n => n.phone_number))
    
    // Update webhooks for each number
    const results = []
    for (const number of numbers) {
      try {
        console.log(`Updating webhooks for ${number.phone_number} (SID: ${number.sid})`)
        
        await signalwireService.updateWebhookUrls(number.sid, {
          voiceUrl: `${appUrl}/api/voice/twiml`,
          statusCallback: `${appUrl}/api/voice/status`
        })
        
        results.push({
          phoneNumber: number.phone_number,
          sid: number.sid,
          status: 'updated',
          webhooks: {
            voice_url: `${appUrl}/api/voice/twiml`,
            status_callback: `${appUrl}/api/voice/status`
          }
        })
      } catch (error) {
        console.error(`Failed to update ${number.phone_number}:`, error)
        results.push({
          phoneNumber: number.phone_number,
          sid: number.sid,
          status: 'failed',
          error: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    }
    
    return NextResponse.json({
      success: true,
      message: `Updated ${results.filter(r => r.status === 'updated').length} of ${numbers.length} numbers`,
      appUrl,
      results
    })
    
  } catch (error) {
    console.error('Error fixing webhooks:', error)
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Failed to fix webhooks'
    }, { status: 500 })
  }
}