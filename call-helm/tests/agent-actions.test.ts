import { test, expect } from '@playwright/test'

test.describe('Agent Management - Action Tests', () => {
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

  test('Delete agent confirmation dialog functionality', async ({ page }) => {
    // Wait for agents table to load
    await expect(page.locator('table')).toBeVisible({ timeout: 10000 })
    
    // Skip test if no agents available
    const agentRowCount = await page.locator('tbody tr').count()
    if (agentRowCount === 0) {
      console.log('No agents available for delete test')
      return
    }
    
    // Find the first agent row with a delete button
    const firstAgentRow = page.locator('tbody tr').first()
    await expect(firstAgentRow).toBeVisible()
    
    // Find and click the delete button (trash icon)
    const deleteButton = firstAgentRow.locator('button[title="Delete"]')
    await expect(deleteButton).toBeVisible()
    await deleteButton.click()
    
    // Verify confirmation dialog appears (use specific role selector)
    const confirmationDialog = page.getByRole('alertdialog')
    await expect(confirmationDialog).toBeVisible()
    
    // Verify dialog title and content
    await expect(page.locator('text=Delete Agent')).toBeVisible()
    await expect(page.locator('text=Are you sure you want to delete').or(page.locator('text=This action cannot be undone'))).toBeVisible()
    
    // Verify dialog has destructive styling (red icon)
    const trashIcon = confirmationDialog.locator('svg').first()
    await expect(trashIcon).toBeVisible()
    
    // Verify buttons are present
    const cancelButton = page.locator('button:has-text("Cancel")')
    const deleteConfirmButton = page.locator('button:has-text("Delete")')
    await expect(cancelButton).toBeVisible()
    await expect(deleteConfirmButton).toBeVisible()
    
    // Test cancel functionality
    await cancelButton.click()
    await expect(confirmationDialog).not.toBeVisible({ timeout: 2000 })
    
    // Re-open dialog to test delete
    await deleteButton.click()
    await expect(confirmationDialog).toBeVisible()
    
    // Test delete confirmation
    await deleteConfirmButton.click()
    
    // Verify loading state (spinner and disabled button)
    await expect(deleteConfirmButton).toBeDisabled()
    const loadingSpinner = page.locator('.animate-spin').or(page.locator('text=Loading...'))
    await expect(loadingSpinner).toBeVisible({ timeout: 1000 })
    
    // Wait for operation to complete
    await expect(confirmationDialog).not.toBeVisible({ timeout: 10000 })
    
    // Verify success toast
    await expect(page.locator('text=deleted successfully').or(page.locator('text=Agent(s) deleted successfully'))).toBeVisible({ timeout: 5000 })
  })

  test('Send invitation functionality for pending agents', async ({ page }) => {
    // Wait for agents table to load
    await expect(page.locator('table')).toBeVisible({ timeout: 10000 })
    
    // Skip test if no agents available
    const agentRowCount = await page.locator('tbody tr').count()
    if (agentRowCount === 0) {
      console.log('No agents available for invitation test')
      return
    }
    
    // Look for an agent with pending_invitation status
    const pendingAgentRow = page.locator('tbody tr').filter({
      has: page.locator('text=Pending')
    }).first()
    
    // If no pending agent exists, we'll add one first
    const hasPendingAgent = await pendingAgentRow.count() > 0
    
    if (!hasPendingAgent) {
      // Click Add Agent button
      const addAgentButton = page.locator('button:has-text("Add Agent")')
      await addAgentButton.click()
      
      // Wait for modal to open
      await expect(page.locator('text=Add New Agent').or(page.locator('text=Add Agent'))).toBeVisible()
      
      // Fill out the form with unique email
      const timestamp = Date.now()
      await page.fill('input[name="email"]', `test.invitation.${timestamp}@example.com`)
      await page.fill('input[name="full_name"]', 'Test Invitation User')
      await page.selectOption('select[name="role"]', 'agent')
      
      // Submit the form
      await page.click('button[type="submit"]:has-text("Add Agent")')
      
      // Wait for success message and modal to close
      await expect(page.locator('text=Agent added successfully').or(page.locator('text=added successfully'))).toBeVisible({ timeout: 5000 })
      
      // Wait for table to refresh
      await page.waitForTimeout(2000)
    }
    
    // Now find the pending agent (should exist)
    const targetPendingRow = page.locator('tbody tr').filter({
      has: page.locator('text=Pending')
    }).first()
    
    await expect(targetPendingRow).toBeVisible({ timeout: 5000 })
    
    // Find and click the send invitation button (send icon)
    const sendInvitationButton = targetPendingRow.locator('button[title="Send Invitation"]')
    await expect(sendInvitationButton).toBeVisible()
    
    // Check that button is enabled
    await expect(sendInvitationButton).toBeEnabled()
    
    // Click send invitation
    await sendInvitationButton.click()
    
    // Verify loading state
    await expect(sendInvitationButton).toBeDisabled()
    
    // Wait for success message with more flexible text matching
    await expect(page.locator('text=invitation').and(page.locator('text=sent')).or(page.locator('text=invitation(s) sent successfully'))).toBeVisible({ timeout: 15000 })
    
    // Verify status changed from "Pending" to "Invited"
    await expect(targetPendingRow.locator('text=Invited')).toBeVisible({ timeout: 10000 })
    
    // Verify the send invitation button is no longer visible (only shows for pending)
    await expect(sendInvitationButton).not.toBeVisible({ timeout: 5000 })
  })

  test('Agent details modal opens correctly', async ({ page }) => {
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
    
    // Verify modal opens (the modal uses fixed positioning with bg-black/50)
    const modal = page.locator('.fixed.inset-0.bg-black\\/50').or(page.locator('[role="dialog"]'))
    await expect(modal).toBeVisible({ timeout: 5000 })
    
    // Verify modal has agent details
    await expect(page.locator('text=Agent Details')).toBeVisible()
    
    // Verify we can close the modal
    const closeButton = page.locator('button:has-text("×")').or(page.locator('svg'))
    await expect(closeButton.first()).toBeVisible()
  })

  test('Action buttons are properly disabled during operations', async ({ page }) => {
    // Wait for agents table to load
    await expect(page.locator('table')).toBeVisible({ timeout: 10000 })
    
    // Find an agent row
    const agentRow = page.locator('tbody tr').first()
    await expect(agentRow).toBeVisible()
    
    // Get all action buttons
    const deleteButton = agentRow.locator('button[title="Delete"]')
    const detailsButton = agentRow.locator('button[title="View Details"]')
    
    // Verify buttons are initially enabled
    await expect(deleteButton).toBeEnabled()
    await expect(detailsButton).toBeEnabled()
    
    // Test that delete button gets disabled during operation
    await deleteButton.click()
    
    // Verify dialog appears
    const confirmationDialog = page.locator('[role="alertdialog"]')
    await expect(confirmationDialog).toBeVisible()
    
    // Click delete confirm
    const deleteConfirmButton = page.locator('button:has-text("Delete")')
    await deleteConfirmButton.click()
    
    // During the operation, the original delete button should be disabled
    await expect(deleteButton).toBeDisabled()
    
    // Wait for operation to complete
    await expect(confirmationDialog).not.toBeVisible({ timeout: 5000 })
  })

  test('Agent action buttons show correct icons and tooltips', async ({ page }) => {
    // Wait for agents table to load
    await expect(page.locator('table')).toBeVisible({ timeout: 10000 })
    
    // Check for proper action buttons in the first row
    const firstRow = page.locator('tbody tr').first()
    await expect(firstRow).toBeVisible()
    
    // Check delete button (trash icon)
    const deleteButton = firstRow.locator('button[title="Delete"]')
    await expect(deleteButton).toBeVisible()
    await expect(deleteButton.locator('svg')).toBeVisible() // Should have trash icon
    
    // Check details button (edit icon)
    const detailsButton = firstRow.locator('button[title="View Details"]')
    await expect(detailsButton).toBeVisible()
    await expect(detailsButton.locator('svg')).toBeVisible() // Should have edit icon
    
    // Check for send invitation button if agent is pending
    const hasPendingStatus = await firstRow.locator('text=Pending').count() > 0
    if (hasPendingStatus) {
      const sendButton = firstRow.locator('button[title="Send Invitation"]')
      await expect(sendButton).toBeVisible()
      await expect(sendButton.locator('svg')).toBeVisible() // Should have send icon
    }
  })

  test('Confirmation dialog variants display correctly', async ({ page }) => {
    // Wait for agents table to load
    await expect(page.locator('table')).toBeVisible({ timeout: 10000 })
    
    // Find and click delete button to open destructive variant
    const deleteButton = page.locator('tbody tr').first().locator('button[title="Delete"]')
    await deleteButton.click()
    
    // Verify destructive dialog styling
    const dialog = page.locator('[role="alertdialog"]')
    await expect(dialog).toBeVisible()
    
    // Check for red/destructive button styling
    const confirmButton = page.locator('button:has-text("Delete")')
    await expect(confirmButton).toBeVisible()
    
    // Verify the icon is present (trash icon for destructive)
    const iconContainer = dialog.locator('svg').first()
    await expect(iconContainer).toBeVisible()
    
    // Verify proper button styling for destructive action
    await expect(confirmButton).toHaveClass(/bg-red-600/)
    
    // Cancel to close
    await page.locator('button:has-text("Cancel")').click()
    await expect(dialog).not.toBeVisible()
  })
})

test.describe('Agent Management - Edge Cases', () => {
  const baseURL = 'http://localhost:3035'
  const credentials = {
    email: 'al@kaponline.com',
    password: '123Hammond!'
  }

  test.beforeEach(async ({ page }) => {
    await page.goto(`${baseURL}/auth/login`)
    await page.fill('input[type="email"]', credentials.email)
    await page.fill('input[type="password"]', credentials.password)
    await page.click('button[type="submit"]:has-text("Sign in")')
    await page.waitForURL('**/dashboard', { timeout: 10000 })
    await page.goto(`${baseURL}/dashboard/agents`)
    await page.waitForLoadState('networkidle')
  })

  test('Handle empty agents table gracefully', async ({ page }) => {
    // Check if table shows "No agents found" message when empty
    const emptyMessage = page.locator('text=No agents found')
    const hasData = await page.locator('tbody tr').count() > 0
    
    if (!hasData) {
      await expect(emptyMessage).toBeVisible()
    } else {
      // If we have data, the message should not be visible
      await expect(emptyMessage).not.toBeVisible()
    }
  })

  test('Confirmation dialog handles keyboard navigation', async ({ page }) => {
    // Skip if no agents available
    const agentRowCount = await page.locator('tbody tr').count()
    if (agentRowCount === 0) {
      console.log('No agents available for testing')
      return
    }
    
    // Open confirmation dialog
    const deleteButton = page.locator('tbody tr').first().locator('button[title="Delete"]')
    await deleteButton.click()
    
    const dialog = page.locator('[role="alertdialog"]')
    await expect(dialog).toBeVisible()
    
    // Test Escape key closes dialog
    await page.keyboard.press('Escape')
    await expect(dialog).not.toBeVisible()
    
    // Re-open dialog
    await deleteButton.click()
    await expect(dialog).toBeVisible()
    
    // Test Tab navigation between buttons
    await page.keyboard.press('Tab')
    await page.keyboard.press('Tab')
    
    // Test Enter key on Cancel button
    await page.keyboard.press('Enter')
    await expect(dialog).not.toBeVisible()
  })
})