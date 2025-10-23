'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { format, isToday, isYesterday, formatDistanceToNow } from 'date-fns'
import { 
  Send, Paperclip, MoreVertical, Check, CheckCheck, Clock,
  AlertCircle, Ban, Smile, Image, File, ChevronLeft,
  Phone, User, Info, Star, Flag, Archive, Trash2, X, Circle, Heart
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { RealtimeChannel } from '@supabase/supabase-js'
import { ReactionPicker, MessageReactions } from './ReactionPicker'
import { useConversationReadStatus } from '@/hooks/useUnreadMessages'
import { AnimatePresence } from 'framer-motion'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Input } from '@/components/ui/input'
import { useSignalWireRealtime } from '@/hooks/useSignalWireRealtime'
import { useSMSStore } from '@/lib/stores/smsStore'
import { 
  useConversation, 
  useMessages, 
  useSendMessage, 
  useMarkAsRead 
} from '@/lib/hooks/useSMSQueries'

// Types are now imported from the SMS store
import type { Message, Conversation } from '@/lib/stores/smsStore'

interface Contact {
  id: string
  full_name: string
  phone_number: string
  email?: string
  company?: string
  avatar_url?: string
}

interface SMSConversationProps {
  conversationId?: string
  contactId?: string
  phoneNumber?: string
  onBack?: () => void
  className?: string
}

export function SMSConversation({ 
  conversationId: initialConversationId,
  contactId,
  phoneNumber,
  onBack,
  className
}: SMSConversationProps) {
  const [messageText, setMessageText] = useState('')
  const [typing, setTyping] = useState(false)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [attachedFiles, setAttachedFiles] = useState<File[]>([])
  const [uploading, setUploading] = useState(false)
  const [userId, setUserId] = useState<string>('')
  const [signalWireConnected, setSignalWireConnected] = useState(false)
  const [messageReactions, setMessageReactions] = useState<Record<string, any>>({})
  const [showReactionPicker, setShowReactionPicker] = useState<string | null>(null)
  const [hoveredMessage, setHoveredMessage] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const typingDebounceRef = useRef<NodeJS.Timeout | null>(null)
  const longPressTimer = useRef<NodeJS.Timeout | null>(null)
  const draftSaveDebounceRef = useRef<NodeJS.Timeout | null>(null)
  const markedAsReadRef = useRef<string | null>(null) // Track which conversation we've marked as read
  const supabase = createClient()
  
  // Query hooks
  const { data: conversation } = useConversation(initialConversationId || '')
  const { data: messages = [], isLoading: messagesLoading } = useMessages(initialConversationId || '')
  const sendMessage = useSendMessage()
  const markAsRead = useMarkAsRead()
  
  // Use SignalWire Realtime hooks
  const { connection, typing: typingIndicator, messages: realtimeMessages, presence } = useSignalWireRealtime(
    initialConversationId || '',
    userId
  )
  
  // Use unread message hooks (only for reading status, not marking)
  const { unreadMessages, isUnread } = useConversationReadStatus(initialConversationId || '')
  
  // Use SMS store for draft persistence and state
  const { 
    setDraft, 
    getDraft, 
    clearDraft,
    setTyping: setStoreTyping,
    getTypingUsers 
  } = useSMSStore()

  // Scroll to bottom of messages
  const scrollToBottom = (behavior: 'smooth' | 'auto' = 'smooth') => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior })
    }, 100)
  }

  // Auto-scroll when new messages arrive
  useEffect(() => {
    scrollToBottom('auto')
  }, [messages])

  // Scroll to bottom on initial load
  useEffect(() => {
    if (messages.length > 0) {
      scrollToBottom('auto')
    }
  }, [conversation?.id])

  // Removed duplicate mark-as-read - now handled by single implementation below

  // Load reactions for messages
  useEffect(() => {
    if (messages.length === 0) return

    const loadReactions = async () => {
      const messageIds = messages.map(m => m.id)
      const { data, error } = await supabase
        .from('message_reactions')
        .select('*')
        .in('message_id', messageIds)

      if (!error && data) {
        const reactionsByMessage: Record<string, any> = {}
        data.forEach(reaction => {
          if (!reactionsByMessage[reaction.message_id]) {
            reactionsByMessage[reaction.message_id] = {}
          }
          if (!reactionsByMessage[reaction.message_id][reaction.reaction]) {
            reactionsByMessage[reaction.message_id][reaction.reaction] = []
          }
          reactionsByMessage[reaction.message_id][reaction.reaction].push(reaction.user_id)
        })
        setMessageReactions(reactionsByMessage)
      }
    }

    loadReactions()
  }, [messages, supabase])

  // Handle adding/removing reactions
  const handleReaction = async (messageId: string, reaction: string) => {
    if (!userId) return

    try {
      // Check if user already has this reaction
      const currentReactions = messageReactions[messageId]?.[reaction] || []
      const hasReacted = currentReactions.includes(userId)

      if (hasReacted) {
        // Remove reaction
        await fetch('/api/sms/reactions', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messageId, reaction })
        })

        // Update local state
        setMessageReactions(prev => {
          const updated = { ...prev }
          if (updated[messageId]?.[reaction]) {
            updated[messageId][reaction] = updated[messageId][reaction].filter((id: string) => id !== userId)
            if (updated[messageId][reaction].length === 0) {
              delete updated[messageId][reaction]
            }
          }
          return updated
        })
      } else {
        // Add reaction
        await fetch('/api/sms/reactions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messageId, reaction })
        })

        // Update local state
        setMessageReactions(prev => {
          const updated = { ...prev }
          if (!updated[messageId]) updated[messageId] = {}
          if (!updated[messageId][reaction]) updated[messageId][reaction] = []
          updated[messageId][reaction].push(userId)
          return updated
        })
      }
    } catch (error) {
      console.error('Error handling reaction:', error)
      toast.error('Failed to update reaction')
    }

    setShowReactionPicker(null)
  }

  // Handle long press for mobile
  const handleTouchStart = (messageId: string) => {
    longPressTimer.current = setTimeout(() => {
      setShowReactionPicker(messageId)
    }, 500)
  }

  const handleTouchEnd = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }

  // Initialize SignalWire connection
  useEffect(() => {
    const initSignalWire = async () => {
      try {
        // Get user info
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          setUserId(user.id)
          
          // Get SignalWire config
          const response = await fetch('/api/signalwire/config')
          if (response.ok) {
            const config = await response.json()
            
            // Connect to SignalWire if not already connected
            if (!connection.isConnected) {
              await connection.connect(config.projectId, config.token, config.topics)
              setSignalWireConnected(true)
            }
          }
        }
      } catch (error) {
        console.error('Failed to initialize SignalWire:', error)
        // Continue with fallback to existing functionality
      }
    }
    
    initSignalWire()
  }, [])

  // Real-time messages are now handled via TanStack Query invalidation

  // Handle typing indicators from SignalWire
  useEffect(() => {
    if (typingIndicator.isAnyoneTyping) {
      setTyping(true)
    } else {
      setTyping(false)
    }
  }, [typingIndicator.isAnyoneTyping])

  // Load conversation and messages
  // Restore draft when conversation changes and reset mark-as-read tracking
  useEffect(() => {
    if (initialConversationId) {
      const savedDraft = getDraft(initialConversationId)
      setMessageText(savedDraft)
      // Reset mark-as-read tracking when conversation changes
      markedAsReadRef.current = null
    }
  }, [initialConversationId, getDraft])

  // Mark messages as read when conversation is viewed (single implementation)
  useEffect(() => {
    if (initialConversationId && messages.length > 0 && markedAsReadRef.current !== initialConversationId) {
      // Mark all messages as read after a short delay to ensure they're visible
      const timer = setTimeout(() => {
        markAsRead.mutate({ conversationId: initialConversationId })
        markedAsReadRef.current = initialConversationId // Mark this conversation as processed
      }, 1000)
      return () => clearTimeout(timer)
    }
  }, [initialConversationId, messages.length, markAsRead]) // Include markAsRead to ensure fresh reference

  // Auto-scroll when messages update
  useEffect(() => {
    if (messages.length > 0) {
      scrollToBottom('smooth')
    }
  }, [messages.length])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (draftSaveDebounceRef.current) {
        clearTimeout(draftSaveDebounceRef.current)
      }
    }
  }, [])

  // Handle file selection
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return
    
    // Check file size (limit to 5MB per file)
    const oversizedFiles = files.filter(file => file.size > 5 * 1024 * 1024)
    if (oversizedFiles.length > 0) {
      toast.error('Files must be less than 5MB')
      return
    }
    
    setAttachedFiles(prev => [...prev, ...files])
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }
  
  // Remove attached file
  const removeFile = (index: number) => {
    setAttachedFiles(prev => prev.filter((_, i) => i !== index))
  }
  
  // Upload files to storage
  const uploadFiles = async (files: File[]): Promise<string[]> => {
    const urls: string[] = []
    
    for (const file of files) {
      const fileName = `${Date.now()}-${file.name}`
      const filePath = `sms-attachments/${conversation?.id}/${fileName}`
      
      // For now, we'll just return empty array since storage might not be configured
      // In production, you would upload to your storage service
      console.log('Would upload file:', filePath)
    }
    
    return urls
  }
  
  // Handle emoji insertion
  const insertEmoji = (emoji: string) => {
    setMessageText(prev => prev + emoji)
    setShowEmojiPicker(false)
    textareaRef.current?.focus()
  }
  
  // Send message
  const handleSendMessage = async () => {
    if ((!messageText.trim() && attachedFiles.length === 0) || !conversation) return

    setUploading(attachedFiles.length > 0)
    
    try {
      let mediaUrls: string[] = []
      
      // Upload attached files if any
      if (attachedFiles.length > 0) {
        mediaUrls = await uploadFiles(attachedFiles)
        setAttachedFiles([])
      }

      // Use the optimistic mutation
      sendMessage.mutate({
        conversationId: conversation.id,
        phoneNumber: conversation.phone_number,
        message: messageText,
        mediaUrls,
        contactId: conversation.contact_id || undefined
      })

      // Clear input (draft is cleared in mutation)
      setMessageText('')
      textareaRef.current?.focus()
      
      // Scroll to the bottom to see the new message
      setTimeout(() => scrollToBottom('smooth'), 100)
    } catch (error) {
      console.error('Error uploading files:', error)
      toast.error('Failed to upload files')
    } finally {
      setUploading(false)
    }
  }

  // Handle typing indicator
  const handleMessageTextChange = useCallback((text: string) => {
    setMessageText(text)
    
    // Save draft with debouncing
    if (conversation?.id) {
      if (draftSaveDebounceRef.current) {
        clearTimeout(draftSaveDebounceRef.current)
      }
      
      draftSaveDebounceRef.current = setTimeout(() => {
        setDraft(conversation.id, text)
      }, 500) // Save draft after 500ms of inactivity
    }
  }, [conversation?.id, setDraft])

  const handleTyping = useCallback(() => {
    if (!signalWireConnected || !typingIndicator.sendTypingIndicator) return
    
    // Clear existing debounce timer
    if (typingDebounceRef.current) {
      clearTimeout(typingDebounceRef.current)
    }
    
    // Send typing started
    typingIndicator.sendTypingIndicator(true)
    
    // Set debounce to stop typing after 2 seconds of inactivity
    typingDebounceRef.current = setTimeout(() => {
      typingIndicator.sendTypingIndicator(false)
    }, 2000)
  }, [signalWireConnected, typingIndicator])

  // Handle key press
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
      
      // Stop typing indicator when sending
      if (typingDebounceRef.current) {
        clearTimeout(typingDebounceRef.current)
        typingIndicator.sendTypingIndicator(false)
      }
    }
  }

  // Format message time
  const formatMessageTime = (date: string) => {
    const messageDate = new Date(date)
    
    if (isToday(messageDate)) {
      return format(messageDate, 'h:mm a')
    } else if (isYesterday(messageDate)) {
      return `Yesterday ${format(messageDate, 'h:mm a')}`
    } else {
      return format(messageDate, 'MMM d, h:mm a')
    }
  }

  // Get message status icon
  const getStatusIcon = (message: Message) => {
    switch (message.status) {
      case 'pending':
        return <Clock className="h-3 w-3 text-gray-400" />
      case 'sent':
        return <Check className="h-3 w-3 text-gray-400" />
      case 'delivered':
        return <CheckCheck className="h-3 w-3 text-gray-400" />
      case 'read':
        return <CheckCheck className="h-3 w-3 text-blue-500" />
      case 'failed':
        return <AlertCircle className="h-3 w-3 text-red-500" />
      default:
        return null
    }
  }

  // Get sentiment color
  const getSentimentColor = (sentiment?: string) => {
    switch (sentiment) {
      case 'positive':
        return 'bg-green-50 border-green-200'
      case 'negative':
        return 'bg-red-50 border-red-200'
      case 'mixed':
        return 'bg-yellow-50 border-yellow-200'
      default:
        return ''
    }
  }

  if (messagesLoading) {
    return (
      <div className={cn("flex items-center justify-center h-full", className)}>
        <div className="animate-pulse text-gray-500">Loading conversation...</div>
      </div>
    )
  }

  return (
    <div className={cn("flex flex-col h-full bg-white overflow-hidden", className)}>
      {/* Header */}
      <div className="flex-shrink-0 flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-3">
          <Avatar>
            <AvatarImage src="" />
            <AvatarFallback>
              {conversation?.contact?.first_name?.[0] || <User className="h-4 w-4" />}
            </AvatarFallback>
          </Avatar>
          
          <div>
            <h3 className="font-semibold">
              {conversation?.contact ? 
                `${conversation.contact.first_name} ${conversation.contact.last_name}` : 
                conversation?.phone_number}
            </h3>
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <span>{conversation?.phone_number}</span>
              {conversation?.is_opted_out && (
                <Badge variant="destructive" className="text-xs">
                  <Ban className="h-3 w-3 mr-1" />
                  Opted Out
                </Badge>
              )}
              {connection.isConnected && (
                <Badge variant="outline" className="text-xs">
                  <Circle className="h-2 w-2 mr-1 fill-green-500 text-green-500" />
                  Live
                </Badge>
              )}
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon">
                  <Phone className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Call Contact</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem>
                <Info className="h-4 w-4 mr-2" />
                Contact Info
              </DropdownMenuItem>
              <DropdownMenuItem>
                <Star className="h-4 w-4 mr-2" />
                Mark Important
              </DropdownMenuItem>
              <DropdownMenuItem>
                <Flag className="h-4 w-4 mr-2" />
                Flag for Review
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem>
                <Archive className="h-4 w-4 mr-2" />
                Archive Conversation
              </DropdownMenuItem>
              <DropdownMenuItem className="text-red-600">
                <Trash2 className="h-4 w-4 mr-2" />
                Delete Conversation
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 min-h-0">
        <div className="space-y-4">
          {messages.map((message, index) => {
            const isInbound = message.direction === 'inbound'
            const messageIsUnread = isInbound && isUnread(message.id)
            const showDate = index === 0 || 
              new Date(messages[index - 1].created_at).toDateString() !== 
              new Date(message.created_at).toDateString()
            
            return (
              <div key={message.id}>
                {showDate && (
                  <div className="flex justify-center my-4">
                    <Badge variant="outline" className="text-xs">
                      {isToday(new Date(message.created_at)) ? 'Today' :
                       isYesterday(new Date(message.created_at)) ? 'Yesterday' :
                       format(new Date(message.created_at), 'MMM d, yyyy')}
                    </Badge>
                  </div>
                )}
                
                <div className={cn(
                  "flex gap-2 relative",
                  isInbound ? "justify-start" : "justify-end"
                )}>
                  {/* Unread indicator */}
                  {messageIsUnread && (
                    <div className="absolute -left-4 top-1/2 -translate-y-1/2">
                      <Circle className="h-2 w-2 fill-blue-500 text-blue-500" />
                    </div>
                  )}
                  
                  <div className={cn(
                    "relative group",
                    isInbound ? "max-w-[90%]" : "max-w-[85%]"
                  )}>
                    <div 
                      className={cn(
                        "inline-block rounded-2xl px-4 py-2 border",
                        isInbound ? 
                          "bg-gray-100 border-gray-200" :
                          "bg-blue-500 text-white border-blue-500",
                        messageIsUnread && "ring-2 ring-blue-500/20"
                      )}
                      onMouseEnter={() => setHoveredMessage(message.id)}
                      onMouseLeave={() => setHoveredMessage(null)}
                      onTouchStart={() => handleTouchStart(message.id)}
                      onTouchEnd={handleTouchEnd}
                    >
                      <p className={cn(
                        "text-sm whitespace-pre-wrap break-words",
                        !isInbound && "text-white"
                      )}>
                        {message.message_body}
                      </p>
                    
                    {/* Media attachments */}
                    {message.media_urls && message.media_urls.length > 0 && (
                      <div className="mt-2 space-y-2">
                        {message.media_urls.map((url, idx) => (
                          <div key={idx} className="flex items-center gap-2">
                            {url.match(/\.(jpg|jpeg|png|gif)$/i) ? (
                              <Image className="h-4 w-4" />
                            ) : (
                              <File className="h-4 w-4" />
                            )}
                            <a 
                              href={url} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className={cn(
                                "text-xs underline",
                                isInbound ? "text-blue-600" : "text-white"
                              )}
                            >
                              View attachment
                            </a>
                          </div>
                        ))}
                      </div>
                    )}
                    
                    <div className={cn(
                      "flex items-center justify-between mt-1 gap-2",
                      isInbound ? "text-gray-500" : "text-blue-100"
                    )}>
                      <span className="text-xs">
                        {formatMessageTime(message.created_at)}
                      </span>
                      {!isInbound && getStatusIcon(message)}
                    </div>
                    
                    {/* Error message */}
                    {message.error_message && (
                      <div className="mt-1 text-xs text-red-600">
                        Error: {message.error_message}
                      </div>
                    )}
                    </div>

                    {/* Reaction Picker on Hover/Long Press */}
                    {(hoveredMessage === message.id || showReactionPicker === message.id) && (
                      <div className="absolute top-0 z-50" style={{ [isInbound ? 'left' : 'right']: '100%' }}>
                        <ReactionPicker
                          messageId={message.id}
                          position={isInbound ? 'right' : 'left'}
                          onSelectReaction={(reaction) => handleReaction(message.id, reaction)}
                          onClose={() => {
                            setShowReactionPicker(null)
                            setHoveredMessage(null)
                          }}
                        />
                      </div>
                    )}

                    {/* Message Reactions Display */}
                    {messageReactions[message.id] && Object.keys(messageReactions[message.id]).length > 0 && (
                      <MessageReactions
                        reactions={messageReactions[message.id]}
                        currentUserId={userId}
                        onToggleReaction={(reaction) => handleReaction(message.id, reaction)}
                        messageId={message.id}
                      />
                    )}
                  </div>
                </div>
              </div>
            )
          })}
          
          {/* Typing indicator */}
          {typing && (
            <div className="flex justify-start">
              <div className="bg-gray-100 rounded-2xl px-4 py-2">
                <div className="flex items-center gap-2">
                  <div className="flex gap-1">
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                  <span className="text-xs text-gray-500">typing...</span>
                </div>
              </div>
            </div>
          )}
          
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input */}
      {!conversation?.is_opted_out ? (
        <div className="flex-shrink-0 p-4 border-t">
          {/* Attached files preview */}
          {attachedFiles.length > 0 && (
            <div className="mb-2 p-2 bg-gray-50 rounded-lg">
              <div className="flex flex-wrap gap-2">
                {attachedFiles.map((file, index) => (
                  <div key={index} className="flex items-center gap-1 bg-white px-2 py-1 rounded border">
                    {file.type.startsWith('image/') ? (
                      <Image className="h-4 w-4" />
                    ) : (
                      <File className="h-4 w-4" />
                    )}
                    <span className="text-sm truncate max-w-[150px]">{file.name}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-4 w-4 p-0"
                      onClick={() => removeFile(index)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          <div className="flex items-end gap-2">
            {/* File attachment button */}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,application/pdf,.doc,.docx"
              onChange={handleFileSelect}
              className="hidden"
            />
            <Button 
              variant="ghost" 
              size="icon" 
              className="mb-1"
              onClick={() => fileInputRef.current?.click()}
              disabled={sendMessage.isPending}
            >
              <Paperclip className="h-5 w-5" />
            </Button>
            
            <div className="flex-1">
              <Textarea
                ref={textareaRef}
                value={messageText}
                onChange={(e) => {
                  handleMessageTextChange(e.target.value)
                  handleTyping()
                }}
                onKeyDown={handleKeyPress}
                placeholder="Type a message... (Press Enter to send, Shift+Enter for new line)"
                className="min-h-[40px] max-h-[120px] resize-none"
                rows={1}
                disabled={sendMessage.isPending}
              />
            </div>
            
            {/* Emoji picker */}
            <Popover open={showEmojiPicker} onOpenChange={setShowEmojiPicker}>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" className="mb-1">
                  <Smile className="h-5 w-5" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-64 p-2" align="end">
                <div className="grid grid-cols-8 gap-1">
                  {['😊', '😂', '❤️', '👍', '👎', '🙏', '👋', '🎉', '🔥', '✨', '💯', '😍', '🤔', '😎', '😭', '😅'].map(emoji => (
                    <Button
                      key={emoji}
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0"
                      onClick={() => insertEmoji(emoji)}
                    >
                      {emoji}
                    </Button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
            
            <Button 
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                console.log('Send button clicked')
                handleSendMessage()
              }}
              disabled={(!messageText.trim() && attachedFiles.length === 0) || sendMessage.isPending || uploading}
              className="mb-1"
              type="button"
            >
              {uploading ? (
                <div className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full" />
              ) : (
                <Send className="h-5 w-5" />
              )}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex-shrink-0 p-4 border-t bg-gray-50">
          <p className="text-center text-sm text-gray-500">
            This contact has opted out of SMS messages
          </p>
        </div>
      )}
    </div>
  )
}