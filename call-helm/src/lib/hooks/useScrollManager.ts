/**
 * Scroll Manager Hook
 *
 * Centralized scroll management for chat/message interfaces.
 * Eliminates race conditions and provides predictable scroll behavior.
 *
 * Benefits:
 * - Single source of truth for scroll decisions
 * - No race conditions from multiple setTimeout calls
 * - Predictable behavior
 * - Handles "new message" button logic
 */

'use client'

import { useState, useEffect, useCallback, useRef, RefObject } from 'react'

interface UseScrollManagerOptions {
  /**
   * Distance from bottom (in pixels) to consider "at bottom"
   * Default: 100
   */
  bottomThreshold?: number

  /**
   * Enable automatic scrolling to bottom when new content appears
   * Only scrolls if user is already near bottom
   * Default: true
   */
  autoScrollOnNew?: boolean

  /**
   * Show "new message" button when scrolled up and new content appears
   * Default: true
   */
  showNewMessageButton?: boolean
}

interface ScrollManagerReturn {
  /**
   * Ref to attach to the scrollable container
   */
  scrollContainerRef: RefObject<HTMLDivElement | null>

  /**
   * Whether user is currently at the bottom
   */
  isAtBottom: boolean

  /**
   * Scroll to bottom with optional smooth animation
   */
  scrollToBottom: (behavior?: ScrollBehavior) => void

  /**
   * Number of new messages/items since user scrolled up
   */
  newItemCount: number

  /**
   * Whether to show the "new message" button
   */
  showScrollButton: boolean

  /**
   * Reset new item count (call when user clicks "new message" button)
   */
  resetNewItemCount: () => void

  /**
   * Manually set scroll position
   */
  setScrollPosition: (position: number) => void
}

/**
 * Hook for managing scroll behavior in chat/message interfaces
 *
 * @param itemCount - Total number of items in the list (triggers scroll logic)
 * @param options - Configuration options
 * @returns Scroll manager functions and state
 */
export function useScrollManager(
  itemCount: number,
  options: UseScrollManagerOptions = {}
): ScrollManagerReturn {
  const {
    bottomThreshold = 100,
    autoScrollOnNew = true,
    showNewMessageButton = true
  } = options

  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const [isAtBottom, setIsAtBottom] = useState(true)
  const [newItemCount, setNewItemCount] = useState(0)
  const [showScrollButton, setShowScrollButton] = useState(false)
  const previousItemCountRef = useRef(itemCount)
  const isScrollingRef = useRef(false)

  // Check if user is at the bottom
  const checkIfAtBottom = useCallback(() => {
    const container = scrollContainerRef.current
    if (!container) return false

    const { scrollTop, scrollHeight, clientHeight } = container
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight
    return distanceFromBottom <= bottomThreshold
  }, [bottomThreshold])

  // Scroll to bottom
  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    const container = scrollContainerRef.current
    if (!container) return

    isScrollingRef.current = true

    container.scrollTo({
      top: container.scrollHeight,
      behavior
    })

    // Reset flags after scroll completes
    setTimeout(() => {
      isScrollingRef.current = false
      setIsAtBottom(true)
      setNewItemCount(0)
      setShowScrollButton(false)
    }, behavior === 'smooth' ? 300 : 0)
  }, [])

  // Set manual scroll position
  const setScrollPosition = useCallback((position: number) => {
    const container = scrollContainerRef.current
    if (!container) return

    container.scrollTop = position
  }, [])

  // Reset new item count
  const resetNewItemCount = useCallback(() => {
    setNewItemCount(0)
    setShowScrollButton(false)
  }, [])

  // Handle scroll events
  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container) return

    const handleScroll = () => {
      // Don't update state if we're programmatically scrolling
      if (isScrollingRef.current) return

      const atBottom = checkIfAtBottom()
      setIsAtBottom(atBottom)

      // Hide scroll button if user scrolled to bottom manually
      if (atBottom) {
        setNewItemCount(0)
        setShowScrollButton(false)
      }
    }

    container.addEventListener('scroll', handleScroll, { passive: true })
    return () => container.removeEventListener('scroll', handleScroll)
  }, [checkIfAtBottom])

  // Handle new items
  useEffect(() => {
    const previousCount = previousItemCountRef.current
    const currentCount = itemCount

    // Only process if item count increased
    if (currentCount <= previousCount) {
      previousItemCountRef.current = currentCount
      return
    }

    const newItems = currentCount - previousCount
    previousItemCountRef.current = currentCount

    // If user is at bottom, auto-scroll
    if (isAtBottom && autoScrollOnNew) {
      scrollToBottom('smooth')
      return
    }

    // If user is scrolled up, update new item count and show button
    if (!isAtBottom && showNewMessageButton) {
      setNewItemCount(prev => prev + newItems)
      setShowScrollButton(true)
    }
  }, [itemCount, isAtBottom, autoScrollOnNew, showNewMessageButton, scrollToBottom])

  // Scroll to bottom on initial mount
  useEffect(() => {
    // Delay slightly to ensure DOM is ready
    const timer = setTimeout(() => {
      scrollToBottom('auto')
    }, 50)
    return () => clearTimeout(timer)
  }, [scrollToBottom])

  return {
    scrollContainerRef,
    isAtBottom,
    scrollToBottom,
    newItemCount,
    showScrollButton,
    resetNewItemCount,
    setScrollPosition
  }
}
