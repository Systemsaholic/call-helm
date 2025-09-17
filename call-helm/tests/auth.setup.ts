import { test as setup, expect } from '@playwright/test'
import path from 'path'

const authFile = path.join(__dirname, '../.auth/user.json')

setup('authenticate', async ({ page }) => {
  // Navigate to login page
  await page.goto('/auth/login')
  
  // Use environment variables for test credentials
  const email = process.env.TEST_USER_EMAIL || 'playwright.test@example.com'
  const password = process.env.TEST_USER_PASSWORD || 'PlaywrightTest123!@#'
  
  // Perform login
  await page.fill('input[name="email"]', email)
  await page.fill('input[name="password"]', password)
  
  // Click sign in button
  await page.click('button[type="submit"]')
  
  // Wait for navigation to dashboard
  await page.waitForURL('**/dashboard', { timeout: 10000 })
  
  // Verify we're logged in - look for the sidebar navigation
  await expect(page.locator('nav').first()).toContainText('Dashboard')
  
  // Save authentication state
  await page.context().storageState({ path: authFile })
})