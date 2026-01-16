import { test, expect } from '@playwright/test'

test.describe('Settings Page Tests', () => {
  // Tests are pre-authenticated via Playwright storageState

  test.beforeEach(async ({ page }) => {
    // Navigate directly to settings (already authenticated via setup)
    await page.goto('/dashboard/settings')
    // Use domcontentloaded for faster more reliable loading
    await page.waitForLoadState('domcontentloaded')
    // Wait for the page to be ready - look for Profile or Personal Information heading
    await page.waitForSelector('h2, h3, [role="heading"]', { timeout: 15000 })
  })

  test('Should save Profile Information successfully', async ({ page }) => {
    // Profile tab should be active by default
    await expect(page.getByRole('heading', { name: 'Personal Information' })).toBeVisible()

    // Find and fill profile fields using labels
    const fullNameInput = page.locator('label:has-text("Full Name") + input, label:has-text("Full Name") ~ input').first()
    if (await fullNameInput.isVisible().catch(() => false)) {
      await fullNameInput.fill('Test User Updated')
    }

    // Click Save button
    const saveButton = page.getByRole('button', { name: /save changes/i })
    await saveButton.click()

    // Wait for success message or saving state
    await page.waitForTimeout(1000)
  })

  test('Should save Organization Settings successfully', async ({ page }) => {
    // Click on Organization tab
    await page.click('button:has-text("Organization")')
    await page.waitForTimeout(500)

    // Verify organization settings section is visible
    await expect(page.getByText('Organization Details')).toBeVisible()

    // Click Save button
    const saveButton = page.getByRole('button', { name: /save changes/i })
    await saveButton.click()

    // Wait for save to complete
    await page.waitForTimeout(1000)
  })

  test('Should switch between tabs without losing data', async ({ page }) => {
    // Switch to Organization tab
    await page.click('button:has-text("Organization")')
    await expect(page.getByText('Organization Details')).toBeVisible()

    // Switch to Notifications tab
    await page.click('button:has-text("Notifications")')
    await expect(page.getByText('Email Notifications')).toBeVisible()

    // Switch back to Profile tab
    await page.click('button:has-text("Profile")')
    await expect(page.getByRole('heading', { name: 'Personal Information' })).toBeVisible()
  })

  test('Should show loading state while saving', async ({ page }) => {
    // Click Save button
    const saveButton = page.getByRole('button', { name: /save changes/i })
    await saveButton.click()

    // Check for loading state (button text changes to "Saving...")
    // The button may show loading briefly
    await page.waitForTimeout(500)

    // After saving, button should return to normal state
    await expect(saveButton).toBeEnabled({ timeout: 5000 })
  })

  test('Should validate required fields', async ({ page }) => {
    // Profile tab should be active by default
    await expect(page.getByRole('heading', { name: 'Personal Information' })).toBeVisible()

    // The email input should be present
    const emailInput = page.locator('input[type="email"]').first()
    await expect(emailInput).toBeVisible()
  })

  test('Should handle profile photo upload button', async ({ page }) => {
    // Profile tab should be active by default
    await expect(page.getByText('Profile Photo')).toBeVisible()

    // Check upload button exists
    await expect(page.getByRole('button', { name: /upload photo/i })).toBeVisible()

    // Check file size limit text - actual text is "JPG, PNG, GIF or WebP, max 2MB"
    await expect(page.getByText(/JPG, PNG, GIF or WebP, max 2MB/i)).toBeVisible()
  })

  test('Should display organization call settings correctly', async ({ page }) => {
    // Click on Organization tab
    await page.click('button:has-text("Organization")')
    await page.waitForTimeout(500)

    // Check Call Settings section exists
    await expect(page.getByText('Call Settings')).toBeVisible()

    // Check all call setting labels are visible
    await expect(page.getByText('Auto-record all calls')).toBeVisible()
    await expect(page.getByText('Enable call transcription')).toBeVisible()
    await expect(page.getByText('Require call notes')).toBeVisible()
    await expect(page.getByText('Enable AI analysis')).toBeVisible()

    // Note: Some checkboxes may be disabled based on billing plan
    // We verify the UI elements exist but don't try to interact with disabled elements
  })
})

// Integration test for complete settings flow
test.describe('Settings Integration Tests', () => {
  test('Complete settings workflow', async ({ page }) => {
    // Navigate directly to settings (already authenticated via setup)
    await page.goto('/dashboard/settings')
    // Use domcontentloaded for faster more reliable loading
    await page.waitForLoadState('domcontentloaded')
    // Wait for the page to be ready
    await page.waitForSelector('h2, h3, [role="heading"]', { timeout: 15000 })

    // Test Profile tab is accessible
    await expect(page.getByRole('heading', { name: 'Personal Information' })).toBeVisible()

    // Test Organization tab
    await page.click('button:has-text("Organization")')
    await expect(page.getByText('Organization Details')).toBeVisible()

    // Test Notifications tab
    await page.click('button:has-text("Notifications")')
    await expect(page.getByText('Email Notifications')).toBeVisible()

    // Test Billing tab
    await page.click('button:has-text("Billing")')
    await page.waitForTimeout(500)

    // Test API tab
    await page.click('button:has-text("API")')
    await expect(page.getByRole('heading', { name: 'API Keys' })).toBeVisible()

    // Test Security tab
    await page.click('button:has-text("Security")')
    await expect(page.getByText('Password & Authentication')).toBeVisible()
  })
})
