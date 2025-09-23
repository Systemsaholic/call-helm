#!/usr/bin/env tsx

/**
 * Script to fix webhook URLs for existing phone numbers
 * This fixes the issue where numbers were configured with localhost URLs instead of ngrok
 */

import dotenv from 'dotenv'

// Load environment variables FIRST
dotenv.config({ path: '.env.local' })

// Now import the SignalWire service after environment is loaded
import { SignalWireService } from '../src/lib/services/signalwire'

// Create a fresh SignalWire service instance
const signalwireService = new SignalWireService()

async function fixWebhookUrls() {
  console.log('Fixing webhook URLs for existing phone numbers...')
  
  console.log(`Current environment:`)
  console.log(`- APP_URL: ${process.env.APP_URL}`)
  console.log(`- NEXT_PUBLIC_APP_URL: ${process.env.NEXT_PUBLIC_APP_URL}`)
  console.log(`- SIGNALWIRE_SPACE_URL: ${process.env.SIGNALWIRE_SPACE_URL}`)
  console.log(`- SIGNALWIRE_PROJECT_ID: ${process.env.SIGNALWIRE_PROJECT_ID}`)
  console.log(`- SIGNALWIRE_API_TOKEN: ${process.env.SIGNALWIRE_API_TOKEN ? 'SET' : 'NOT SET'}`)
  
  try {
    // Use the known SID from the database query
    const numberSid = '6a0d8db1-3215-4ef9-82f2-6b939dab1ece'
    const targetNumber = '+13433533549'
    const forwardingNumber = '+16137004540'
    
    console.log(`🎯 Configuring number: ${targetNumber} (SID: ${numberSid})`)
    console.log(`📞 Forwarding to: ${forwardingNumber}`)
    
    // Update webhook URLs using the configureForwarding method which we know works
    console.log('\n🔧 Updating webhook URLs using configureForwarding...')
    await signalwireService.configureForwarding(numberSid, forwardingNumber)
    
    console.log('✅ Webhook URLs updated successfully!')
    console.log('\nThe phone number should now forward calls correctly.')
    console.log('Test by calling +13433533549 - it should forward to +16137004540')
    
  } catch (error) {
    console.error('❌ Failed to update webhook URLs:', error)
    process.exit(1)
  }
}

// Run the fix
fixWebhookUrls().then(() => {
  console.log('\n🎉 Webhook URL fix completed!')
  process.exit(0)
}).catch((error) => {
  console.error('Fix failed:', error)
  process.exit(1)
})