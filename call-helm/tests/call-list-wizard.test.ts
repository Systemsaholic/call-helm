import { test, expect } from '@playwright/test'

// Test data
const testCredentials = {
  email: 'test@example.com',
  password: 'Test123456!@#'
}

test.describe('Call List Creation Wizard', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to login page
    await page.goto('/auth/signin')
    
    // Login
    await page.fill('input[name="email"]', testCredentials.email)
    await page.fill('input[name="password"]', testCredentials.password)
    await page.click('button[type="submit"]')
    
    // Wait for dashboard
    await page.waitForURL('**/dashboard')
    
    // Navigate to Call Lists page
    await page.click('text=Call Lists')
    await page.waitForURL('**/dashboard/call-lists')
  })

  test('should open Call List creation wizard', async ({ page }) => {
    // Click Create Call List button
    await page.click('button:has-text("Create Call List")')
    
    // Verify wizard modal opens
    await expect(page.getByRole('dialog')).toBeVisible()
    await expect(page.getByText('Create Call List')).toBeVisible()
    await expect(page.getByText('Choose Method')).toBeVisible()
    
    // Verify both options are visible
    await expect(page.getByText('Upload CSV')).toBeVisible()
    await expect(page.getByText('Select Contacts')).toBeVisible()
  })

  test('should navigate through wizard steps', async ({ page }) => {
    // Open wizard
    await page.click('button:has-text("Create Call List")')
    
    // Step 1: Choose Method
    await expect(page.getByText('Choose Method')).toBeVisible()
    await page.click('text=Select Contacts')
    await page.click('button:has-text("Next")')
    
    // Step 2: Add Contacts
    await expect(page.getByText('Add Contacts')).toBeVisible()
    // In a real test, we would select some contacts here
    await page.click('button:has-text("Next")')
    
    // Step 3: List Details
    await expect(page.getByText('List Details')).toBeVisible()
    await page.fill('input#name', 'Test Campaign')
    await page.selectOption('select:near(:text("Campaign Type"))', 'sales')
    await page.click('button:has-text("Next")')
    
    // Step 4: Add Tags
    await expect(page.getByText('Add Tags')).toBeVisible()
    await page.fill('input[placeholder*="Add a tag"]', 'test-tag')
    await page.keyboard.press('Enter')
    await page.click('button:has-text("Next")')
    
    // Step 5: Generate Script
    await expect(page.getByText('Generate Script')).toBeVisible()
    await page.click('button:has-text("Generate Script")')
    await page.waitForTimeout(500) // Wait for script generation
    await page.click('button:has-text("Next")')
    
    // Step 6: Review & Create
    await expect(page.getByText('Review Your Call List')).toBeVisible()
    await expect(page.getByText('Test Campaign')).toBeVisible()
  })

  test('should handle CSV upload method', async ({ page }) => {
    // Open wizard
    await page.click('button:has-text("Create Call List")')
    
    // Choose CSV upload method
    await page.click('text=Upload CSV')
    await page.click('button:has-text("Next")')
    
    // Verify CSV upload interface
    await expect(page.getByText('Drag & drop your CSV file here')).toBeVisible()
    await expect(page.getByText('Download Template')).toBeVisible()
    
    // Test template download
    const downloadPromise = page.waitForEvent('download')
    await page.click('button:has-text("Download Template")')
    const download = await downloadPromise
    expect(download.suggestedFilename()).toBe('contacts_template.csv')
  })

  test('should show progress bar', async ({ page }) => {
    // Open wizard
    await page.click('button:has-text("Create Call List")')
    
    // Check progress bar is visible
    const progressBar = page.locator('[role="progressbar"]')
    await expect(progressBar).toBeVisible()
    
    // Initial progress should be at step 1
    await expect(progressBar).toHaveAttribute('aria-valuenow', '17') // ~1/6 = 16.67%
    
    // Move to next step
    await page.click('text=Select Contacts')
    await page.click('button:has-text("Next")')
    
    // Progress should increase
    await expect(progressBar).toHaveAttribute('aria-valuenow', '33') // ~2/6 = 33.33%
  })

  test('should handle back navigation', async ({ page }) => {
    // Open wizard
    await page.click('button:has-text("Create Call List")')
    
    // Go to step 2
    await page.click('text=Select Contacts')
    await page.click('button:has-text("Next")')
    
    // Verify on step 2
    await expect(page.getByText('Add Contacts')).toBeVisible()
    
    // Go back
    await page.click('button:has-text("Back")')
    
    // Should be back on step 1
    await expect(page.getByText('Choose Method')).toBeVisible()
  })

  test('should validate required fields', async ({ page }) => {
    // Open wizard
    await page.click('button:has-text("Create Call List")')
    
    // Try to proceed without selecting method
    const nextButton = page.locator('button:has-text("Next")')
    await expect(nextButton).toBeDisabled()
    
    // Select method
    await page.click('text=Select Contacts')
    await expect(nextButton).toBeEnabled()
    
    // Go to details step
    await page.click('button:has-text("Next")')
    await page.click('button:has-text("Next")') // Skip contacts for this test
    
    // Try to proceed without name
    await expect(nextButton).toBeDisabled()
    
    // Add name
    await page.fill('input#name', 'Test Campaign')
    await expect(nextButton).toBeEnabled()
  })

  test('should handle tag management', async ({ page }) => {
    // Open wizard and navigate to tags step
    await page.click('button:has-text("Create Call List")')
    await page.click('text=Select Contacts')
    await page.click('button:has-text("Next")')
    await page.click('button:has-text("Next")') // Skip contacts
    await page.fill('input#name', 'Test Campaign')
    await page.click('button:has-text("Next")')
    
    // Add tags
    const tagInput = page.locator('input[placeholder*="Add a tag"]')
    await tagInput.fill('priority')
    await tagInput.press('Enter')
    
    // Verify tag was added
    await expect(page.locator('text=priority').first()).toBeVisible()
    
    // Add another tag
    await tagInput.fill('vip')
    await tagInput.press('Enter')
    await expect(page.locator('text=vip').first()).toBeVisible()
    
    // Test suggested tags
    await expect(page.getByText('Suggested Tags')).toBeVisible()
  })

  test('should generate and edit script', async ({ page }) => {
    // Open wizard and navigate to script step
    await page.click('button:has-text("Create Call List")')
    await page.click('text=Select Contacts')
    await page.click('button:has-text("Next")')
    await page.click('button:has-text("Next")') // Skip contacts
    await page.fill('input#name', 'Test Sales Campaign')
    await page.selectOption('select:near(:text("Campaign Type"))', 'sales')
    await page.click('button:has-text("Next")')
    await page.click('button:has-text("Next")') // Skip tags
    
    // Generate script
    await page.click('button:has-text("Generate Script")')
    
    // Wait for script to be generated
    await page.waitForSelector('text=Generated Script', { timeout: 5000 })
    
    // Verify script content appears
    await expect(page.locator('.font-mono').first()).toContainText('Hello')
    
    // Test edit functionality
    await page.click('button:has-text("Edit")')
    await expect(page.locator('textarea')).toBeVisible()
    
    // Cancel edit
    await page.click('button:has-text("Cancel")')
    await expect(page.locator('textarea')).not.toBeVisible()
  })

  test('should show review summary', async ({ page }) => {
    // Complete wizard to review step
    await page.click('button:has-text("Create Call List")')
    await page.click('text=Select Contacts')
    await page.click('button:has-text("Next")')
    await page.click('button:has-text("Next")') // Skip contacts
    
    // Fill details
    await page.fill('input#name', 'Test Review Campaign')
    await page.selectOption('select:near(:text("Campaign Type"))', 'marketing')
    await page.selectOption('select:near(:text("Priority"))', '3') // High priority
    await page.selectOption('select:near(:text("Distribution Strategy"))', 'round_robin')
    await page.click('button:has-text("Next")')
    
    // Add tag
    await page.fill('input[placeholder*="Add a tag"]', 'test-review')
    await page.keyboard.press('Enter')
    await page.click('button:has-text("Next")')
    
    // Generate script
    await page.click('button:has-text("Generate Script")')
    await page.waitForTimeout(500)
    await page.click('button:has-text("Next")')
    
    // Verify review summary
    await expect(page.getByText('Review Your Call List')).toBeVisible()
    await expect(page.getByText('Test Review Campaign')).toBeVisible()
    await expect(page.getByText('marketing')).toBeVisible()
    await expect(page.getByText('Round Robin')).toBeVisible()
    await expect(page.getByText('P3')).toBeVisible()
    await expect(page.getByText('test-review')).toBeVisible()
  })
})