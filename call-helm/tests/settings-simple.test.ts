import { test, expect } from '@playwright/test'

test.describe('Settings Page UI Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate directly to settings page (assuming no auth for testing)
    await page.goto('http://localhost:3035/dashboard/settings')
    await page.waitForLoadState('networkidle')
  })

  test('Profile tab - Save functionality', async ({ page }) => {
    // Ensure we're on the Profile tab
    const profileTab = page.locator('button:has-text("Profile")')
    await profileTab.click()
    
    // Wait for content to load
    await page.waitForSelector('text=Personal Information')
    
    // Find and fill the Full Name input
    const fullNameInput = page.locator('input').first()
    await fullNameInput.clear()
    await fullNameInput.fill('Test User Name')
    
    // Find and click the Save button
    const saveButton = page.locator('button:has-text("Save Changes")')
    await saveButton.click()
    
    // Check for loading state
    await expect(page.locator('text=Saving...')).toBeVisible()
    
    // Wait for success message (mocked save completes in 1 second)
    await expect(page.locator('text=Settings saved successfully')).toBeVisible({ timeout: 3000 })
    
    // Verify the save button is back to normal
    await expect(saveButton).toContainText('Save Changes')
  })

  test('Organization tab - Save functionality', async ({ page }) => {
    // Click on Organization tab
    const orgTab = page.locator('button:has-text("Organization")')
    await orgTab.click()
    
    // Wait for content to load
    await page.waitForSelector('text=Organization Details')
    
    // Find and fill the Organization Name input
    const orgNameInput = page.locator('input').first()
    await orgNameInput.clear()
    await orgNameInput.fill('Test Organization')
    
    // Toggle a checkbox
    const firstCheckbox = page.locator('input[type="checkbox"]').first()
    await firstCheckbox.click()
    
    // Click Save button
    const saveButton = page.locator('button:has-text("Save Changes")')
    await saveButton.click()
    
    // Check for loading state
    await expect(page.locator('text=Saving...')).toBeVisible()
    
    // Wait for success message
    await expect(page.locator('text=Settings saved successfully')).toBeVisible({ timeout: 3000 })
  })

  test('Tab switching preserves data', async ({ page }) => {
    // Start on Profile tab and enter data
    const profileTab = page.locator('button:has-text("Profile")')
    await profileTab.click()
    
    const fullNameInput = page.locator('input').first()
    await fullNameInput.clear()
    await fullNameInput.fill('Preserved Name')
    
    // Switch to Organization tab
    const orgTab = page.locator('button:has-text("Organization")')
    await orgTab.click()
    await page.waitForTimeout(500) // Wait for tab animation
    
    // Enter organization data
    const orgNameInput = page.locator('input').first()
    await orgNameInput.clear()
    await orgNameInput.fill('Preserved Organization')
    
    // Switch back to Profile tab
    await profileTab.click()
    await page.waitForTimeout(500)
    
    // Check if the name is still there
    const nameValue = await page.locator('input').first().inputValue()
    expect(nameValue).toBe('Preserved Name')
    
    // Switch back to Organization tab
    await orgTab.click()
    await page.waitForTimeout(500)
    
    // Check if the organization name is still there
    const orgValue = await page.locator('input').first().inputValue()
    expect(orgValue).toBe('Preserved Organization')
  })

  test('Save button shows correct states', async ({ page }) => {
    // Click on Profile tab
    const profileTab = page.locator('button:has-text("Profile")')
    await profileTab.click()
    
    // Get the save button
    const saveButton = page.locator('button:has-text("Save Changes")')
    
    // Initially should show "Save Changes"
    await expect(saveButton).toContainText('Save Changes')
    await expect(saveButton).toBeEnabled()
    
    // Make a change
    const input = page.locator('input').first()
    await input.clear()
    await input.fill('Testing Save States')
    
    // Click save
    await saveButton.click()
    
    // Should show loading state
    await expect(saveButton).toContainText('Saving...')
    await expect(saveButton).toBeDisabled()
    
    // Should show the loading spinner
    const spinner = saveButton.locator('svg.animate-spin')
    await expect(spinner).toBeVisible()
    
    // After save completes, should be back to normal
    await expect(saveButton).toContainText('Save Changes', { timeout: 3000 })
    await expect(saveButton).toBeEnabled()
    
    // Success message should appear
    await expect(page.locator('text=Settings saved successfully')).toBeVisible()
  })

  test('All tabs are accessible', async ({ page }) => {
    // Check all tabs are visible and clickable
    const tabs = [
      'Profile',
      'Organization',
      'Notifications',
      'Billing',
      'API Keys',
      'Integrations',
      'Security'
    ]
    
    for (const tabName of tabs) {
      const tab = page.locator(`button:has-text("${tabName}")`)
      await expect(tab).toBeVisible()
      
      // Click the tab
      await tab.click()
      
      // Wait a bit for content to load
      await page.waitForTimeout(300)
      
      // Check that the tab is highlighted (has primary background)
      await expect(tab).toHaveClass(/bg-primary/)
    }
  })
})