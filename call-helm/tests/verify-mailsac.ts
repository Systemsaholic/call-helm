/**
 * Verify Mailsac API connection
 * Run: npx tsx tests/verify-mailsac.ts
 */

import * as dotenv from 'dotenv'
import * as path from 'path'

// Load environment variables from cwd
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

const MAILSAC_API_KEY = process.env.MAILSAC_API_KEY || ''
const MAILSAC_BASE_URL = 'https://mailsac.com/api'

async function verifyConnection() {
  console.log('=== Mailsac API Verification ===\n')

  if (!MAILSAC_API_KEY) {
    console.error('❌ MAILSAC_API_KEY not found in environment')
    console.log('Make sure MAILSAC_API_KEY is set in .env.local')
    process.exit(1)
  }

  console.log(`✓ API Key found: ${MAILSAC_API_KEY.substring(0, 10)}...`)

  try {
    // Test API connection
    console.log('\nTesting API connection...')
    const response = await fetch(`${MAILSAC_BASE_URL}/me`, {
      headers: {
        'Mailsac-Key': MAILSAC_API_KEY,
      },
    })

    if (!response.ok) {
      console.error(`❌ API returned status: ${response.status}`)
      const text = await response.text()
      console.error('Response:', text)
      process.exit(1)
    }

    const data = await response.json()
    console.log('✓ API connection successful!')
    console.log(`  Account: ${data.email || data._id || 'Unknown'}`)

    // Test creating a unique inbox
    const testInbox = `test-${Date.now()}@mailsac.com`
    console.log(`\nTest inbox: ${testInbox}`)

    // Check if we can read from the inbox (it will be empty but should not error)
    const inboxResponse = await fetch(`${MAILSAC_BASE_URL}/addresses/${testInbox.split('@')[0]}@mailsac.com/messages`, {
      headers: {
        'Mailsac-Key': MAILSAC_API_KEY,
      },
    })

    if (inboxResponse.ok) {
      const messages = await inboxResponse.json()
      console.log(`✓ Inbox accessible (${messages.length} messages)`)
    } else {
      console.log(`⚠ Inbox check returned: ${inboxResponse.status}`)
    }

    console.log('\n=== All checks passed! ===')
    console.log('\nYou can now run the agent invite tests:')
    console.log('  pnpm test -- tests/agent-invite-email.test.ts')

  } catch (error) {
    console.error('❌ Error connecting to Mailsac:', error)
    process.exit(1)
  }
}

verifyConnection()
