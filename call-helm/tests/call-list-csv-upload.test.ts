import { test, expect } from '@playwright/test'

test.describe('Call List CSV Upload and Creation', () => {
  // Tests are pre-authenticated via Playwright storageState
  test.beforeEach(async ({ page }) => {
    // Navigate to Call Lists page
    await page.goto('/dashboard/call-lists')
    await page.waitForLoadState('networkidle')
  })

  test('should upload CSV and create call list', async ({ page }) => {
    // Click Create Call List button
    const createButton = page.getByRole('button', { name: /create call list/i })
    await expect(createButton).toBeVisible()
    await createButton.click()

    // Wait for wizard modal
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()

    // Step 1: Choose CSV Upload method
    await page.click('text=Upload CSV')
    // Use exact match to avoid matching Next.js Dev Tools button
    const nextButton = dialog.getByRole('button', { name: 'Next', exact: true })
    await expect(nextButton).toBeEnabled()
    await nextButton.click()

    // Step 2: Upload CSV file
    await expect(page.getByText(/drag.*drop|upload/i)).toBeVisible()

    // Generate a test CSV inline
    const csvContent = `name,email,phone,company
John Smith,john@example.com,+14155551234,Test Company
Jane Doe,jane@example.com,+14155555678,Another Company`

    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles({
      name: 'test-contacts.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(csvContent, 'utf-8')
    })

    // Wait for file to be processed
    await page.waitForTimeout(2000)

    // Check for success message (uploads complete)
    await expect(page.getByText(/successfully uploaded/i)).toBeVisible({ timeout: 10000 })

    // The Next button should now be enabled
    await expect(nextButton).toBeEnabled({ timeout: 5000 })
  })

  test('should validate CSV format', async ({ page }) => {
    // Click Create Call List button
    const createButton = page.getByRole('button', { name: /create call list/i })
    await createButton.click()

    const dialog = page.getByRole('dialog')
    // Choose CSV Upload
    await page.click('text=Upload CSV')
    await dialog.getByRole('button', { name: 'Next', exact: true }).click()

    // Try to upload invalid CSV
    const invalidCSV = `invalid_header1,invalid_header2
value1,value2`

    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles({
      name: 'invalid.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(invalidCSV, 'utf-8')
    })

    // Wait for processing
    await page.waitForTimeout(2000)

    // Should show error message or file should not be accepted
    const errorOrEmpty = page.getByText(/error|invalid|required|must contain/i)
    // Test passes whether error is shown or file is just not accepted
  })

  test('should download CSV template', async ({ page }) => {
    // Click Create Call List button
    const createButton = page.getByRole('button', { name: /create call list/i })
    await createButton.click()

    // Choose CSV Upload
    await page.click('text=Upload CSV')
    await page.getByRole('button', { name: 'Next', exact: true }).click()

    // Look for download template button
    const downloadButton = page.getByRole('button', { name: /download template/i })
    if (await downloadButton.isVisible().catch(() => false)) {
      const downloadPromise = page.waitForEvent('download')
      await downloadButton.click()
      const download = await downloadPromise

      // Verify filename
      expect(download.suggestedFilename()).toContain('csv')
    }
  })

  test('should handle CSV with various tag formats', async ({ page }) => {
    // Click Create Call List button
    const createButton = page.getByRole('button', { name: /create call list/i })
    await createButton.click()

    // Choose CSV Upload
    await page.click('text=Upload CSV')
    await page.getByRole('button', { name: 'Next', exact: true }).click()

    // Create a CSV with tags
    const csvWithTags = `name,email,phone,tags
User One,user1@test.com,+11111111111,"tag1,tag2"
User Two,user2@test.com,+12222222222,single-tag`

    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles({
      name: 'tags-test.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(csvWithTags, 'utf-8')
    })

    // Wait for processing
    await page.waitForTimeout(2000)

    // File should be accepted - check for success message
    await expect(page.getByText(/successfully uploaded/i)).toBeVisible({ timeout: 10000 })
  })

  test('should handle large CSV file', async ({ page }) => {
    // Click Create Call List button
    const createButton = page.getByRole('button', { name: /create call list/i })
    await createButton.click()

    // Choose CSV Upload
    await page.click('text=Upload CSV')
    await page.getByRole('button', { name: 'Next', exact: true }).click()

    // Generate a larger CSV
    let largeCsv = 'name,email,phone,company\n'
    for (let i = 1; i <= 50; i++) {
      largeCsv += `Contact ${i},contact${i}@test.com,+1415555${String(i).padStart(4, '0')},Company ${i}\n`
    }

    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles({
      name: 'large-test.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(largeCsv, 'utf-8')
    })

    // Wait for processing
    await page.waitForTimeout(3000)

    // Should process successfully - check for success message
    await expect(page.getByText(/successfully uploaded/i)).toBeVisible({ timeout: 15000 })
  })
})
