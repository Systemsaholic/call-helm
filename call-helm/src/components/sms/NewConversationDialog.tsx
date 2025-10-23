'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/lib/hooks/useAuth'
import { createClient } from '@/lib/supabase/client'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Search, User, Phone, Loader2 } from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'

interface Contact {
  id: string
  first_name: string
  last_name: string
  phone_number: string
  email: string
  company: string
}

interface NewConversationDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConversationCreated?: (conversationId: string, contactId?: string, phoneNumber?: string) => void
}

export function NewConversationDialog({
  open,
  onOpenChange,
  onConversationCreated
}: NewConversationDialogProps) {
  const { user } = useAuth()
  const supabase = createClient()
  const [mode, setMode] = useState<'existing' | 'new'>('existing')
  const [searchQuery, setSearchQuery] = useState('')
  const [contacts, setContacts] = useState<Contact[]>([])
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null)
  const [newPhoneNumber, setNewPhoneNumber] = useState('')
  const [initialMessage, setInitialMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      fetchContacts()
    }
  }, [open, searchQuery])

  const fetchContacts = async () => {
    setLoading(true)
    try {
      if (!user?.id) {
        setError('User not authenticated')
        return
      }

      // Get user's organization member record
      const { data: member, error: memberError } = await supabase
        .from('organization_members')
        .select('id, organization_id')
        .eq('user_id', user.id)
        .single()

      if (memberError || !member) {
        console.error('Error getting organization for contacts:', memberError)
        setError('Organization not found')
        return
      }

      let query = supabase
        .from('contacts')
        .select('*')
        .eq('organization_id', member.organization_id)
        .order('first_name')
        .limit(20)

      if (searchQuery) {
        query = query.or(
          `first_name.ilike.%${searchQuery}%,` +
          `last_name.ilike.%${searchQuery}%,` +
          `phone_number.ilike.%${searchQuery}%,` +
          `company.ilike.%${searchQuery}%`
        )
      }

      const { data, error } = await query

      if (error) {
        console.error('Error fetching contacts:', error)
        setError('Failed to fetch contacts')
      } else {
        setContacts(data || [])
      }
    } catch (error) {
      console.error('Error:', error)
      setError('An error occurred')
    } finally {
      setLoading(false)
    }
  }

  const formatPhoneNumber = (phone: string) => {
    // Remove all non-digits
    const cleaned = phone.replace(/\D/g, '')
    
    // Add +1 if not present and it's a 10-digit US number
    if (cleaned.length === 10) {
      return `+1${cleaned}`
    } else if (cleaned.length === 11 && cleaned.startsWith('1')) {
      return `+${cleaned}`
    }
    
    // Return with + if not already present
    return phone.startsWith('+') ? phone : `+${phone}`
  }

  const handleSendMessage = async () => {
    setSending(true)
    setError(null)

    try {
      const phoneNumber = mode === 'existing' && selectedContact
        ? selectedContact.phone_number
        : newPhoneNumber

      if (!phoneNumber) {
        setError('Please select a contact or enter a phone number')
        setSending(false)
        return
      }

      const formattedPhone = formatPhoneNumber(phoneNumber)

      if (!user?.id) {
        setError('User not authenticated')
        setSending(false)
        return
      }

      // Get user's organization member record
      const { data: member, error: memberError } = await supabase
        .from('organization_members')
        .select('id, organization_id')
        .eq('user_id', user.id)
        .single()

      if (memberError || !member) {
        console.error('Error getting organization:', memberError)
        setError('Organization not found. Please make sure you are assigned to an organization.')
        setSending(false)
        return
      }

      // Check if conversation already exists
      const { data: existingConv, error: checkError } = await supabase
        .from('sms_conversations')
        .select('id')
        .eq('organization_id', member.organization_id)
        .eq('phone_number', formattedPhone)
        .maybeSingle()

      if (checkError) {
        console.error('Error checking existing conversation:', checkError)
      }

      let conversationId = existingConv?.id

      if (!conversationId) {
        console.log('Creating new conversation with:', {
          organization_id: member.organization_id,
          phone_number: formattedPhone,
          assigned_agent_id: member.id,
          contact_id: selectedContact?.id
        })

        // Create new conversation
        const { data: newConv, error: convError } = await supabase
          .from('sms_conversations')
          .insert({
            organization_id: member.organization_id,
            contact_id: selectedContact?.id || null,
            phone_number: formattedPhone,
            assigned_agent_id: member.id,  // Use organization_member id, not user id
            status: 'active',
            unread_count: 0,
            is_opted_out: false,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .select()
          .single()

        if (convError) {
          console.error('Full error creating conversation:', {
            error: convError,
            code: convError.code,
            message: convError.message,
            details: convError.details,
            hint: convError.hint
          })
          setError(`Failed to create conversation: ${convError.message || convError.code || 'Unknown error'}`)
          setSending(false)
          return
        }

        if (!newConv) {
          console.error('No data returned from conversation creation')
          setError('Failed to create conversation - no data returned')
          setSending(false)
          return
        }

        conversationId = newConv.id
      } else {
        console.log('Using existing conversation:', conversationId)
      }

      // Send initial message if provided
      if (initialMessage.trim()) {
        const response = await fetch('/api/sms/send', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            to: formattedPhone,
            message: initialMessage,
            conversationId
          })
        })

        const result = await response.json()

        if (!response.ok) {
          throw new Error(result.error || 'Failed to send message')
        }
      }

      // Callback to parent component
      if (onConversationCreated) {
        onConversationCreated(
          conversationId, 
          selectedContact?.id || undefined,
          formattedPhone
        )
      }

      // Reset form
      setSelectedContact(null)
      setNewPhoneNumber('')
      setInitialMessage('')
      setSearchQuery('')
      onOpenChange(false)
    } catch (error) {
      console.error('Error sending message:', error)
      setError(error instanceof Error ? error.message : 'Failed to send message')
    } finally {
      setSending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>New SMS Conversation</DialogTitle>
          <DialogDescription>
            Start a new SMS conversation with a contact or phone number
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          {/* Mode Selection */}
          <div className="grid gap-2">
            <Label>Send To</Label>
            <Select value={mode} onValueChange={(v) => setMode(v as 'existing' | 'new')}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="existing">Existing Contact</SelectItem>
                <SelectItem value="new">New Phone Number</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Existing Contact Selection */}
          {mode === 'existing' && (
            <div className="grid gap-2">
              <Label>Select Contact</Label>
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search contacts..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              
              {loading ? (
                <div className="flex items-center justify-center p-4">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : (
                <ScrollArea className="h-[200px] border rounded-md">
                  <div className="p-2">
                    {contacts.length === 0 ? (
                      <p className="text-sm text-gray-500 text-center py-4">
                        {searchQuery ? 'No contacts found' : 'No contacts available'}
                      </p>
                    ) : (
                      <div className="space-y-1">
                        {contacts.map((contact) => (
                          <button
                            key={contact.id}
                            onClick={() => setSelectedContact(contact)}
                            className={`w-full text-left p-2 rounded-md transition-colors ${
                              selectedContact?.id === contact.id
                                ? 'bg-primary text-white'
                                : 'hover:bg-gray-100'
                            }`}
                          >
                            <div className="flex items-start gap-2">
                              <User className="h-4 w-4 mt-0.5" />
                              <div className="flex-1">
                                <div className="font-medium">
                                  {contact.first_name} {contact.last_name}
                                </div>
                                <div className="text-sm opacity-80">
                                  <Phone className="h-3 w-3 inline mr-1" />
                                  {contact.phone_number}
                                </div>
                                {contact.company && (
                                  <div className="text-xs opacity-60">
                                    {contact.company}
                                  </div>
                                )}
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </ScrollArea>
              )}

              {selectedContact && (
                <div className="p-2 bg-primary/10 rounded-md">
                  <p className="text-sm">
                    <span className="font-medium">Selected:</span>{' '}
                    {selectedContact.first_name} {selectedContact.last_name} ({selectedContact.phone_number})
                  </p>
                </div>
              )}
            </div>
          )}

          {/* New Phone Number Input */}
          {mode === 'new' && (
            <div className="grid gap-2">
              <Label htmlFor="phone">Phone Number</Label>
              <Input
                id="phone"
                type="tel"
                placeholder="+1 (555) 123-4567"
                value={newPhoneNumber}
                onChange={(e) => setNewPhoneNumber(e.target.value)}
              />
              <p className="text-xs text-gray-500">
                Enter a valid phone number with country code (e.g., +1 for US)
              </p>
            </div>
          )}

          {/* Initial Message */}
          <div className="grid gap-2">
            <Label htmlFor="message">Initial Message (Optional)</Label>
            <Textarea
              id="message"
              placeholder="Type your message..."
              value={initialMessage}
              onChange={(e) => setInitialMessage(e.target.value)}
              rows={4}
            />
          </div>

          {error && (
            <div className="bg-red-50 text-red-600 p-3 rounded-md text-sm">
              {error}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button 
            variant="outline" 
            onClick={() => onOpenChange(false)}
            disabled={sending}
          >
            Cancel
          </Button>
          <Button 
            onClick={handleSendMessage}
            disabled={
              sending || 
              (mode === 'existing' && !selectedContact) ||
              (mode === 'new' && !newPhoneNumber)
            }
          >
            {sending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {initialMessage.trim() ? 'Start Conversation' : 'Create Conversation'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}