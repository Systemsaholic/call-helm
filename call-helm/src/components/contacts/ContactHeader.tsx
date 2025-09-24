'use client'

import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { EditContactModal } from './modals/EditContactModal'
import { SimpleCallButton } from '@/components/calls/SimpleCallButton'
import { useConfirmation } from '@/lib/hooks/useConfirmation'
import { ConfirmationDialog } from '@/components/ui/confirmation-dialog'
import { 
  Phone, 
  Mail, 
  Building, 
  MapPin, 
  Edit, 
  Trash2,
  MoreVertical,
  Tag,
  AlertCircle,
  CheckCircle
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { type Contact, useDeleteContacts, useUpdateContact, contactKeys } from '@/lib/hooks/useContacts'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'

interface ContactHeaderProps {
  contact: Contact
}

export function ContactHeader({ contact }: ContactHeaderProps) {
  const [showEditModal, setShowEditModal] = useState(false)
  const queryClient = useQueryClient()
  const deleteContacts = useDeleteContacts()
  const updateContact = useUpdateContact()
  const router = useRouter()
  const confirmation = useConfirmation()

  const handleDelete = async () => {
    confirmation.showConfirmation({
      title: 'Delete Contact',
      description: `Are you sure you want to delete ${contact.full_name}? This action cannot be undone.`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      variant: 'destructive',
      onConfirm: async () => {
        try {
          await deleteContacts.mutateAsync([contact.id])
          toast.success('Contact deleted successfully')
          router.push('/dashboard/contacts')
        } catch (error) {
          toast.error('Failed to delete contact')
        }
      }
    })
  }

  const handleStatusChange = async (status: 'active' | 'inactive' | 'do_not_call') => {
    try {
      await updateContact.mutateAsync({
        id: contact.id,
        data: { status }
      })
      // Invalidate the contact detail query to update the UI immediately
      queryClient.invalidateQueries({ queryKey: contactKeys.detail(contact.id) })
      queryClient.invalidateQueries({ queryKey: contactKeys.lists() })
      toast.success('Contact status updated')
    } catch (error) {
      toast.error('Failed to update status')
    }
  }

  const getStatusBadge = (status: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
      active: 'default',
      inactive: 'secondary',
      do_not_call: 'destructive',
    }
    return <Badge variant={variants[status] || 'outline'}>{status.replace('_', ' ')}</Badge>
  }

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }

  return (
    <>
      <div className="bg-white border rounded-lg p-6">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-4">
            {/* Avatar */}
            <Avatar className="h-16 w-16">
              <AvatarFallback className="text-lg">
                {getInitials(contact.full_name)}
              </AvatarFallback>
            </Avatar>

            {/* Contact Info */}
            <div>
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-2xl font-bold">{contact.full_name}</h1>
                {getStatusBadge(contact.status)}
              </div>

              <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                {contact.phone_number && (
                  <div className="flex items-center gap-1">
                    <Phone className="h-4 w-4" />
                    <span>{contact.phone_number}</span>
                  </div>
                )}
                {contact.email && (
                  <div className="flex items-center gap-1">
                    <Mail className="h-4 w-4" />
                    <span>{contact.email}</span>
                  </div>
                )}
                {contact.company && (
                  <div className="flex items-center gap-1">
                    <Building className="h-4 w-4" />
                    <span>{contact.company}</span>
                    {contact.position && <span>• {contact.position}</span>}
                  </div>
                )}
                {(contact.city || contact.state) && (
                  <div className="flex items-center gap-1">
                    <MapPin className="h-4 w-4" />
                    <span>
                      {contact.city && `${contact.city}, `}
                      {contact.state}
                    </span>
                  </div>
                )}
              </div>

              {/* Tags */}
              {contact.tags && contact.tags.length > 0 && (
                <div className="flex items-center gap-2 mt-3">
                  <Tag className="h-4 w-4 text-muted-foreground" />
                  <div className="flex flex-wrap gap-1">
                    {contact.tags.map((tag) => (
                      <Badge key={tag} variant="secondary" className="text-xs">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            <SimpleCallButton
              phoneNumber={contact.phone_number}
              contactId={contact.id}
              contactName={contact.full_name}
              contactStatus={contact.status}
              size="default"
            />
            
            <Button
              variant="outline"
              size="default"
              onClick={() => setShowEditModal(true)}
            >
              <Edit className="h-4 w-4 mr-2" />
              Edit
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                <DropdownMenuSeparator />
                
                {contact.email && (
                  <DropdownMenuItem onClick={() => window.location.href = `mailto:${contact.email}`}>
                    <Mail className="h-4 w-4 mr-2" />
                    Send Email
                  </DropdownMenuItem>
                )}
                
                <DropdownMenuSeparator />
                
                {contact.status !== 'active' && (
                  <DropdownMenuItem onClick={() => handleStatusChange('active')}>
                    <AlertCircle className="h-4 w-4 mr-2" />
                    Mark as Active
                  </DropdownMenuItem>
                )}
                
                {contact.status !== 'inactive' && (
                  <DropdownMenuItem onClick={() => handleStatusChange('inactive')}>
                    <AlertCircle className="h-4 w-4 mr-2" />
                    Mark as Inactive
                  </DropdownMenuItem>
                )}
                
                {contact.status !== 'do_not_call' ? (
                  <DropdownMenuItem onClick={() => handleStatusChange('do_not_call')}>
                    <Phone className="h-4 w-4 mr-2" />
                    Mark as Do Not Call
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem onClick={() => handleStatusChange('active')}>
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Remove Do Not Call
                  </DropdownMenuItem>
                )}
                
                <DropdownMenuSeparator />
                
                <DropdownMenuItem 
                  onClick={handleDelete}
                  className="text-red-600 focus:text-red-600"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete Contact
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      {/* Edit Modal */}
      <EditContactModal
        contact={contact}
        open={showEditModal}
        onOpenChange={setShowEditModal}
      />

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
    </>
  )
}