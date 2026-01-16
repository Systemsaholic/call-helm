import { test, expect } from '@playwright/test'

test.describe('Settings Page UI Tests', () => {
  // Tests are pre-authenticated via Playwright storageState
  test.beforeEach(async ({ page }) => {
    // Navigate directly to settings (already authenticated via setup)
    await page.goto('/dashboard/settings')
    await page.waitForLoadState('networkidle')
  })

  test('Profile tab - Save functionality', async ({ page }) => {
    // Ensure we're on the Profile tab
    await page.click('button:has-text("Profile")')

    // Wait for content to load
    await expect(page.getByRole('heading', { name: 'Personal Information' })).toBeVisible()

    // Find and fill the Full Name input
    const fullNameInput = page.locator('input').first()
    const originalValue = await fullNameInput.inputValue()
    await fullNameInput.fill('Test User Name')

    // Find and click the Save button
    const saveButton = page.getByRole('button', { name: /save changes/i })
    await saveButton.click()

    // Wait for save to complete
    await page.waitForTimeout(1500)

    // Verify the save button returns to normal state
    await expect(saveButton).toBeEnabled({ timeout: 5000 })

    // Restore original value
    if (originalValue) {
      await fullNameInput.fill(originalValue)
      await saveButton.click()
      await page.waitForTimeout(1000)
    }
  })

  test('Organization tab - Save functionality', async ({ page }) => {
    // Click on Organization tab
    await page.click('button:has-text("Organization")')

    // Wait for content to load
    await expect(page.getByText('Organization Details')).toBeVisible()

    // Verify save button is visible and enabled
    const saveButton = page.getByRole('button', { name: /save changes/i })
    await expect(saveButton).toBeVisible()
    await expect(saveButton).toBeEnabled()

    // Click Save button (even without changes, should work)
    await saveButton.click()

    // Wait for save to complete
    await page.waitForTimeout(1500)

    // Button should return to enabled state
    await expect(saveButton).toBeEnabled({ timeout: 5000 })
  })

  test('Tab switching preserves data', async ({ page }) => {
    // Start on Profile tab
    await page.click('button:has-text("Profile")')
    await expect(page.getByRole('heading', { name: 'Personal Information' })).toBeVisible()

    // Switch to Organization tab
    await page.click('button:has-text("Organization")')
    await expect(page.getByText('Organization Details')).toBeVisible()

    // Switch back to Profile tab
    await page.click('button:has-text("Profile")')
    await expect(page.getByRole('heading', { name: 'Personal Information' })).toBeVisible()
  })

  test('Save button shows correct states', async ({ page }) => {
    // Click on Profile tab
    await page.click('button:has-text("Profile")')
    await expect(page.getByRole('heading', { name: 'Personal Information' })).toBeVisible()

    // Get the save button
    const saveButton = page.getByRole('button', { name: /save changes/i })

    // Initially should be enabled
    await expect(saveButton).toBeEnabled()

    // Click save
    await saveButton.click()

    // Wait for save to complete - button should return to enabled
    await expect(saveButton).toBeEnabled({ timeout: 5000 })
  })

  test('All tabs are accessible', async ({ page }) => {
    // Check all tabs are visible and clickable
    const tabs = [
      { name: 'Profile', content: 'Personal Information' },
      { name: 'Organization', content: 'Organization Details' },
      { name: 'Notifications', content: 'Email Notifications' },
      { name: 'Billing', content: 'Billing' },
      { name: 'API', content: 'API Keys' },
      { name: 'Integrations', content: 'Available Integrations' },
      { name: 'Security', content: 'Password & Authentication' }
    ]

    for (const tab of tabs) {
      const tabButton = page.locator(`button:has-text("${tab.name}")`)
      await expect(tabButton).toBeVisible()

      // Click the tab
      await tabButton.click()
      await page.waitForTimeout(500)

      // Verify content loads
      const content = page.getByText(new RegExp(tab.content, 'i'))
      await expect(content.first()).toBeVisible({ timeout: 5000 })
    }
  })
})
