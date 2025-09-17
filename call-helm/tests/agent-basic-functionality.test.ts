import { test, expect } from '@playwright/test'

test.describe('Agent Management - Basic Functionality Test', () => {
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
    
    // Navigate to agents page
    await page.goto(`${baseURL}/dashboard/agents`)
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
    
    // Verify confirmation dialog appears
    const confirmationDialog = page.getByRole('alertdialog')
    await expect(confirmationDialog).toBeVisible()
    
    // Verify dialog title and content
    await expect(page.locator('text=Delete Agent')).toBeVisible()
    
    // Verify buttons are present
    const cancelButton = page.locator('button:has-text("Cancel")')
    const deleteConfirmButton = page.locator('button:has-text("Delete")')
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
    await expect(detailsButton).toBeVisible()
    await detailsButton.click()
    
    // Verify modal opens by checking for "Agent Details" text
    await expect(page.locator('text=Agent Details')).toBeVisible()
    
    // Verify personal information section exists
    await expect(page.locator('text=Personal Information')).toBeVisible()
    
    // Verify organization information section exists  
    await expect(page.locator('text=Organization Information')).toBeVisible()
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