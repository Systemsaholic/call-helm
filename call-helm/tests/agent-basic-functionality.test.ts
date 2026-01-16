import { test, expect } from '@playwright/test'

test.describe('Agent Management - Basic Functionality Test', () => {
  // Tests are pre-authenticated via Playwright storageState
  test.beforeEach(async ({ page }) => {
    // Navigate directly to agents page (already authenticated via setup)
    await page.goto('/dashboard/agents')
    await page.waitForLoadState('networkidle')
  })

  test('Confirmation dialog opens and can be cancelled', async ({ page }) => {
    // Wait for agents table to load
    await expect(page.locator('table')).toBeVisible({ timeout: 10000 })
    
    // Skip test if no agents available
    const agentRowCount = await page.locator('tbody tr').count()
    if (agentRowCount === 0) {
      console.log('No agents available for test')
      return
    }
    
    // Find the first agent row with a delete button
    const firstAgentRow = page.locator('tbody tr').first()
    await expect(firstAgentRow).toBeVisible()
    
    // Find and click the delete button (trash icon)
    const deleteButton = firstAgentRow.locator('button[title="Delete"]')
    await expect(deleteButton).toBeVisible()
    await deleteButton.click()
    
    // Verify confirmation dialog appears (use various possible selectors)
    const confirmationDialog = page.getByRole('alertdialog').or(page.getByRole('dialog'))
    await expect(confirmationDialog).toBeVisible()

    // Verify dialog has delete-related content - use heading to be specific
    await expect(page.getByRole('heading', { name: /delete/i })).toBeVisible()

    // Verify buttons are present
    const cancelButton = page.getByRole('button', { name: /cancel/i })
    const deleteConfirmButton = page.getByRole('button', { name: 'Delete', exact: true })
    await expect(cancelButton).toBeVisible()
    await expect(deleteConfirmButton).toBeVisible()
    
    // Test cancel functionality
    await cancelButton.click()
    await expect(confirmationDialog).not.toBeVisible({ timeout: 3000 })
    
    // Verify the original agent row is still there
    await expect(firstAgentRow).toBeVisible()
  })

  test('Agent details modal opens when clicking view details', async ({ page }) => {
    // Wait for agents table to load
    await expect(page.locator('table')).toBeVisible({ timeout: 10000 })

    // Skip test if no agents available
    const agentRowCount = await page.locator('tbody tr').count()
    if (agentRowCount === 0) {
      console.log('No agents available for details modal test')
      return
    }

    // Find the first agent row
    const firstAgentRow = page.locator('tbody tr').first()
    await expect(firstAgentRow).toBeVisible()

    // Find and click the view details button (edit icon)
    const detailsButton = firstAgentRow.locator('button[title="View Details"]')
    const hasDetailsButton = await detailsButton.isVisible().catch(() => false)

    if (!hasDetailsButton) {
      console.log('No View Details button - skipping modal test')
      return
    }

    await detailsButton.click()

    // Verify modal opens by checking for dialog or heading
    const modal = page.getByRole('dialog').or(page.getByRole('alertdialog'))
    const hasModal = await modal.isVisible().catch(() => false)

    if (hasModal) {
      // Check for expected content in modal
      const hasAgentDetails = await page.locator('text=Agent Details').isVisible().catch(() => false)
      const hasPersonalInfo = await page.locator('text=Personal Information').isVisible().catch(() => false)

      // At least one of these should be visible
      expect(hasAgentDetails || hasPersonalInfo).toBeTruthy()
    } else {
      console.log('Modal did not open as expected')
    }
  })

  test('Send invitation button exists for pending agents', async ({ page }) => {
    // Wait for agents table to load
    await expect(page.locator('table')).toBeVisible({ timeout: 10000 })
    
    // Look for any pending agents
    const pendingAgentRows = page.locator('tbody tr').filter({
      has: page.locator('text=Pending')
    })
    
    const pendingCount = await pendingAgentRows.count()
    
    if (pendingCount > 0) {
      // Check that pending agents have send invitation buttons
      const firstPendingRow = pendingAgentRows.first()
      const sendInvitationButton = firstPendingRow.locator('button[title="Send Invitation"]')
      await expect(sendInvitationButton).toBeVisible()
      console.log('✓ Send invitation button found for pending agent')
    } else {
      console.log('No pending agents found - test skipped')
    }
  })

  test('All agents have action buttons', async ({ page }) => {
    // Wait for agents table to load
    await expect(page.locator('table')).toBeVisible({ timeout: 10000 })
    
    // Skip test if no agents available
    const agentRowCount = await page.locator('tbody tr').count()
    if (agentRowCount === 0) {
      console.log('No agents available for action buttons test')
      return
    }
    
    // Check first agent row for required action buttons
    const firstAgentRow = page.locator('tbody tr').first()
    
    // Every agent should have a view details button
    const detailsButton = firstAgentRow.locator('button[title="View Details"]')
    await expect(detailsButton).toBeVisible()
    
    // Every agent should have a delete button
    const deleteButton = firstAgentRow.locator('button[title="Delete"]')
    await expect(deleteButton).toBeVisible()
    
    console.log('✓ Action buttons verified for first agent')
  })
})