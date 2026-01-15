'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'

interface ReactionPickerProps {
  messageId: string
  position?: 'left' | 'right'
  onSelectReaction: (reaction: string) => void
  onClose: () => void
  className?: string
}

// Popular reaction emojis
const REACTION_OPTIONS = [
  '❤️', '👍', '👎', '😂', '😮', '😢', '🎉', '🔥'
]

export function ReactionPicker({ 
  messageId,
  position = 'right',
  onSelectReaction,
  onClose,
  className 
}: ReactionPickerProps) {
  const [hoveredReaction, setHoveredReaction] = useState<string | null>(null)

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.8 }}
      className={cn(
        'bg-white rounded-full shadow-lg border border-gray-200 p-2',
        'flex items-center gap-1',
        'whitespace-nowrap',
        className
      )}
      onMouseLeave={onClose}
      onClick={(e) => e.stopPropagation()}
    >
      {REACTION_OPTIONS.map((reaction) => {
        return (
          <motion.button
            key={reaction}
            onClick={() => onSelectReaction(reaction)}
            onMouseEnter={() => setHoveredReaction(reaction)}
            onMouseLeave={() => setHoveredReaction(null)}
            whileHover={{ scale: 1.2 }}
            whileTap={{ scale: 0.9 }}
            className={cn(
              'w-8 h-8 rounded-full flex items-center justify-center text-lg',
              'transition-all duration-200',
              hoveredReaction === reaction && 'bg-gray-100'
            )}
          >
            {reaction}
          </motion.button>
        )
      })}
    </motion.div>
  )
}

// Component to display existing reactions on a message
interface MessageReactionsProps {
  reactions: Record<string, string[] | number> // reaction -> array of user IDs or count
  currentUserId: string
  userReactions?: string[] // reactions the current user has added
  onToggleReaction: (reaction: string) => void
  messageId: string
  className?: string
}

export function MessageReactions({
  reactions,
  currentUserId,
  userReactions = [],
  onToggleReaction,
  messageId,
  className
}: MessageReactionsProps) {
  if (!reactions || Object.keys(reactions).length === 0) {
    return null
  }

  return (
    <div className={cn('flex flex-wrap gap-1 mt-1', className)}>
      {Object.entries(reactions).map(([reaction, value]) => {
        // Support both user ID arrays and counts
        const count = typeof value === 'number' ? value : value.length
        const hasUserReacted = typeof value === 'number'
          ? userReactions.includes(reaction)
          : value.includes(currentUserId)

        return (
          <motion.button
            key={reaction}
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0 }}
            onClick={() => onToggleReaction(reaction)}
            className={cn(
              'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs',
              'transition-all duration-200',
              hasUserReacted
                ? 'bg-blue-100 text-blue-700 border border-blue-300'
                : 'bg-gray-100 text-gray-700 border border-gray-200',
              'hover:shadow-sm'
            )}
          >
            <span className="text-sm">{reaction}</span>
            {count > 1 && <span>{count}</span>}
          </motion.button>
        )
      })}
    </div>
  )
}