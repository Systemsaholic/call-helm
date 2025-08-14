import { test, expect } from '@playwright/test'

test.describe('Settings Page Tests', () => {
  // Test configuration
  const baseURL = 'http://localhost:3035'
  const testUser = {
    email: 'test@example.com',
    password: 'TestPassword123!',
    fullName: 'Test User'
  }

  test.beforeEach(async ({ page }) => {
    // Navigate to the app
    await page.goto(baseURL)
    
    // Check if we need to login
    const currentURL = page.url()
    if (currentURL.includes('/auth/login')) {
      // Perform login
      await page.fill('input[type="email"]', testUser.email)
      await page.fill('input[type="password"]', testUser.password)
      await page.click('button[type="submit"]')
      
      // Wait for navigation to dashboard
      await page.waitForURL('**/dashboard/**', { timeout: 10000 })
    }
    
    // Navigate to settings
    await page.goto(`${baseURL}/dashboard/settings`)
    await page.waitForLoadState('networkidle')
  })

  test('Should save Profile Information successfully', async ({ page }) => {
    // Click on Profile tab (should be active by default)
    await page.click('button:has-text("Profile")')
    
    // Fill in profile information
    const newFullName = 'John Doe Updated'
    const newEmail = 'john.updated@example.com'
    const newPhone = '+1 (555) 123-4567'
    
    // Clear and fill fields
    await page.fill('input[value*="Full Name"]', '')
    await page.fill('input[placeholder*="Full Name"]', newFullName)
    
    await page.fill('input[type="email"]', newEmail)
    await page.fill('input[type="tel"]', newPhone)
    
    // Select timezone
    await page.selectOption('select', 'Pacific Time (PT)')
    
    // Click Save button
    await page.click('button:has-text("Save Changes")')
    
    // Wait for saving indicator
    await expect(page.locator('text=Saving...')).toBeVisible()
    
    // Wait for success message
    await expect(page.locator('text=Settings saved successfully')).toBeVisible({ timeout: 5000 })
    
    // Verify the values are still there after save
    await expect(page.locator('input[value*="John Doe Updated"]')).toBeVisible()
    await expect(page.locator(`input[value="${newEmail}"]`)).toBeVisible()
    await expect(page.locator(`input[value="${newPhone}"]`)).toBeVisible()
  })

  test('Should save Organization Settings successfully', async ({ page }) => {
    // Click on Organization tab
    await page.click('button:has-text("Organization")')
    await page.waitForTimeout(500) // Wait for tab transition
    
    // Fill in organization information
    const orgName = 'Test Organization Updated'
    const website = 'https://testorg.example.com'
    
    // Update organization details
    await page.fill('input[value*="Organization"]', orgName)
    await page.fill('input[placeholder*="https://example.com"]', website)
    
    // Select language and date format
    await page.selectOption('select:has-text("English")', 'es')
    await page.selectOption('select:has-text("MM/DD/YYYY")', 'DD/MM/YYYY')
    
    // Toggle call settings checkboxes
    await page.check('input[type="checkbox"]:has-text("Auto-record all calls")')
    await page.check('input[type="checkbox"]:has-text("Enable call transcription")')
    await page.uncheck('input[type="checkbox"]:has-text("Require call notes")')
    await page.check('input[type="checkbox"]:has-text("Enable AI analysis")')
    
    // Click Save button
    await page.click('button:has-text("Save Changes")')
    
    // Wait for saving indicator
    await expect(page.locator('text=Saving...')).toBeVisible()
    
    // Wait for success message
    await expect(page.locator('text=Settings saved successfully')).toBeVisible({ timeout: 5000 })
    
    // Verify the values persisted
    await expect(page.locator(`input[value="${orgName}"]`)).toBeVisible()
    await expect(page.locator(`input[value="${website}"]`)).toBeVisible()
  })

  test('Should switch between tabs without losing data', async ({ page }) => {
    // Enter data in Profile tab
    const profileName = 'Tab Test User'
    await page.click('button:has-text("Profile")')
    await page.fill('input[value*="Full Name"]', profileName)
    
    // Switch to Organization tab
    await page.click('button:has-text("Organization")')
    await page.waitForTimeout(500)
    
    // Enter data in Organization tab
    const orgName = 'Tab Test Organization'
    await page.fill('input[value*="Organization"]', orgName)
    
    // Switch back to Profile tab
    await page.click('button:has-text("Profile")')
    await page.waitForTimeout(500)
    
    // Verify Profile data is still there
    await expect(page.locator(`input[value="${profileName}"]`)).toBeVisible()
    
    // Switch back to Organization tab
    await page.click('button:has-text("Organization")')
    await page.waitForTimeout(500)
    
    // Verify Organization data is still there
    await expect(page.locator(`input[value="${orgName}"]`)).toBeVisible()
  })

  test('Should show loading state while saving', async ({ page }) => {
    // Click on Profile tab
    await page.click('button:has-text("Profile")')
    
    // Make a change
    await page.fill('input[value*="Full Name"]', 'Loading Test User')
    
    // Click Save button
    await page.click('button:has-text("Save Changes")')
    
    // Check for loading state
    await expect(page.locator('button:has-text("Saving...")')).toBeVisible()
    await expect(page.locator('button:has-text("Saving...") svg.animate-spin')).toBeVisible()
    
    // Button should be disabled while saving
    await expect(page.locator('button:has-text("Saving...")')).toBeDisabled()
    
    // After saving, button should be enabled again
    await expect(page.locator('button:has-text("Save Changes")')).toBeEnabled({ timeout: 5000 })
  })

  test('Should validate required fields', async ({ page }) => {
    // Click on Profile tab
    await page.click('button:has-text("Profile")')
    
    // Clear required fields
    await page.fill('input[type="email"]', '')
    
    // Try to save
    await page.click('button:has-text("Save Changes")')
    
    // Should show validation error (browser native or custom)
    const emailInput = page.locator('input[type="email"]')
    await expect(emailInput).toHaveAttribute('required', '')
  })

  test('Should handle profile photo upload button', async ({ page }) => {
    // Click on Profile tab
    await page.click('button:has-text("Profile")')
    
    // Check upload button exists
    await expect(page.locator('button:has-text("Upload Photo")')).toBeVisible()
    
    // Check file size limit text
    await expect(page.locator('text=JPG, PNG or GIF, max 2MB')).toBeVisible()
  })

  test('Should display organization call settings correctly', async ({ page }) => {
    // Click on Organization tab
    await page.click('button:has-text("Organization")')
    await page.waitForTimeout(500)
    
    // Check all call setting checkboxes are visible
    await expect(page.locator('text=Auto-record all calls')).toBeVisible()
    await expect(page.locator('text=Enable call transcription')).toBeVisible()
    await expect(page.locator('text=Require call notes')).toBeVisible()
    await expect(page.locator('text=Enable AI analysis')).toBeVisible()
    
    // Verify checkboxes can be toggled
    const autoRecordCheckbox = page.locator('input[type="checkbox"]').first()
    const initialState = await autoRecordCheckbox.isChecked()
    
    await autoRecordCheckbox.click()
    expect(await autoRecordCheckbox.isChecked()).toBe(!initialState)
    
    await autoRecordCheckbox.click()
    expect(await autoRecordCheckbox.isChecked()).toBe(initialState)
  })
})

// Integration test for complete settings flow
test.describe('Settings Integration Tests', () => {
  const baseURL = 'http://localhost:3035'
  
  test('Complete settings workflow', async ({ page }) => {
    await page.goto(`${baseURL}/dashboard/settings`)
    
    // Test Profile Settings
    await page.click('button:has-text("Profile")')
    await page.fill('input[value*="Full Name"]', 'Integration Test User')
    await page.fill('input[type="tel"]', '+1 (555) 999-8888')
    
    // Test Organization Settings
    await page.click('button:has-text("Organization")')
    await page.fill('input[value*="Organization"]', 'Integration Test Org')
    await page.check('input[type="checkbox"]').first()
    
    // Test Notifications Settings
    await page.click('button:has-text("Notifications")')
    await page.check('input[type="checkbox"]').nth(0)
    await page.uncheck('input[type="checkbox"]').nth(1)
    
    // Save all changes
    await page.click('button:has-text("Save Changes")')
    
    // Wait for success
    await expect(page.locator('text=Settings saved successfully')).toBeVisible({ timeout: 5000 })
    
    // Reload page to verify persistence
    await page.reload()
    await page.waitForLoadState('networkidle')
    
    // Verify Profile data persisted
    await page.click('button:has-text("Profile")')
    await expect(page.locator('input[value="Integration Test User"]')).toBeVisible()
    
    // Verify Organization data persisted
    await page.click('button:has-text("Organization")')
    await expect(page.locator('input[value="Integration Test Org"]')).toBeVisible()
  })
})