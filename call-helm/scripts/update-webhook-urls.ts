#!/usr/bin/env tsx

/**
 * Script to update webhook URLs for a specific phone number
 * Usage: pnpm tsx scripts/update-webhook-urls.ts
 */

import { config } from 'dotenv'
import { resolve } from 'path'

// Load environment variables
config({ path: resolve(__dirname, '../.env.local') })

async function updateWebhookUrls() {
  const phoneNumber = '+13433533549'
  const forwardTo = '+16137004540'
  
  // Get the number SID first by listing all numbers
  const spaceUrl = process.env.SIGNALWIRE_SPACE_URL
  const projectId = process.env.SIGNALWIRE_PROJECT_ID
  const apiToken = process.env.SIGNALWIRE_API_TOKEN
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL
  
  if (!spaceUrl || !projectId || !apiToken) {
    console.error('Missing SignalWire credentials in environment variables')
    process.exit(1)
  }
  
  if (!appUrl) {
    console.error('Missing APP_URL in environment variables')
    process.exit(1)
  }
  
  const baseUrl = `https://${spaceUrl}/api/laml/2010-04-01/Accounts/${projectId}`
  const auth = Buffer.from(`${projectId}:${apiToken}`).toString('base64')
  
  console.log(`Using app URL: ${appUrl}`)
  console.log(`Looking for phone number: ${phoneNumber}`)
  
  try {
    // List all owned numbers
    const listResponse = await fetch(`${baseUrl}/IncomingPhoneNumbers.json`, {
      headers: {
        'Authorization': `Basic ${auth}`
      }
    })
    
    if (!listResponse.ok) {
      throw new Error(`Failed to list numbers: ${listResponse.statusText}`)
    }
    
    const data = await listResponse.json()
    const number = data.incoming_phone_numbers?.find((n: any) => 
      n.phone_number === phoneNumber
    )
    
    if (!number) {
      console.error(`Phone number ${phoneNumber} not found in account`)
      process.exit(1)
    }
    
    console.log(`Found number SID: ${number.sid}`)
    console.log(`Current Voice URL: ${number.voice_url}`)
    console.log(`Current SMS URL: ${number.sms_url}`)
    
    // Update webhook URLs - use the forward endpoint with the forward_to parameter
    const voiceUrl = `${appUrl}/api/voice/forward?forward_to=${encodeURIComponent(forwardTo)}`
    const smsUrl = `${appUrl}/api/voice/sms`
    const statusCallback = `${appUrl}/api/voice/status`
    
    const formData = new URLSearchParams()
    formData.append('VoiceUrl', voiceUrl)
    formData.append('VoiceMethod', 'POST')
    formData.append('VoiceFallbackUrl', voiceUrl)
    formData.append('SmsUrl', smsUrl)
    formData.append('SmsMethod', 'POST')
    formData.append('StatusCallback', statusCallback)
    
    console.log('\nUpdating webhook URLs...')
    console.log(`- Voice URL: ${voiceUrl}`)
    console.log(`- SMS URL: ${smsUrl}`)
    console.log(`- Status Callback: ${statusCallback}`)
    
    const updateResponse = await fetch(`${baseUrl}/IncomingPhoneNumbers/${number.sid}.json`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: formData
    })
    
    if (!updateResponse.ok) {
      const errorText = await updateResponse.text()
      throw new Error(`Failed to update webhook URLs: ${updateResponse.statusText} - ${errorText}`)
    }
    
    const updatedData = await updateResponse.json()
    console.log('\n✅ Successfully updated webhook URLs!')
    console.log(`New Voice URL: ${updatedData.voice_url}`)
    console.log(`New SMS URL: ${updatedData.sms_url}`)
    console.log(`\n📞 Phone number ${phoneNumber} is now configured to forward calls to ${forwardTo}`)
    
  } catch (error) {
    console.error('Error:', error)
    process.exit(1)
  }
}

// Run the update
updateWebhookUrls()