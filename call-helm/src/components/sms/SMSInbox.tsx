'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/lib/hooks/useAuth'
import {
  useConversations,
  useArchiveConversation,
  useDeleteConversation,
  useClaimConversation,
  type ConversationFilters
} from '@/lib/hooks/useSMSQueries'
import { useSMSStore, type Conversation } from '@/lib/stores/smsStore'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { SMSConversation } from './SMSConversation'
import { NewConversationDialog } from './NewConversationDialog'
import { cn } from '@/lib/utils'
import {
  MessageSquare,
  Search,
  Phone,
  Mail,
  User,
  Building,
  Clock,
  Star,
  Archive,
  Inbox,
  Users,
  Filter,
  Plus,
  CheckCircle2,
  AlertCircle,
  MoreVertical,
  Trash2,
  Ban,
  ChevronLeft
} from 'lucide-react'
import { formatDistanceToNow, format, isToday, isYesterday } from 'date-fns'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs'

// Conversation interface is now imported from smsStore

type TabType = 'all' | 'assigned' | 'unassigned' | 'archived'

export function SMSInbox() {
  const { user } = useAuth()
  const [searchQuery, setSearchQuery] = useState('')
  const [activeTab, setActiveTab] = useState<TabType>('all')
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null)
  const [selectedContact, setSelectedContact] = useState<string | null>(null)
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null)
  const [showNewConversation, setShowNewConversation] = useState(false)
  const [mobileView, setMobileView] = useState<'list' | 'conversation'>('list')
  
  // Zustand store
  const { setActiveConversation } = useSMSStore()
  
  // Query hooks
  const conversationFilters: ConversationFilters = {
    tab: activeTab,
    searchQuery: searchQuery || undefined,
    userId: user?.id
  }
  
  const { 
    data: conversations = [], 
    isLoading: loading, 
    error: conversationsError 
  } = useConversations(conversationFilters)
  
  const archiveConversation = useArchiveConversation()
  const deleteConversation = useDeleteConversation()
  const claimConversation = useClaimConversation()

  useEffect(() => {
    // Check if mobile on mount and resize
    const checkMobile = () => {
      if (window.innerWidth < 768) {
        if (!selectedConversation) {
          setMobileView('list')
        }
      }
    }
    
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [selectedConversation])

  // Select first conversation when conversations load (desktop only)
  useEffect(() => {
    if (!selectedConversation && conversations.length > 0 && window.innerWidth >= 768) {
      const firstConv = conversations[0]
      setSelectedConversation(firstConv.id)
      setSelectedContact(firstConv.contact_id)
      setSelectedPhone(firstConv.phone_number)
      setActiveConversation(firstConv.id)
    }
  }, [conversations, selectedConversation, setActiveConversation])

  const handleClaimConversation = (conversationId: string) => {
    claimConversation.mutate(conversationId)
  }

  const handleArchiveConversation = (conversationId: string) => {
    archiveConversation.mutate(conversationId)
    
    // Clear selection if archived conversation was selected
    if (selectedConversation === conversationId) {
      setSelectedConversation(null)
      setSelectedContact(null)
      setSelectedPhone(null)
      setActiveConversation(null)
      setMobileView('list')
    }
  }

  const handleDeleteConversation = (conversationId: string) => {
    if (confirm('Are you sure you want to delete this conversation?')) {
      deleteConversation.mutate(conversationId)
      
      // Clear selection if deleted conversation was selected
      if (selectedConversation === conversationId) {
        setSelectedConversation(null)
        setSelectedContact(null)
        setSelectedPhone(null)
        setActiveConversation(null)
        setMobileView('list')
      }
    }
  }

  const handleNewConversationCreated = (conversationId: string, contactId?: string, phoneNumber?: string) => {
    setShowNewConversation(false)
    setSelectedConversation(conversationId)
    setSelectedContact(contactId || null)
    setSelectedPhone(phoneNumber || null)
    setActiveConversation(conversationId)
    if (window.innerWidth < 768) {
      setMobileView('conversation')
    }
  }

  const handleSelectConversation = (conversation: Conversation) => {
    setSelectedConversation(conversation.id)
    setSelectedContact(conversation.contact_id)
    setSelectedPhone(conversation.phone_number)
    setActiveConversation(conversation.id)
    if (window.innerWidth < 768) {
      setMobileView('conversation')
    }
  }

  const handleBackToList = useCallback(() => {
    setMobileView('list')
  }, [])

  // Memoized callback for SMSConversation onBack to prevent unnecessary re-renders
  const handleConversationBack = useCallback(() => {
    setSelectedConversation(null)
    setSelectedContact(null)
    setSelectedPhone(null)
    setActiveConversation(null)
  }, [setActiveConversation])

  // Search filtering is now handled in the query hook

  const getSentimentColor = (label?: string) => {
    switch (label) {
      case 'positive': return 'text-green-600'
      case 'negative': return 'text-red-600'
      case 'mixed': return 'text-yellow-600'
      default: return 'text-gray-600'
    }
  }

  const getSentimentIcon = (label?: string) => {
    switch (label) {
      case 'positive': return '😊'
      case 'negative': return '😟'
      case 'mixed': return '😐'
      default: return '😶'
    }
  }

  const formatMessageDate = (date: string) => {
    const messageDate = new Date(date)
    
    if (isToday(messageDate)) {
      return format(messageDate, 'h:mm a')
    } else if (isYesterday(messageDate)) {
      return 'Yesterday'
    } else {
      return format(messageDate, 'MMM d')
    }
  }

  const ConversationSkeleton = () => (
    <div className="px-4 py-3">
      <div className="flex items-start gap-3">
        {/* Avatar */}
        <Skeleton className="h-10 w-10 rounded-full" />
        
        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Header Row */}
          <div className="flex items-start justify-between mb-1">
            <div className="flex-1 min-w-0">
              <Skeleton className="h-4 w-32 mb-1" />
              <Skeleton className="h-3 w-24" />
            </div>
            <div className="flex items-center gap-1">
              <Skeleton className="h-3 w-12" />
            </div>
          </div>
          
          {/* Message Preview */}
          <Skeleton className="h-3 w-full mb-1" />
          <Skeleton className="h-3 w-3/4" />
          
          {/* Badges Row */}
          <div className="flex items-center gap-2 mt-2">
            <Skeleton className="h-5 w-8 rounded-full" />
          </div>
        </div>
      </div>
    </div>
  )

  const ConversationsList = () => (
    <div className="h-full bg-white flex flex-col">
      {/* Header */}
      <div className="p-4 border-b">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Messages</h2>
          <Button
            size="sm"
            className="bg-primary hover:bg-primary/90"
            onClick={() => setShowNewConversation(true)}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            type="text"
            placeholder="Search conversations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 h-9"
          />
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabType)} className="flex-1 flex flex-col">
        <TabsList className="grid w-full grid-cols-4 px-4">
          <TabsTrigger value="all" className="text-xs">All</TabsTrigger>
          <TabsTrigger value="assigned" className="text-xs">Mine</TabsTrigger>
          <TabsTrigger value="unassigned" className="text-xs">
            <span className="hidden sm:inline">Unassigned</span>
            <span className="sm:hidden">New</span>
            {conversations.filter(c => !c.assigned_agent_id && c.status !== 'archived').length > 0 && (
              <Badge className="ml-1 h-4 px-1 text-[10px]" variant="secondary">
                {conversations.filter(c => !c.assigned_agent_id && c.status !== 'archived').length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="archived" className="text-xs">
            <span className="hidden sm:inline">Archived</span>
            <span className="sm:hidden">Archive</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="flex-1 m-0 overflow-hidden">
          <ScrollArea className="h-full">
            {loading ? (
              <div className="divide-y divide-gray-100">
                {Array.from({ length: 5 }).map((_, i) => (
                  <ConversationSkeleton key={i} />
                ))}
              </div>
            ) : conversations.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-8 text-gray-500">
                <MessageSquare className="h-10 w-10 mb-3 text-gray-300" />
                <p className="text-sm font-medium">No conversations</p>
                <p className="text-xs mt-1">Start a new conversation to get started</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {conversations.map((conversation) => (
                  <div
                    key={conversation.id}
                    onClick={() => handleSelectConversation(conversation)}
                    className={cn(
                      "px-4 py-3 hover:bg-gray-50 cursor-pointer transition-colors relative",
                      selectedConversation === conversation.id && "bg-blue-50 hover:bg-blue-50"
                    )}
                  >
                    <div className="flex items-start gap-3">
                      {/* Avatar */}
                      <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                        {conversation.contact ? (
                          <span className="text-xs font-bold text-primary">
                            {conversation.contact.first_name?.[0]}
                            {conversation.contact.last_name?.[0]}
                          </span>
                        ) : (
                          <User className="h-5 w-5 text-primary" />
                        )}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        {/* Header Row */}
                        <div className="flex items-start justify-between mb-1">
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm text-gray-900 truncate">
                              {conversation.contact ? (
                                `${conversation.contact.first_name} ${conversation.contact.last_name}`
                              ) : (
                                conversation.phone_number
                              )}
                            </p>
                            {conversation.contact?.company && (
                              <p className="text-xs text-gray-500 truncate">
                                {conversation.contact.company}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-1">
                            {conversation.sentiment && (
                              <span className={`text-sm ${getSentimentColor(conversation.sentiment.label)}`}>
                                {getSentimentIcon(conversation.sentiment.label)}
                              </span>
                            )}
                            {conversation.last_message_at && (
                              <span className="text-xs text-gray-500">
                                {formatMessageDate(conversation.last_message_at)}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Message Preview */}
                        {conversation.last_message && (
                          <p className="text-sm text-gray-600 line-clamp-2">
                            {conversation.last_message.direction === 'outbound' && (
                              <span className="text-gray-500">You: </span>
                            )}
                            {conversation.last_message.content}
                          </p>
                        )}

                        {/* Badges Row */}
                        <div className="flex items-center gap-2 mt-1">
                          {conversation.unread_count > 0 && (
                            <Badge className="h-5 px-1.5 text-xs bg-primary text-white">
                              {conversation.unread_count}
                            </Badge>
                          )}
                          {conversation.is_opted_out && (
                            <Badge variant="destructive" className="h-5 px-1.5 text-xs">
                              Opted Out
                            </Badge>
                          )}
                          {!conversation.assigned_agent_id && activeTab === 'unassigned' && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-5 text-xs px-2"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleClaimConversation(conversation.id)
                              }}
                            >
                              Claim
                            </Button>
                          )}
                        </div>
                      </div>

                      {/* More Options - Hidden on mobile to save space */}
                      <div className="hidden sm:block">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                            <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={(e) => {
                              e.stopPropagation()
                              handleArchiveConversation(conversation.id)
                            }}>
                              <Archive className="h-4 w-4 mr-2" />
                              Archive
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem 
                              className="text-red-600"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleDeleteConversation(conversation.id)
                              }}
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  )

  const ConversationView = () => (
    <div className="h-full flex flex-col relative">
      {selectedConversation && selectedPhone ? (
        <>
          {/* Mobile Back Button */}
          <div className="md:hidden absolute top-4 left-4 z-10">
            <Button
              variant="ghost"
              size="icon"
              onClick={handleBackToList}
              className="bg-white/90 backdrop-blur"
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>
          </div>
          <SMSConversation
            key={selectedConversation}
            conversationId={selectedConversation}
            contactId={selectedContact || undefined}
            phoneNumber={selectedPhone}
            onBack={handleConversationBack}
            className="h-full"
          />
        </>
      ) : (
        <div className="flex-1 flex items-center justify-center text-gray-500">
          <div className="text-center">
            <MessageSquare className="h-12 w-12 mx-auto mb-4 text-gray-300" />
            <h3 className="text-lg font-medium mb-2">No conversation selected</h3>
            <p className="text-sm text-gray-400">
              Select a conversation from the list or start a new one
            </p>
            <Button
              className="mt-4"
              onClick={() => setShowNewConversation(true)}
            >
              <Plus className="h-4 w-4 mr-2" />
              New Conversation
            </Button>
          </div>
        </div>
      )}
    </div>
  )

  // Mobile view - show either list or conversation
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768

  return (
    <div className="h-full flex bg-gray-50">
      {/* Desktop Split View */}
      <div className={cn(
        "hidden md:flex w-full h-full",
      )}>
        {/* Left Sidebar - Conversations List */}
        <div className="w-[380px] border-r">
          <ConversationsList />
        </div>

        {/* Right Panel - Conversation View */}
        <div className="flex-1">
          <ConversationView />
        </div>
      </div>

      {/* Mobile View - Show one at a time */}
      <div className="md:hidden w-full h-full">
        {mobileView === 'list' ? (
          <ConversationsList />
        ) : (
          <ConversationView />
        )}
      </div>

      {/* New Conversation Dialog */}
      <NewConversationDialog
        open={showNewConversation}
        onOpenChange={setShowNewConversation}
        onConversationCreated={handleNewConversationCreated}
      />
    </div>
  )
}