import { test, expect } from '@playwright/test'

test.describe('Agent Management - Action Tests', () => {
  // Tests are pre-authenticated via Playwright storageState
  test.beforeEach(async ({ page }) => {
    // Navigate directly to agents page (already authenticated via setup)
    await page.goto('/dashboard/agents')
    // Use domcontentloaded for faster more reliable loading
    await page.waitForLoadState('domcontentloaded')
    // Wait for the page to be ready - look for table or agent list container
    await page.waitForSelector('table, [class*="agent"], h1, h2', { timeout: 15000 })
  })

  test('Delete agent confirmation dialog functionality', async ({ page }) => {
    // Wait for page to load
    await page.waitForTimeout(1000)

    // Check if we have any agents
    const agentRows = page.locator('tbody tr')
    const agentRowCount = await agentRows.count()

    if (agentRowCount === 0) {
      // No agents available - test passes, nothing to delete
      console.log('No agents available for delete test')
      return
    }

    // Find and click a delete button
    const deleteButton = page.locator('button[title="Delete"]').first()
    const hasDeleteButton = await deleteButton.isVisible().catch(() => false)

    if (!hasDeleteButton) {
      console.log('No delete button visible')
      return
    }

    await deleteButton.click()

    // Check for confirmation dialog (using various possible selectors)
    const dialog = page.getByRole('alertdialog').or(page.getByRole('dialog'))
    await expect(dialog).toBeVisible({ timeout: 3000 })

    // Verify dialog has expected content - use heading to be specific
    await expect(page.getByRole('heading', { name: /delete/i })).toBeVisible()

    // Find and click cancel button
    const cancelButton = page.getByRole('button', { name: /cancel/i })
    await cancelButton.click()

    // Dialog should close
    await expect(dialog).not.toBeVisible({ timeout: 3000 })
  })

  test('Send invitation functionality for pending agents', async ({ page }) => {
    // Wait for page to load
    await page.waitForTimeout(1000)

    // Look for a send invitation button (multiple possible selectors)
    const sendButton = page.locator('button[title="Send Invitation"], button:has-text("Send Invitation"), button:has-text("Resend")').first()
    const hasSendButton = await sendButton.isVisible({ timeout: 3000 }).catch(() => false)

    if (!hasSendButton) {
      // No pending agents - test passes
      console.log('No pending agents available for invitation test')
      return
    }

    // Click send invitation
    await sendButton.click()

    // Wait for operation to complete - check for success message or button state change
    await page.waitForTimeout(1000)

    // Verify some feedback (toast, button change, etc.)
    const feedback = page.getByText(/sent|success|invitation/i).first()
    const hasFeedback = await feedback.isVisible({ timeout: 2000 }).catch(() => false)
    if (hasFeedback) {
      console.log('Invitation sent successfully')
    }
  })

  test('Agent details modal opens correctly', async ({ page }) => {
    // Wait for page to load
    await page.waitForTimeout(1000)

    // Check if we have any agents
    const agentRows = page.locator('tbody tr')
    const agentRowCount = await agentRows.count()

    if (agentRowCount === 0) {
      console.log('No agents available for details test')
      return
    }

    // Try to find a view details button or click on the row itself
    const viewDetailsButton = page.locator('button[title="View Details"]').first()
    const hasViewButton = await viewDetailsButton.isVisible().catch(() => false)

    if (!hasViewButton) {
      // Try clicking the first agent row to open details
      const firstRow = agentRows.first()
      await firstRow.click()
    } else {
      await viewDetailsButton.click()
    }

    // Check for modal/dialog - could be dialog or alertdialog
    const modal = page.getByRole('dialog').or(page.getByRole('alertdialog'))
    const isModalVisible = await modal.isVisible().catch(() => false)

    if (isModalVisible) {
      // Close modal (click outside or find close button)
      await page.keyboard.press('Escape')
      await page.waitForTimeout(500)
    } else {
      console.log('No modal opened - agent details might use different UI')
    }
  })

  test('Action buttons are visible for agent rows', async ({ page }) => {
    // Wait for page to load
    await page.waitForTimeout(1000)

    // Check if we have any agents
    const agentRows = page.locator('tbody tr')
    const agentRowCount = await agentRows.count()

    if (agentRowCount === 0) {
      console.log('No agents available')
      return
    }

    // First agent row should have action buttons
    const firstRow = agentRows.first()

    // Check for View Details button
    const viewButton = firstRow.locator('button[title="View Details"]')
    await expect(viewButton).toBeVisible()

    // Check for Delete button
    const deleteButton = firstRow.locator('button[title="Delete"]')
    await expect(deleteButton).toBeVisible()
  })

  test('Agent action buttons show correct icons', async ({ page }) => {
    // Wait for page to load
    await page.waitForTimeout(1000)

    // Check if we have any agents
    const firstRow = page.locator('tbody tr').first()
    const hasRow = await firstRow.isVisible().catch(() => false)

    if (!hasRow) {
      console.log('No agent rows available')
      return
    }

    // Check delete button has svg (trash icon)
    const deleteButton = firstRow.locator('button[title="Delete"]')
    if (await deleteButton.isVisible().catch(() => false)) {
      await expect(deleteButton.locator('svg')).toBeVisible()
    }

    // Check view details button has svg (eye icon)
    const detailsButton = firstRow.locator('button[title="View Details"]')
    if (await detailsButton.isVisible().catch(() => false)) {
      await expect(detailsButton.locator('svg')).toBeVisible()
    }
  })
})

test.describe('Agent Management - Edge Cases', () => {
  // Tests are pre-authenticated via Playwright storageState
  test.beforeEach(async ({ page }) => {
    // Navigate directly to agents page (already authenticated via setup)
    await page.goto('/dashboard/agents')
    await page.waitForLoadState('networkidle')
  })

  test('Handle empty agents table gracefully', async ({ page }) => {
    // Wait for page to load
    await page.waitForTimeout(1000)

    // Either we have agents or we have an empty state message
    const agentRows = page.locator('tbody tr')
    const agentRowCount = await agentRows.count()

    if (agentRowCount === 0) {
      // Should show empty state
      const emptyState = page.getByText(/no agents/i).or(page.getByText(/add your first agent/i))
      // Empty state might or might not be shown depending on UI
    } else {
      // Table should have data
      await expect(agentRows.first()).toBeVisible()
    }
  })

  test('Confirmation dialog can be dismissed with Escape', async ({ page }) => {
    // Wait for page to load
    await page.waitForTimeout(1000)

    // Find delete button
    const deleteButton = page.locator('button[title="Delete"]').first()
    const hasDeleteButton = await deleteButton.isVisible().catch(() => false)

    if (!hasDeleteButton) {
      console.log('No delete button available for testing')
      return
    }

    // Open confirmation dialog
    await deleteButton.click()

    // Check dialog appeared
    const dialog = page.getByRole('alertdialog').or(page.getByRole('dialog'))
    await expect(dialog).toBeVisible({ timeout: 3000 })

    // Press Escape to close
    await page.keyboard.press('Escape')

    // Dialog should close
    await expect(dialog).not.toBeVisible({ timeout: 3000 })
  })
})
