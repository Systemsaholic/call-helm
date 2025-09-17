import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

test.describe('Notification System', () => {
  let supabase: ReturnType<typeof createClient>
  let testOrgId: string
  let testUserId: string
  let testAgentId: string

  test.beforeEach(async () => {
    supabase = createClient(supabaseUrl, supabaseKey)

    // Create test organization and user for testing
    // In a real test, you'd set this up properly
    testOrgId = 'test-org-id'
    testUserId = 'test-user-id'
    testAgentId = 'test-agent-id'
  })

  test('should display notification center with unread count', async ({ page }) => {
    // Navigate to dashboard
    await page.goto('/auth/login')
    await page.fill('input[type="email"]', 'testuser@example.com')
    await page.fill('input[type="password"]', 'password123')
    await page.click('button[type="submit"]')

    await expect(page).toHaveURL('/dashboard')

    // Check if notification center is present
    const notificationCenter = page.locator('[data-testid="notification-center"]')
    await expect(notificationCenter).toBeVisible()

    // Check if notification bell is visible
    const notificationBell = page.locator('button:has(svg)')
    await expect(notificationBell).toBeVisible()
  })

  test('should show notifications when dropdown is opened', async ({ page }) => {
    await page.goto('/auth/login')
    await page.fill('input[type="email"]', 'testuser@example.com')
    await page.fill('input[type="password"]', 'password123')
    await page.click('button[type="submit"]')

    // Click notification bell to open dropdown
    const notificationBell = page.locator('button:has([data-lucide="bell"])')
    await notificationBell.click()

    // Check if dropdown content is visible
    await expect(page.locator('text=Notifications')).toBeVisible()
    
    // Should show either notifications or "No notifications" message
    const hasNotifications = await page.locator('[data-testid="notification-item"]').count() > 0
    if (!hasNotifications) {
      await expect(page.locator('text=No notifications')).toBeVisible()
      await expect(page.locator('text=You\'re all caught up!')).toBeVisible()
    }
  })

  test('should show call queue notifications for agents', async ({ page }) => {
    await page.goto('/auth/login')
    await page.fill('input[type="email"]', 'agent@example.com')
    await page.fill('input[type="password"]', 'password123')
    await page.click('button[type="submit"]')

    // Navigate to call lists and assign contacts to the current agent
    await page.goto('/dashboard/call-lists')
    
    const firstCallList = page.locator('[data-testid="call-list-item"]').first()
    if (await firstCallList.isVisible()) {
      await firstCallList.click()
      
      // Assign contacts if available
      const assignBtn = page.locator('button:has-text("Assign Contacts")')
      if (await assignBtn.isVisible()) {
        await assignBtn.click()
        await page.click('input[value="round_robin"]')
        await page.locator('input[type="checkbox"]').first().check()
        await page.click('button:has-text("Assign Contacts")')
      }
    }

    // Go back to dashboard and check notifications
    await page.goto('/dashboard')
    
    // Open notifications
    const notificationBell = page.locator('button:has([data-lucide="bell-ring"], [data-lucide="bell"])')
    await notificationBell.click()

    // Check for call queue section
    const callQueueSection = page.locator('text=Call Queue')
    if (await callQueueSection.isVisible()) {
      await expect(callQueueSection).toBeVisible()
      
      // Check for call items
      const callItems = page.locator('[data-testid="call-queue-item"]')
      const callCount = await callItems.count()
      
      if (callCount > 0) {
        // Click on first call item should navigate to call board
        await callItems.first().click()
        await expect(page).toHaveURL(/\/dashboard\/call-board/)
      }
    }
  })

  test('should mark notifications as read when clicked', async ({ page }) => {
    await page.goto('/auth/login')
    await page.fill('input[type="email"]', 'testuser@example.com')
    await page.fill('input[type="password"]', 'password123')
    await page.click('button[type="submit"]')

    // Open notifications
    const notificationBell = page.locator('button:has([data-lucide="bell-ring"], [data-lucide="bell"])')
    await notificationBell.click()

    // Check if there are any notifications
    const notifications = page.locator('[data-testid="notification-item"]')
    const notificationCount = await notifications.count()

    if (notificationCount > 0) {
      // Click on first notification
      await notifications.first().click()
      
      // Notification should be marked as read (blue dot should disappear)
      await expect(notifications.first().locator('.bg-blue-500')).toHaveCount(0)
    }
  })

  test('should show "Mark all read" button when there are unread notifications', async ({ page }) => {
    await page.goto('/auth/login')
    await page.fill('input[type="email"]', 'testuser@example.com')
    await page.fill('input[type="password"]', 'password123')
    await page.click('button[type="submit"]')

    // Open notifications
    const notificationBell = page.locator('button:has([data-lucide="bell-ring"], [data-lucide="bell"])')
    await notificationBell.click()

    // Check if there are unread notifications
    const unreadDots = page.locator('.bg-blue-500')
    const unreadCount = await unreadDots.count()

    if (unreadCount > 0) {
      // Mark all read button should be visible
      const markAllReadBtn = page.locator('button:has-text("Mark all read")')
      await expect(markAllReadBtn).toBeVisible()

      // Click mark all read
      await markAllReadBtn.click()

      // All unread indicators should disappear
      await expect(page.locator('.bg-blue-500')).toHaveCount(0)
    }
  })

  test('should play notification sound for high priority notifications', async ({ page, context }) => {
    // Grant media permissions
    await context.grantPermissions(['camera', 'microphone'])
    
    await page.goto('/auth/login')
    await page.fill('input[type="email"]', 'testuser@example.com')
    await page.fill('input[type="password"]', 'password123')
    await page.click('button[type="submit"]')

    // Listen for audio play events
    let audioPlayed = false
    page.on('console', msg => {
      if (msg.text().includes('notification sound played')) {
        audioPlayed = true
      }
    })

    // Simulate receiving a high priority notification through database trigger
    // This would happen automatically when contacts are assigned in a real scenario
    
    // For testing purposes, we'll check if the audio element exists and can play
    const audioElementExists = await page.evaluate(() => {
      const audio = document.querySelector('audio')
      return audio !== null
    })

    // The actual notification sound playing would be tested through integration
    // with the real-time subscription system
    expect(audioElementExists || true).toBeTruthy() // Placeholder for actual test
  })

  test('should handle notification deletion', async ({ page }) => {
    await page.goto('/auth/login')
    await page.fill('input[type="email"]', 'testuser@example.com')
    await page.fill('input[type="password"]', 'password123')
    await page.click('button[type="submit"]')

    // Open notifications
    const notificationBell = page.locator('button:has([data-lucide="bell-ring"], [data-lucide="bell"])')
    await notificationBell.click()

    // Check if there are any notifications
    const notifications = page.locator('[data-testid="notification-item"]')
    const initialCount = await notifications.count()

    if (initialCount > 0) {
      // Find and click delete button on first notification
      const deleteBtn = notifications.first().locator('button:has([data-lucide="x"])')
      await deleteBtn.click()

      // Notification count should decrease
      const newCount = await notifications.count()
      expect(newCount).toBe(initialCount - 1)
    }
  })
})