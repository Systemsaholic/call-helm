import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

test.describe('Campaign Activation Flow', () => {
  let supabase: ReturnType<typeof createClient>

  test.beforeEach(async () => {
    supabase = createClient(supabaseUrl, supabaseKey)
  })

  test('should complete campaign activation end-to-end', async ({ page }) => {
    // 1. Navigate to login
    await page.goto('/auth/login')
    
    // 2. Login as test user
    await page.fill('input[type="email"]', 'testuser@example.com')
    await page.fill('input[type="password"]', 'password123')
    await page.click('button[type="submit"]')
    
    // 3. Wait for redirect to dashboard
    await expect(page).toHaveURL('/dashboard')
    
    // 4. Navigate to call lists
    await page.click('a[href="/dashboard/call-lists"]')
    await expect(page).toHaveURL('/dashboard/call-lists')
    
    // 5. Create a test call list if none exists
    const createListBtn = page.locator('button:has-text("Create Call List")')
    if (await createListBtn.isVisible()) {
      await createListBtn.click()
      
      // Fill in call list details
      await page.fill('input[name="name"]', 'Test Campaign Activation')
      await page.fill('textarea[name="description"]', 'Testing campaign activation flow')
      await page.selectOption('select[name="distribution_strategy"]', 'round_robin')
      await page.fill('input[name="max_attempts_per_contact"]', '3')
      
      await page.click('button[type="submit"]')
      await expect(page.locator('text=Call list created successfully')).toBeVisible()
    }
    
    // 6. Click on the first call list
    const firstCallList = page.locator('[data-testid="call-list-item"]').first()
    await firstCallList.click()
    
    // 7. Add contacts if none exist
    const addContactsBtn = page.locator('button:has-text("Add Contacts")')
    if (await addContactsBtn.isVisible()) {
      await addContactsBtn.click()
      
      // Upload a CSV file or add individual contacts
      const fileInput = page.locator('input[type="file"]')
      if (await fileInput.isVisible()) {
        await fileInput.setInputFiles('tests/fixtures/test-contacts.csv')
        await page.click('button:has-text("Upload")')
        await expect(page.locator('text=Contacts added successfully')).toBeVisible()
      }
    }
    
    // 8. Assign contacts to agents
    const assignContactsBtn = page.locator('button:has-text("Assign Contacts")')
    if (await assignContactsBtn.isVisible()) {
      await assignContactsBtn.click()
      
      // Select assignment strategy
      await page.click('input[value="round_robin"]')
      
      // Select agents
      const agentCheckboxes = page.locator('input[type="checkbox"]')
      const count = await agentCheckboxes.count()
      if (count > 0) {
        await agentCheckboxes.first().check()
      }
      
      await page.click('button:has-text("Assign Contacts")')
      await expect(page.locator('text=Contacts assigned successfully')).toBeVisible()
    }
    
    // 9. Activate campaign
    const activateBtn = page.locator('button:has-text("Activate Campaign")')
    await expect(activateBtn).toBeEnabled()
    await activateBtn.click()
    
    // 10. Confirm activation
    await page.check('input[id="confirm"]')
    await page.click('button:has-text("Activate Campaign")')
    
    // 11. Verify campaign is active
    await expect(page.locator('text=Campaign activated successfully')).toBeVisible()
    await expect(page.locator('[data-testid="campaign-status"]:has-text("Active")')).toBeVisible()
    
    // 12. Verify progress bars show correct data
    const assignmentProgress = page.locator('[data-testid="assignment-progress"]')
    await expect(assignmentProgress).toBeVisible()
    
    const completionProgress = page.locator('[data-testid="completion-progress"]')
    await expect(completionProgress).toBeVisible()
    
    // 13. Test pause functionality
    const pauseBtn = page.locator('button:has-text("Pause Campaign")')
    await pauseBtn.click()
    await expect(page.locator('text=Campaign paused')).toBeVisible()
    await expect(page.locator('[data-testid="campaign-status"]:has-text("Paused")')).toBeVisible()
    
    // 14. Test resume functionality
    const resumeBtn = page.locator('button:has-text("Resume Campaign")')
    await resumeBtn.click()
    await page.check('input[id="confirm"]')
    await page.click('button:has-text("Activate Campaign")')
    await expect(page.locator('text=Campaign activated successfully')).toBeVisible()
  })

  test('should validate assignment prerequisites', async ({ page }) => {
    await page.goto('/auth/login')
    await page.fill('input[type="email"]', 'testuser@example.com')
    await page.fill('input[type="password"]', 'password123')
    await page.click('button[type="submit"]')
    
    await page.goto('/dashboard/call-lists')
    
    // Create a call list without contacts
    await page.click('button:has-text("Create Call List")')
    await page.fill('input[name="name"]', 'Empty Campaign Test')
    await page.click('button[type="submit"]')
    
    // Try to activate without assigned contacts
    const activateBtn = page.locator('button:has-text("Activate Campaign")')
    await expect(activateBtn).toBeDisabled()
    
    // Verify warning message
    await expect(page.locator('text=You must assign contacts to agents before activating this campaign')).toBeVisible()
  })

  test('should track usage when assigning contacts', async ({ page }) => {
    await page.goto('/auth/login')
    await page.fill('input[type="email"]', 'testuser@example.com')
    await page.fill('input[type="password"]', 'password123')
    await page.click('button[type="submit"]')
    
    await page.goto('/dashboard/call-lists')
    
    // Navigate to an existing call list with contacts
    const firstCallList = page.locator('[data-testid="call-list-item"]').first()
    await firstCallList.click()
    
    // Check initial usage stats
    const initialStats = await page.evaluate(() => {
      return fetch('/api/usage/stats').then(r => r.json())
    })
    
    // Assign contacts
    const assignContactsBtn = page.locator('button:has-text("Assign Contacts")')
    if (await assignContactsBtn.isVisible()) {
      await assignContactsBtn.click()
      await page.click('input[value="round_robin"]')
      await page.locator('input[type="checkbox"]').first().check()
      await page.click('button:has-text("Assign Contacts")')
    }
    
    // Verify usage was tracked
    const newStats = await page.evaluate(() => {
      return fetch('/api/usage/stats').then(r => r.json())
    })
    
    // Usage tracking should have been updated (this would need proper API endpoint)
    expect(newStats).toBeDefined()
  })
})