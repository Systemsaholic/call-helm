/**
 * Global setup for Playwright tests
 * This runs before all tests and sets up environment variables
 */

import * as dotenv from 'dotenv'
import * as path from 'path'
import * as fs from 'fs'

export default async function globalSetup() {
  // Find and load .env.local from project root
  const envPath = path.resolve(process.cwd(), '.env.local')

  if (fs.existsSync(envPath)) {
    const result = dotenv.config({ path: envPath })
    if (result.error) {
      console.error('Failed to load .env.local:', result.error)
    } else {
      console.log(`Loaded ${Object.keys(result.parsed || {}).length} env vars from .env.local`)
    }
  } else {
    console.warn('.env.local not found at:', envPath)
  }

  // Store env vars for workers to access via globalThis
  const envVars = {
    MAILSAC_API_KEY: process.env.MAILSAC_API_KEY || '',
    RESEND_API_KEY: process.env.RESEND_API_KEY || '',
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3035',
  }

  // Write env vars to a temp file that workers can read
  const tempEnvPath = path.resolve(process.cwd(), '.env.test.json')
  fs.writeFileSync(tempEnvPath, JSON.stringify(envVars, null, 2))
  console.log('Test env vars written to .env.test.json')
}
