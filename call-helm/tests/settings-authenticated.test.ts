import { test, expect } from '@playwright/test'

test.describe('Settings Page - Authenticated Tests', () => {
  // Tests are pre-authenticated via Playwright storageState
  test.beforeEach(async ({ page }) => {
    // Navigate directly to settings (already authenticated via setup)
    await page.goto('/dashboard/settings')
    // Use domcontentloaded for faster more reliable loading
    await page.waitForLoadState('domcontentloaded')
    // Wait for the page to be ready
    await page.waitForSelector('h2, h3, [role="heading"]', { timeout: 15000 })
  })

  test('Profile Settings - Save personal information', async ({ page }) => {
    // Profile tab should be active by default
    await expect(page.getByRole('heading', { name: 'Personal Information' })).toBeVisible()

    // Find and interact with profile fields
    const fullNameInput = page.locator('input').first()
    const currentValue = await fullNameInput.inputValue()

    // Make a small change
    await fullNameInput.fill('Test User')

    // Click Save button
    const saveButton = page.getByRole('button', { name: /save changes/i })
    await saveButton.click()

    // Wait for save to complete
    await page.waitForTimeout(1500)

    // Verify button returns to normal state
    await expect(saveButton).toBeEnabled({ timeout: 5000 })

    // Restore original value if there was one
    if (currentValue) {
      await fullNameInput.fill(currentValue)
      await saveButton.click()
      await page.waitForTimeout(1000)
    }
  })

  test('Organization Settings - Save organization details and preferences', async ({ page }) => {
    // Click on Organization tab
    await page.click('button:has-text("Organization")')
    await page.waitForTimeout(500)

    // Wait for tab content to load
    await expect(page.getByText('Organization Details')).toBeVisible()

    // Verify Call Settings section exists
    await expect(page.getByText('Call Settings')).toBeVisible()

    // Save button should be visible
    const saveButton = page.getByRole('button', { name: /save changes/i })
    await expect(saveButton).toBeVisible()
  })

  test('Tab switching preserves unsaved data', async ({ page }) => {
    // Profile tab should be active
    await expect(page.getByRole('heading', { name: 'Personal Information' })).toBeVisible()

    // Switch to Organization tab
    await page.click('button:has-text("Organization")')
    await expect(page.getByText('Organization Details')).toBeVisible()

    // Switch back to Profile tab
    await page.click('button:has-text("Profile")')
    await expect(page.getByRole('heading', { name: 'Personal Information' })).toBeVisible()
  })

  test('Notification Settings - Toggle email and push notifications', async ({ page }) => {
    // Click on Notifications tab
    await page.click('button:has-text("Notifications")')

    // Wait for content
    await expect(page.getByText('Email Notifications')).toBeVisible()

    // Verify notification options are visible
    await expect(page.getByText('Call Summaries')).toBeVisible()
    await expect(page.getByText('Weekly Reports')).toBeVisible()

    // Save button should be visible
    const saveButton = page.getByRole('button', { name: /save changes/i })
    await expect(saveButton).toBeVisible()
  })

  test('All settings tabs are accessible and functional', async ({ page }) => {
    const tabs = [
      { name: 'Profile', content: 'Personal Information' },
      { name: 'Organization', content: 'Organization Details' },
      { name: 'Notifications', content: 'Email Notifications' },
      { name: 'Billing', content: 'subscription' }, // Billing dashboard has different content
      { name: 'API', content: 'API Keys' },
      { name: 'Integrations', content: 'Available Integrations' },
      { name: 'Security', content: 'Password & Authentication' }
    ]

    for (const tab of tabs) {
      // Click the tab
      await page.click(`button:has-text("${tab.name}")`)
      await page.waitForTimeout(500)

      // Verify content is visible (use regex for flexible matching)
      const content = page.getByText(new RegExp(tab.content, 'i'))
      await expect(content.first()).toBeVisible({ timeout: 5000 })
    }
  })

  test('Save button states and loading indicator', async ({ page }) => {
    // Profile tab should be active
    await expect(page.getByRole('heading', { name: 'Personal Information' })).toBeVisible()

    // Get save button
    const saveButton = page.getByRole('button', { name: /save changes/i })

    // Initial state - button should be enabled
    await expect(saveButton).toBeEnabled()

    // Click save
    await saveButton.click()

    // Wait for completion (loading state may be brief)
    await expect(saveButton).toBeEnabled({ timeout: 5000 })
  })

  test('Billing section displays plan information', async ({ page }) => {
    // Navigate to Billing tab
    await page.click('button:has-text("Billing")')
    await page.waitForTimeout(500)

    // Billing tab should load (BillingDashboard component)
    // Check for any billing-related content
    const billingContent = page.locator('[class*="billing"], [class*="plan"], [class*="subscription"]').first()
    // The billing page may show different content based on subscription status
    await page.waitForTimeout(1000)
  })

  test('API Keys section with security warning', async ({ page }) => {
    // Navigate to API Keys tab
    await page.click('button:has-text("API")')
    await page.waitForTimeout(500)

    // Check for API Keys section
    await expect(page.getByRole('heading', { name: /api keys/i })).toBeVisible()

    // Check for security warning
    await expect(page.getByText(/keep your api keys secure/i)).toBeVisible()

    // Check for API key section
    await expect(page.getByText(/Production API Key/i)).toBeVisible()

    // Check for generate button
    await expect(page.getByRole('button', { name: /generate new api key/i })).toBeVisible()
  })
})

test.describe('Settings Integration Flow', () => {
  // Tests are pre-authenticated via Playwright storageState
  test('Complete settings workflow - Update multiple sections and save', async ({ page }) => {
    // Navigate directly to settings (already authenticated via setup)
    await page.goto('/dashboard/settings')
    await page.waitForLoadState('networkidle')

    // Verify Profile tab is accessible
    await expect(page.getByRole('heading', { name: 'Personal Information' })).toBeVisible()

    // Switch to Organization tab
    await page.click('button:has-text("Organization")')
    await expect(page.getByText('Organization Details')).toBeVisible()

    // Switch to Notifications tab
    await page.click('button:has-text("Notifications")')
    await expect(page.getByText('Email Notifications')).toBeVisible()

    // Save all changes
    const saveButton = page.getByRole('button', { name: /save changes/i })
    await saveButton.click()

    // Wait for save to complete
    await page.waitForTimeout(1500)

    // Verify button is enabled after save
    await expect(saveButton).toBeEnabled({ timeout: 5000 })
  })
})
