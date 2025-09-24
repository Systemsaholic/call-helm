'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/hooks/useAuth'
import { useConfirmation } from '@/lib/hooks/useConfirmation'
import { ConfirmationDialog } from '@/components/ui/confirmation-dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { 
  Plus, 
  Save, 
  X, 
  Edit2, 
  Trash2, 
  Pin, 
  Clock, 
  User,
  Loader2,
  FileText,
  Search
} from 'lucide-react'
import { Input } from '@/components/ui/input'

interface ContactNotesProps {
  contactId: string
  limit?: number
  compact?: boolean
}

interface Note {
  id: string
  contact_id: string
  organization_id: string
  member_id: string | null
  content: string
  is_pinned: boolean
  created_at: string
  updated_at: string
  created_by: string | null
  updated_by: string | null
  member?: {
    full_name: string
    email: string
  }
}

export function ContactNotes({ contactId, limit, compact = false }: ContactNotesProps) {
  const [isAdding, setIsAdding] = useState(false)
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null)
  const [newNoteContent, setNewNoteContent] = useState('')
  const [editingContent, setEditingContent] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [organizationId, setOrganizationId] = useState<string | null>(null)
  const [memberId, setMemberId] = useState<string | null>(null)
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  
  const supabase = createClient()
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const confirmation = useConfirmation()

  // Get organization and member IDs
  useEffect(() => {
    async function getIds() {
      if (!user?.id) {
        console.log('ContactNotes: No user ID yet')
        return
      }

      console.log('ContactNotes: Fetching organization and member IDs for user:', user.id)
      const { data: member, error } = await supabase
        .from('organization_members')
        .select('id, organization_id')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .single()

      if (error) {
        console.error('ContactNotes: Error fetching member data:', error)
        return
      }

      if (member) {
        console.log('ContactNotes: Setting IDs:', { 
          organizationId: member.organization_id, 
          memberId: member.id 
        })
        setOrganizationId(member.organization_id)
        setMemberId(member.id)
      }
    }

    getIds()
  }, [user])

  // Fetch notes
  const { data: notes, isLoading } = useQuery({
    queryKey: ['contact-notes', contactId, limit],
    enabled: !!contactId && !!organizationId,
    queryFn: async () => {
      let query = supabase
        .from('contact_notes')
        .select(`
          *,
          member:organization_members!contact_notes_member_id_fkey(
            full_name,
            email
          )
        `)
        .eq('contact_id', contactId)
        .eq('organization_id', organizationId!)
        .order('is_pinned', { ascending: false })
        .order('created_at', { ascending: false })

      if (limit) {
        query = query.limit(limit)
      }

      const { data, error } = await query

      if (error) throw error
      return data as Note[]
    }
  })

  // Create note mutation
  const createNote = useMutation({
    mutationFn: async (content: string) => {
      console.log('Creating note with:', {
        contact_id: contactId,
        organization_id: organizationId,
        member_id: memberId,
        content: content.substring(0, 50) + '...',
        created_by: user?.id
      })
      
      const { data, error } = await supabase
        .from('contact_notes')
        .insert({
          contact_id: contactId,
          organization_id: organizationId!,
          member_id: memberId,
          content,
          created_by: user?.id
        })
        .select()
        .single()

      if (error) {
        console.error('Supabase error:', error)
        throw error
      }
      
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contact-notes', contactId] })
      queryClient.invalidateQueries({ queryKey: ['contact-stats', contactId] })
      queryClient.invalidateQueries({ queryKey: ['contact-activities', contactId] })
      toast.success('Note added successfully')
      setNewNoteContent('')
      setIsAdding(false)
    },
    onError: (error: any) => {
      console.error('Failed to add note:', error)
      toast.error(error.message || 'Failed to add note')
    }
  })

  // Update note mutation
  const updateNote = useMutation({
    mutationFn: async ({ id, content }: { id: string, content: string }) => {
      const { data, error } = await supabase
        .from('contact_notes')
        .update({
          content,
          updated_by: user?.id
        })
        .eq('id', id)
        .select()
        .single()

      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contact-notes', contactId] })
      toast.success('Note updated successfully')
      setEditingNoteId(null)
      setEditingContent('')
    },
    onError: (error: any) => {
      console.error('Failed to update note:', error)
      toast.error(error.message || 'Failed to update note')
    }
  })

  // Delete note mutation
  const deleteNote = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('contact_notes')
        .delete()
        .eq('id', id)

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contact-notes', contactId] })
      queryClient.invalidateQueries({ queryKey: ['contact-stats', contactId] })
      queryClient.invalidateQueries({ queryKey: ['contact-activities', contactId] })
      toast.success('Note deleted successfully')
    },
    onError: (error: any) => {
      console.error('Failed to delete note:', error)
      toast.error(error.message || 'Failed to delete note')
    }
  })

  // Toggle pin mutation
  const togglePin = useMutation({
    mutationFn: async ({ id, isPinned }: { id: string, isPinned: boolean }) => {
      const { data, error } = await supabase
        .from('contact_notes')
        .update({ is_pinned: !isPinned })
        .eq('id', id)
        .select()
        .single()

      if (error) throw error
      return data
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['contact-notes', contactId] })
      toast.success(data.is_pinned ? 'Note pinned' : 'Note unpinned')
    },
    onError: () => {
      toast.error('Failed to update pin status')
    }
  })

  // Auto-save for editing notes
  useEffect(() => {
    if (editingNoteId && editingContent) {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }

      saveTimeoutRef.current = setTimeout(() => {
        const originalNote = notes?.find(n => n.id === editingNoteId)
        if (originalNote && originalNote.content !== editingContent) {
          updateNote.mutate({ id: editingNoteId, content: editingContent })
        }
      }, 1000) // Auto-save after 1 second of inactivity
    }

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }
    }
  }, [editingContent])

  const handleAddNote = () => {
    if (!newNoteContent.trim()) {
      toast.error('Note content cannot be empty')
      return
    }
    
    if (!organizationId || !memberId) {
      toast.error('Organization data not loaded. Please refresh the page.')
      return
    }
    
    createNote.mutate(newNoteContent)
  }

  const handleStartEdit = (note: Note) => {
    setEditingNoteId(note.id)
    setEditingContent(note.content)
  }

  const handleCancelEdit = () => {
    setEditingNoteId(null)
    setEditingContent('')
  }

  const handleDeleteNote = (id: string) => {
    confirmation.showConfirmation({
      title: 'Delete Note',
      description: 'Are you sure you want to delete this note? This action cannot be undone.',
      confirmText: 'Delete',
      cancelText: 'Cancel',
      variant: 'destructive',
      onConfirm: async () => {
        deleteNote.mutate(id)
      }
    })
  }

  // Filter notes based on search query
  const filteredNotes = useMemo(() => {
    if (!notes) return []
    if (!searchQuery.trim()) return notes
    
    const query = searchQuery.toLowerCase()
    return notes.filter(note => 
      note.content.toLowerCase().includes(query) ||
      note.member?.full_name?.toLowerCase().includes(query) ||
      note.member?.email?.toLowerCase().includes(query)
    )
  }, [notes, searchQuery])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    )
  }

  if (compact && (!notes || notes.length === 0) && !isAdding) {
    return (
      <div className="text-center py-8">
        <FileText className="h-8 w-8 text-gray-300 mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">No notes yet</p>
        <Button
          size="sm"
          variant="outline"
          className="mt-2"
          onClick={() => {
            console.log('Add First Note clicked, setting isAdding to true')
            setIsAdding(true)
          }}
        >
          <Plus className="h-4 w-4 mr-2" />
          Add First Note
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Search Bar and Notes Count - only show when there are notes */}
      {notes && notes.length > 0 && !compact && (
        <div className="space-y-2">
          {notes.length > 3 && (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search notes..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
              {searchQuery && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6"
                    onClick={() => setSearchQuery('')}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          )}
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>
              {searchQuery ? (
                <>Showing {filteredNotes.length} of {notes.length} notes</>
              ) : (
                <>{notes.length} {notes.length === 1 ? 'note' : 'notes'} total</>
              )}
            </span>
            {notes.filter(n => n.is_pinned).length > 0 && (
              <span className="flex items-center gap-1">
                <Pin className="h-3 w-3" />
                {notes.filter(n => n.is_pinned).length} pinned
              </span>
            )}
          </div>
        </div>
      )}

      {/* Add Note Section */}
      {(!compact || isAdding) && (
        <div>
          {isAdding ? (
            <Card className="p-4 space-y-3">
              <Textarea
                value={newNoteContent}
                onChange={(e) => setNewNoteContent(e.target.value)}
                placeholder="Enter your note..."
                className="min-h-[100px]"
                autoFocus
              />
              <div className="flex justify-end gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setIsAdding(false)
                    setNewNoteContent('')
                  }}
                >
                  <X className="h-4 w-4 mr-2" />
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleAddNote}
                  disabled={createNote.isPending || !newNoteContent.trim()}
                >
                  {createNote.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4 mr-2" />
                  )}
                  Save Note
                </Button>
              </div>
            </Card>
          ) : !compact ? (
            <Button
              onClick={() => {
                console.log('Add Note button clicked, setting isAdding to true')
                setIsAdding(true)
              }}
              className="w-full"
              variant="outline"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Note
            </Button>
          ) : null}
        </div>
      )}

      {/* Notes List */}
      <div className="space-y-3">
        {searchQuery && filteredNotes.length === 0 && (
          <div className="text-center py-8">
            <Search className="h-8 w-8 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No notes found matching "{searchQuery}"</p>
            <Button
              size="sm"
              variant="outline"
              className="mt-2"
              onClick={() => setSearchQuery('')}
            >
              Clear Search
            </Button>
          </div>
        )}
        {filteredNotes.map((note) => (
          <Card key={note.id} className="p-4">
            <div className="space-y-3">
              {/* Note Header */}
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    {note.is_pinned && (
                      <Badge variant="secondary" className="text-xs">
                        <Pin className="h-3 w-3 mr-1" />
                        Pinned
                      </Badge>
                    )}
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <User className="h-3 w-3" />
                        <span className="font-medium">{note.member?.full_name || 'Unknown'}</span>
                      </div>
                      <span>•</span>
                      <div className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        <span>{format(new Date(note.created_at), 'MMM d, yyyy h:mm a')}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    onClick={() => togglePin.mutate({ id: note.id, isPinned: note.is_pinned })}
                    title={note.is_pinned ? "Unpin note" : "Pin note"}
                  >
                    <Pin className={`h-4 w-4 ${note.is_pinned ? 'fill-current' : ''}`} />
                  </Button>
                  {editingNoteId !== note.id && (
                    <>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        onClick={() => handleStartEdit(note)}
                        title="Edit note"
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-red-600 hover:text-red-700"
                        onClick={() => handleDeleteNote(note.id)}
                        title="Delete note"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                </div>
              </div>

              {/* Note Content */}
              {editingNoteId === note.id ? (
                <div className="space-y-3">
                  <Textarea
                    value={editingContent}
                    onChange={(e) => setEditingContent(e.target.value)}
                    className="min-h-[100px]"
                    autoFocus
                  />
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground italic">
                      Tip: Changes auto-save after 1 second
                    </span>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleCancelEdit}
                      >
                        <X className="h-4 w-4 mr-2" />
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => {
                          if (editingContent.trim()) {
                            updateNote.mutate({ id: note.id, content: editingContent })
                          }
                        }}
                        disabled={!editingContent.trim() || updateNote.isPending}
                      >
                        {updateNote.isPending ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <Save className="h-4 w-4 mr-2" />
                        )}
                        Save
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-sm whitespace-pre-wrap">{note.content}</p>
              )}

              {/* Updated timestamp */}
              {note.updated_at && note.updated_at !== note.created_at && (
                <p className="text-xs text-muted-foreground">
                  Updated: {format(new Date(note.updated_at), 'MMM d, yyyy h:mm a')}
                </p>
              )}
            </div>
          </Card>
        ))}
      </div>

      {/* Empty State */}
      {!compact && (!notes || notes.length === 0) && !isAdding && (
        <div className="text-center py-12">
          <FileText className="h-12 w-12 text-gray-300 mx-auto mb-3" />
          <p className="text-muted-foreground mb-4">No notes for this contact yet</p>
          <Button onClick={() => setIsAdding(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add First Note
          </Button>
        </div>
      )}

      {/* Confirmation Dialog */}
      <ConfirmationDialog
        isOpen={confirmation.isOpen}
        onClose={confirmation.hideConfirmation}
        onConfirm={confirmation.handleConfirm}
        title={confirmation.title}
        description={confirmation.description}
        confirmText={confirmation.confirmText}
        cancelText={confirmation.cancelText}
        variant={confirmation.variant}
        isLoading={confirmation.isLoading}
      />
    </div>
  )
}