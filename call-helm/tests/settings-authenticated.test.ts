import { test, expect } from '@playwright/test'

test.describe('Settings Page - Authenticated Tests', () => {
  const baseURL = 'http://localhost:3035'
  const credentials = {
    email: 'al@kaponline.com',
    password: '123Hammond!'
  }

  test.beforeEach(async ({ page }) => {
    // Navigate to login page
    await page.goto(`${baseURL}/auth/login`)
    
    // Perform login
    await page.fill('input[type="email"]', credentials.email)
    await page.fill('input[type="password"]', credentials.password)
    await page.click('button[type="submit"]:has-text("Sign in")')
    
    // Wait for navigation to dashboard
    await page.waitForURL('**/dashboard', { timeout: 10000 })
    
    // Navigate to settings
    await page.goto(`${baseURL}/dashboard/settings`)
    await page.waitForLoadState('networkidle')
  })

  test('Profile Settings - Save personal information', async ({ page }) => {
    // Ensure we're on the Profile tab (should be default)
    const profileTab = page.locator('button:has-text("Profile")')
    await expect(profileTab).toHaveClass(/bg-primary/)
    
    // Wait for content to load
    await expect(page.locator('text=Personal Information')).toBeVisible()
    
    // Fill in profile information
    const fullNameInput = page.locator('input').nth(0)
    await fullNameInput.clear()
    await fullNameInput.fill('Al Guertin Updated')
    
    const emailInput = page.locator('input[type="email"]')
    await emailInput.clear()
    await emailInput.fill('al@kaponline.com')
    
    const phoneInput = page.locator('input[type="tel"]')
    await phoneInput.clear()
    await phoneInput.fill('+1 (555) 123-4567')
    
    // Select timezone
    const timezoneSelect = page.locator('select').first()
    await timezoneSelect.selectOption('Pacific Time (PT)')
    
    // Click Save button
    const saveButton = page.locator('button:has-text("Save Changes")')
    await saveButton.click()
    
    // Verify loading state
    await expect(page.locator('text=Saving...')).toBeVisible()
    await expect(saveButton).toBeDisabled()
    
    // Wait for success message
    await expect(page.locator('text=Settings saved successfully')).toBeVisible({ timeout: 5000 })
    
    // Verify button returns to normal state
    await expect(saveButton).toContainText('Save Changes')
    await expect(saveButton).toBeEnabled()
    
    // Verify values persist
    await expect(fullNameInput).toHaveValue('Al Guertin Updated')
    await expect(phoneInput).toHaveValue('+1 (555) 123-4567')
  })

  test('Organization Settings - Save organization details and preferences', async ({ page }) => {
    // Click on Organization tab
    const orgTab = page.locator('button:has-text("Organization")')
    await orgTab.click()
    
    // Wait for tab content to load
    await expect(page.locator('text=Organization Details')).toBeVisible()
    
    // Fill in organization information
    const orgNameInput = page.locator('input').nth(0)
    await orgNameInput.clear()
    await orgNameInput.fill('KAP Online Solutions')
    
    const websiteInput = page.locator('input[placeholder*="https://example.com"]')
    await websiteInput.clear()
    await websiteInput.fill('https://kaponline.com')
    
    // Select language
    const languageSelect = page.locator('select').nth(0)
    await languageSelect.selectOption('en')
    
    // Select date format
    const dateFormatSelect = page.locator('select').nth(1)
    await dateFormatSelect.selectOption('MM/DD/YYYY')
    
    // Toggle call settings
    const autoRecordCheckbox = page.locator('text=Auto-record all calls').locator('..').locator('input[type="checkbox"]')
    await autoRecordCheckbox.check()
    
    const transcriptionCheckbox = page.locator('text=Enable call transcription').locator('..').locator('input[type="checkbox"]')
    await transcriptionCheckbox.check()
    
    const aiAnalysisCheckbox = page.locator('text=Enable AI analysis').locator('..').locator('input[type="checkbox"]')
    await aiAnalysisCheckbox.check()
    
    // Save changes
    const saveButton = page.locator('button:has-text("Save Changes")')
    await saveButton.click()
    
    // Verify save process
    await expect(page.locator('text=Saving...')).toBeVisible()
    await expect(page.locator('text=Settings saved successfully')).toBeVisible({ timeout: 5000 })
    
    // Verify values persist
    await expect(orgNameInput).toHaveValue('KAP Online Solutions')
    await expect(websiteInput).toHaveValue('https://kaponline.com')
  })

  test('Tab switching preserves unsaved data', async ({ page }) => {
    // Start on Profile tab
    const profileTab = page.locator('button:has-text("Profile")')
    await profileTab.click()
    
    // Enter profile data
    const fullNameInput = page.locator('input').nth(0)
    await fullNameInput.clear()
    await fullNameInput.fill('Test Name - Not Saved')
    
    // Switch to Organization tab
    const orgTab = page.locator('button:has-text("Organization")')
    await orgTab.click()
    await page.waitForTimeout(500)
    
    // Enter organization data
    const orgNameInput = page.locator('input').nth(0)
    await orgNameInput.clear()
    await orgNameInput.fill('Test Org - Not Saved')
    
    // Switch back to Profile tab
    await profileTab.click()
    await page.waitForTimeout(500)
    
    // Verify profile data is still there
    const profileValue = await page.locator('input').nth(0).inputValue()
    expect(profileValue).toBe('Test Name - Not Saved')
    
    // Switch back to Organization tab
    await orgTab.click()
    await page.waitForTimeout(500)
    
    // Verify organization data is still there
    const orgValue = await page.locator('input').nth(0).inputValue()
    expect(orgValue).toBe('Test Org - Not Saved')
  })

  test('Notification Settings - Toggle email and push notifications', async ({ page }) => {
    // Click on Notifications tab
    const notificationsTab = page.locator('button:has-text("Notifications")')
    await notificationsTab.click()
    
    // Wait for content
    await expect(page.locator('text=Email Notifications')).toBeVisible()
    
    // Toggle email notifications
    const callSummariesCheckbox = page.locator('text=Call Summaries').locator('../..').locator('input[type="checkbox"]')
    const initialCallState = await callSummariesCheckbox.isChecked()
    await callSummariesCheckbox.click()
    expect(await callSummariesCheckbox.isChecked()).toBe(!initialCallState)
    
    const weeklyReportsCheckbox = page.locator('text=Weekly Reports').locator('../..').locator('input[type="checkbox"]')
    const initialReportState = await weeklyReportsCheckbox.isChecked()
    await weeklyReportsCheckbox.click()
    expect(await weeklyReportsCheckbox.isChecked()).toBe(!initialReportState)
    
    // Save changes
    const saveButton = page.locator('button:has-text("Save Changes")')
    await saveButton.click()
    
    // Verify save
    await expect(page.locator('text=Settings saved successfully')).toBeVisible({ timeout: 5000 })
  })

  test('All settings tabs are accessible and functional', async ({ page }) => {
    const tabs = [
      { name: 'Profile', content: 'Personal Information' },
      { name: 'Organization', content: 'Organization Details' },
      { name: 'Notifications', content: 'Email Notifications' },
      { name: 'Billing', content: 'Current Plan' },
      { name: 'API Keys', content: 'API Keys' },
      { name: 'Integrations', content: 'Available Integrations' },
      { name: 'Security', content: 'Password & Authentication' }
    ]
    
    for (const tab of tabs) {
      // Click the tab
      const tabButton = page.locator(`button:has-text("${tab.name}")`)
      await tabButton.click()
      
      // Wait for content to load
      await page.waitForTimeout(500)
      
      // Verify tab is active (has primary color)
      await expect(tabButton).toHaveClass(/bg-primary/)
      
      // Verify content is visible
      await expect(page.locator(`text=${tab.content}`)).toBeVisible({ timeout: 5000 })
    }
  })

  test('Save button states and loading indicator', async ({ page }) => {
    // Go to Profile tab
    const profileTab = page.locator('button:has-text("Profile")')
    await profileTab.click()
    
    // Get save button
    const saveButton = page.locator('button:has-text("Save Changes")')
    
    // Initial state
    await expect(saveButton).toBeEnabled()
    await expect(saveButton).toContainText('Save Changes')
    
    // Make a change
    const input = page.locator('input').nth(0)
    await input.clear()
    await input.fill('Testing Save States')
    
    // Click save
    await saveButton.click()
    
    // Check loading state
    await expect(saveButton).toContainText('Saving...')
    await expect(saveButton).toBeDisabled()
    
    // Check for spinner
    const spinner = saveButton.locator('svg.animate-spin')
    await expect(spinner).toBeVisible()
    
    // Wait for completion
    await expect(saveButton).toContainText('Save Changes', { timeout: 5000 })
    await expect(saveButton).toBeEnabled()
    
    // Check success message with checkmark
    const successMessage = page.locator('text=Settings saved successfully')
    await expect(successMessage).toBeVisible()
    const checkIcon = page.locator('svg').filter({ has: page.locator('text=Settings saved successfully') })
    await expect(checkIcon.first()).toBeVisible()
  })

  test('Billing section displays plan information', async ({ page }) => {
    // Navigate to Billing tab
    const billingTab = page.locator('button:has-text("Billing")')
    await billingTab.click()
    
    // Wait for content
    await expect(page.locator('text=Current Plan')).toBeVisible()
    
    // Check for plan details
    await expect(page.locator('text=Professional Plan')).toBeVisible()
    await expect(page.locator('text=$99/month')).toBeVisible()
    
    // Check for upgrade button
    const upgradeButton = page.locator('button:has-text("Upgrade Plan")')
    await expect(upgradeButton).toBeVisible()
    
    // Check for payment method section
    await expect(page.locator('text=Payment Method')).toBeVisible()
    await expect(page.locator('text=**** **** **** 4242')).toBeVisible()
  })

  test('API Keys section with security warning', async ({ page }) => {
    // Navigate to API Keys tab
    const apiTab = page.locator('button:has-text("API Keys")')
    await apiTab.click()
    
    // Wait for content
    await expect(page.locator('h3:has-text("API Keys")')).toBeVisible()
    
    // Check for security warning
    await expect(page.locator('text=Keep your API keys secure')).toBeVisible()
    
    // Check for API key display
    await expect(page.locator('text=Production API Key')).toBeVisible()
    await expect(page.locator('text=ch_live_sk_')).toBeVisible()
    
    // Check for generate button
    const generateButton = page.locator('button:has-text("Generate New API Key")')
    await expect(generateButton).toBeVisible()
  })
})

test.describe('Settings Integration Flow', () => {
  const baseURL = 'http://localhost:3035'
  const credentials = {
    email: 'al@kaponline.com',
    password: '123Hammond!'
  }

  test('Complete settings workflow - Update multiple sections and save', async ({ page }) => {
    // Login
    await page.goto(`${baseURL}/auth/login`)
    await page.fill('input[type="email"]', credentials.email)
    await page.fill('input[type="password"]', credentials.password)
    await page.click('button[type="submit"]:has-text("Sign in")')
    await page.waitForURL('**/dashboard', { timeout: 10000 })
    
    // Go to settings
    await page.goto(`${baseURL}/dashboard/settings`)
    
    // Update Profile
    await page.locator('button:has-text("Profile")').click()
    const nameInput = page.locator('input').nth(0)
    await nameInput.clear()
    await nameInput.fill('Al Guertin - Integration Test')
    
    // Update Organization
    await page.locator('button:has-text("Organization")').click()
    const orgInput = page.locator('input').nth(0)
    await orgInput.clear()
    await orgInput.fill('KAP Online - Test')
    
    // Update Notifications
    await page.locator('button:has-text("Notifications")').click()
    const firstCheckbox = page.locator('input[type="checkbox"]').nth(0)
    await firstCheckbox.check()
    
    // Save all changes
    const saveButton = page.locator('button:has-text("Save Changes")')
    await saveButton.click()
    
    // Verify save completed
    await expect(page.locator('text=Settings saved successfully')).toBeVisible({ timeout: 5000 })
    
    // Refresh page to verify persistence
    await page.reload()
    await page.waitForLoadState('networkidle')
    
    // Verify Profile data persisted
    await page.locator('button:has-text("Profile")').click()
    await expect(page.locator('input').nth(0)).toHaveValue('Al Guertin - Integration Test')
    
    // Verify Organization data persisted
    await page.locator('button:has-text("Organization")').click()
    await expect(page.locator('input').nth(0)).toHaveValue('KAP Online - Test')
  })
})