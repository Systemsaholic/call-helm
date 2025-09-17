import { test, expect } from '@playwright/test'
import path from 'path'

test.describe('Call List CSV Upload and Creation', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to Call Lists page
    // Authentication is handled by the setup project
    await page.goto('/dashboard/call-lists')
    await page.waitForURL('**/dashboard/call-lists')
  })

  test('should upload CSV and create call list', async ({ page }) => {
    // Initial count of call lists
    const initialCount = await page.locator('table tbody tr').count()
    console.log(`Initial call lists count: ${initialCount}`)

    // Click Create Call List button
    await page.click('button:has-text("Create Call List")')
    
    // Wait for wizard modal
    await expect(page.getByRole('dialog')).toBeVisible()
    
    // Step 1: Choose CSV Upload method
    await page.click('text=Upload CSV')
    await expect(page.locator('button:has-text("Next")')).toBeEnabled()
    await page.click('button:has-text("Next")')
    
    // Step 2: Upload CSV file
    await expect(page.getByText('Drag & drop your CSV file here')).toBeVisible()
    
    // Upload the test CSV file
    const csvPath = path.join(__dirname, '..', 'test-contacts.csv')
    const fileInput = await page.locator('input[type="file"]')
    await fileInput.setInputFiles(csvPath)
    
    // Wait for file to be processed
    await expect(page.getByText('Successfully uploaded 25 contacts')).toBeVisible({ timeout: 10000 })
    
    // Verify preview is shown
    await expect(page.getByText('Preview (showing first 5)')).toBeVisible()
    await expect(page.getByText('John Smith')).toBeVisible()
    await expect(page.getByText('john.smith@techcorp.com')).toBeVisible()
    
    // Continue to next step
    await page.click('button:has-text("Next")')
    
    // Step 3: Fill in Call List details
    await expect(page.getByText('List Details')).toBeVisible()
    
    // Fill in the form
    await page.fill('input#name', 'Q4 Sales Campaign - Test CSV Upload')
    await page.fill('textarea#description', 'Testing CSV upload functionality with 25 high-value prospects')
    
    // Select campaign type - click the button that shows the current value
    await page.locator('button:has-text("Marketing")').click()
    await page.locator('[role="option"]:has-text("Sales")').click()
    
    // Select priority - click the button that shows the current value  
    await page.locator('button:has-text("Medium")').click()
    await page.locator('[role="option"]:has-text("High")').click()
    
    // Select distribution strategy - already set to Round Robin by default, skip this step
    
    await page.click('button:has-text("Next")')
    
    // Step 4: Add Tags
    await expect(page.getByText('Add Tags').first()).toBeVisible()
    
    // Add custom tags
    const tagInput = page.locator('input[placeholder*="Add a tag"]')
    await tagInput.fill('q4-campaign')
    await tagInput.press('Enter')
    await expect(page.locator('text=q4-campaign').first()).toBeVisible()
    
    await tagInput.fill('csv-import')
    await tagInput.press('Enter')
    await expect(page.locator('text=csv-import').first()).toBeVisible()
    
    // Click on a suggested tag
    const suggestedTags = page.locator('text=hot-lead')
    if (await suggestedTags.count() > 0) {
      await suggestedTags.first().click()
    }
    
    await page.click('button:has-text("Next")')
    
    // Step 5: Generate Script
    await expect(page.getByText('Generate Script').first()).toBeVisible()
    
    // Generate a script
    await page.click('button:has-text("Generate Script")')
    
    // Wait for script to be generated
    await expect(page.getByText('Generated Script')).toBeVisible({ timeout: 5000 })
    
    // Verify script content appears
    await expect(page.locator('textarea').first()).toBeVisible()
    
    // Script is already in edit mode, add a custom line
    const textarea = page.locator('textarea').first()
    const currentScript = await textarea.inputValue()
    await textarea.fill(currentScript + '\n\n[Custom note: Imported from CSV test file]')
    
    await page.click('button:has-text("Next")')
    
    // Step 6: Review & Create
    await expect(page.getByText('Review Your Call List')).toBeVisible()
    
    // Verify summary information
    await expect(page.getByText('Q4 Sales Campaign - Test CSV Upload')).toBeVisible()
    await expect(page.getByText('25 contacts')).toBeVisible()
    await expect(page.getByText('Round Robin')).toBeVisible()
    await expect(page.getByText('P3')).toBeVisible() // High priority
    
    // Verify tags are shown
    await expect(page.getByText('q4-campaign')).toBeVisible()
    await expect(page.getByText('csv-import')).toBeVisible()
    
    // Create the call list
    const createButton = page.locator('button:has-text("Create Call List")')
    await expect(createButton).toBeEnabled()
    await createButton.click()
    
    // Wait for creation to complete
    await expect(page.getByText('Creating...')).toBeVisible()
    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 10000 })
    
    // Verify success toast
    await expect(page.getByText('Call list created successfully')).toBeVisible()
    
    // Verify the new call list appears in the table
    await expect(page.getByText('Q4 Sales Campaign - Test CSV Upload')).toBeVisible()
    
    // Verify contact count
    await expect(page.getByText('25 total')).toBeVisible()
    
    // Final count should be increased by 1
    const finalCount = await page.locator('table tbody tr').count()
    expect(finalCount).toBe(initialCount + 1)
  })

  test('should validate CSV format', async ({ page }) => {
    // Create an invalid CSV file
    const invalidCSV = `invalid_header1,invalid_header2
    value1,value2
    value3,value4`
    
    // Click Create Call List button
    await page.click('button:has-text("Create Call List")')
    
    // Choose CSV Upload
    await page.click('text=Upload CSV')
    await page.click('button:has-text("Next")')
    
    // Try to upload invalid CSV
    const fileInput = await page.locator('input[type="file"]')
    const buffer = Buffer.from(invalidCSV, 'utf-8')
    await fileInput.setInputFiles({
      name: 'invalid.csv',
      mimeType: 'text/csv',
      buffer: buffer
    })
    
    // Should show error message
    await expect(page.getByText('CSV must contain at least name, email, or phone columns')).toBeVisible({ timeout: 5000 })
  })

  test('should handle duplicate prevention in CSV', async ({ page }) => {
    // Upload the same CSV twice to test duplicate handling
    const csvPath = path.join(__dirname, '..', 'test-contacts.csv')
    
    // First upload
    await page.click('button:has-text("Create Call List")')
    await page.click('text=Upload CSV')
    await page.click('button:has-text("Next")')
    
    const fileInput = await page.locator('input[type="file"]')
    await fileInput.setInputFiles(csvPath)
    
    await expect(page.getByText('Successfully uploaded 25 contacts')).toBeVisible({ timeout: 10000 })
    
    // Clear and re-upload
    await page.click('button[title*="Clear"]')
    await fileInput.setInputFiles(csvPath)
    
    // Should process successfully again
    await expect(page.getByText('Successfully uploaded 25 contacts')).toBeVisible({ timeout: 10000 })
  })

  test('should download CSV template', async ({ page }) => {
    // Click Create Call List button
    await page.click('button:has-text("Create Call List")')
    
    // Choose CSV Upload
    await page.click('text=Upload CSV')
    await page.click('button:has-text("Next")')
    
    // Download template
    const downloadPromise = page.waitForEvent('download')
    await page.click('button:has-text("Download Template")')
    const download = await downloadPromise
    
    // Verify filename
    expect(download.suggestedFilename()).toBe('contacts_template.csv')
    
    // Save and verify content
    const path = await download.path()
    if (path) {
      const fs = require('fs')
      const content = fs.readFileSync(path, 'utf-8')
      
      // Verify template structure
      expect(content).toContain('name,email,phone,company,notes,tags')
      expect(content).toContain('John Doe')
      expect(content).toContain('john@example.com')
    }
  })

  test('should process CSV with various tag formats', async ({ page }) => {
    // Create a CSV with different tag formats
    const csvWithTags = `name,email,phone,tags
    User One,user1@test.com,+11111111111,"tag1,tag2,tag3"
    User Two,user2@test.com,+12222222222,single-tag
    User Three,user3@test.com,+13333333333,"priority, vip, urgent"`
    
    // Upload CSV
    await page.click('button:has-text("Create Call List")')
    await page.click('text=Upload CSV')
    await page.click('button:has-text("Next")')
    
    const fileInput = await page.locator('input[type="file"]')
    const buffer = Buffer.from(csvWithTags, 'utf-8')
    await fileInput.setInputFiles({
      name: 'tags-test.csv',
      mimeType: 'text/csv',
      buffer: buffer
    })
    
    // Wait for processing
    await expect(page.getByText('Successfully uploaded 3 contacts')).toBeVisible({ timeout: 10000 })
    
    // Check preview shows tags
    const preview = page.locator('text=Preview')
    if (await preview.isVisible()) {
      // Tags should be displayed as badges
      await expect(page.locator('.text-xs').filter({ hasText: 'tag1' })).toBeVisible()
    }
  })

  test('should handle large CSV file', async ({ page }) => {
    // Generate a larger CSV
    let largeCsv = 'name,email,phone,company\n'
    for (let i = 1; i <= 100; i++) {
      largeCsv += `Contact ${i},contact${i}@test.com,+1415555${String(i).padStart(4, '0')},Company ${i}\n`
    }
    
    // Upload large CSV
    await page.click('button:has-text("Create Call List")')
    await page.click('text=Upload CSV')
    await page.click('button:has-text("Next")')
    
    const fileInput = await page.locator('input[type="file"]')
    const buffer = Buffer.from(largeCsv, 'utf-8')
    await fileInput.setInputFiles({
      name: 'large-test.csv',
      mimeType: 'text/csv',
      buffer: buffer
    })
    
    // Should process successfully
    await expect(page.getByText('Successfully uploaded 100 contacts')).toBeVisible({ timeout: 15000 })
    
    // Preview should still show only first 5
    await expect(page.getByText('Preview (showing first 5)')).toBeVisible()
  })
})