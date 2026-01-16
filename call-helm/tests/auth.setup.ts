import { test as setup, expect } from '@playwright/test'
import path from 'path'

const authFile = path.join(__dirname, '../.auth/user.json')

setup('authenticate', async ({ page }) => {
  // Navigate to login page
  await page.goto('/auth/login')

  // Wait for page to be fully loaded and interactive
  await page.waitForLoadState('domcontentloaded')

  // Wait for the form to be visible and interactive
  await page.waitForSelector('input[name="email"]', { state: 'visible', timeout: 10000 })

  // Use environment variables for test credentials
  const email = process.env.TEST_USER_EMAIL || 'playwright.test@example.com'
  const password = process.env.TEST_USER_PASSWORD || 'PlaywrightTest123!@#'

  // Clear and fill email
  const emailInput = page.locator('input[name="email"]')
  await emailInput.clear()
  await emailInput.fill(email)

  // Clear and fill password
  const passwordInput = page.locator('input[name="password"]')
  await passwordInput.clear()
  await passwordInput.fill(password)

  // Click sign in button
  await page.click('button[type="submit"]')

  // Wait for navigation to dashboard with increased timeout
  await page.waitForURL('**/dashboard**', { timeout: 30000 })

  // Verify we're logged in by looking for the dashboard heading
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({ timeout: 10000 })

  // Save authentication state
  await page.context().storageState({ path: authFile })
})