import { test, expect } from '@playwright/test'

test.describe('Call List CSV Upload - Fixed Tests', () => {
  // Tests are pre-authenticated via Playwright storageState

  test('verify CSV upload functionality components exist', async ({ page }) => {
    // Navigate to call lists page (already authenticated via setup)
    await page.goto('/dashboard/call-lists')
    await page.waitForLoadState('networkidle')

    // Verify we're on the call lists page
    await expect(page).toHaveURL(/\/dashboard\/call-lists/)

    // Verify Create Call List button exists
    const createButton = page.getByRole('button', { name: /create call list/i })
    await expect(createButton).toBeVisible()

    // Click to open wizard
    await createButton.click()

    // Verify wizard modal opens
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()

    // Verify CSV upload option exists
    await expect(page.getByText(/upload csv/i)).toBeVisible()

    // Close modal
    await page.keyboard.press('Escape')
  })
})
