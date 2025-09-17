import { test, expect } from '@playwright/test'

test.describe('Call List Basic Test', () => {
  test('should navigate to call lists and open create wizard', async ({ page }) => {
    // Navigate to Call Lists page (auth handled by setup)
    await page.goto('/dashboard/call-lists')
    
    // Verify we're on the call lists page
    await expect(page).toHaveURL(/.*\/dashboard\/call-lists/)
    await expect(page.getByRole('heading', { name: 'Call Lists', exact: true }).first()).toBeVisible()
    
    // Click Create Call List button
    await page.getByRole('button', { name: 'Create Call List' }).click()
    
    // Verify wizard opens
    await expect(page.getByRole('dialog')).toBeVisible()
    await expect(page.getByText('Create Call List').first()).toBeVisible()
    
    // Choose upload method
    await page.getByText('Upload CSV').click()
    
    // Verify Next button is enabled
    const nextButton = page.getByRole('button', { name: 'Next', exact: true })
    await expect(nextButton).toBeEnabled()
    
    // Click Next
    await nextButton.click()
    
    // Verify we're on the upload step
    await expect(page.getByText('Drag & drop your CSV file here')).toBeVisible()
    
    console.log('✅ Basic test passed!')
  })
})