'use client'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { 
  Phone, 
  Mail, 
  Building, 
  MapPin, 
  Calendar, 
  User, 
  Clock,
  PhoneCall,
  AlertCircle
} from 'lucide-react'
import { type Contact } from '@/lib/hooks/useContacts'
import { useCallAttempts } from '@/lib/hooks/useCallTracking'
import { format } from 'date-fns'

interface ViewContactModalProps {
  contact: Contact | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ViewContactModal({ contact, open, onOpenChange }: ViewContactModalProps) {
  const { data: callAttempts } = useCallAttempts(contact?.id || '')

  if (!contact) return null

  const getStatusBadge = (status: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
      active: 'default',
      inactive: 'secondary',
      do_not_call: 'destructive',
    }
    return <Badge variant={variants[status] || 'outline'}>{status.replace('_', ' ')}</Badge>
  }

  const getDispositionBadge = (disposition: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
      sale_made: 'default',
      appointment_set: 'default',
      callback_requested: 'secondary',
      not_interested: 'destructive',
      do_not_call: 'destructive',
      wrong_number: 'destructive',
      disconnected: 'destructive',
    }
    return <Badge variant={variants[disposition] || 'outline'}>{disposition.replace('_', ' ')}</Badge>
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Contact Details</DialogTitle>
          <DialogDescription>
            View complete information about this contact
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Basic Information */}
          <div>
            <h3 className="text-lg font-semibold mb-3">Basic Information</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-start gap-3">
                <User className="h-4 w-4 mt-1 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">Full Name</p>
                  <p className="font-medium">{contact.full_name}</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Phone className="h-4 w-4 mt-1 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">Phone Number</p>
                  <p className="font-medium">{contact.phone_number}</p>
                </div>
              </div>

              {contact.email && (
                <div className="flex items-start gap-3">
                  <Mail className="h-4 w-4 mt-1 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">Email</p>
                    <p className="font-medium">{contact.email}</p>
                  </div>
                </div>
              )}

              <div className="flex items-start gap-3">
                <AlertCircle className="h-4 w-4 mt-1 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">Status</p>
                  {getStatusBadge(contact.status)}
                </div>
              </div>
            </div>
          </div>

          {/* Company Information */}
          {(contact.company || contact.position) && (
            <div>
              <h3 className="text-lg font-semibold mb-3">Company Information</h3>
              <div className="grid grid-cols-2 gap-4">
                {contact.company && (
                  <div className="flex items-start gap-3">
                    <Building className="h-4 w-4 mt-1 text-muted-foreground" />
                    <div>
                      <p className="text-sm text-muted-foreground">Company</p>
                      <p className="font-medium">{contact.company}</p>
                    </div>
                  </div>
                )}

                {contact.position && (
                  <div className="flex items-start gap-3">
                    <User className="h-4 w-4 mt-1 text-muted-foreground" />
                    <div>
                      <p className="text-sm text-muted-foreground">Position</p>
                      <p className="font-medium">{contact.position}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Address Information */}
          {(contact.address || contact.city || contact.state) && (
            <div>
              <h3 className="text-lg font-semibold mb-3">Address</h3>
              <div className="flex items-start gap-3">
                <MapPin className="h-4 w-4 mt-1 text-muted-foreground" />
                <div>
                  {contact.address && <p>{contact.address}</p>}
                  {(contact.city || contact.state || contact.postal_code) && (
                    <p>
                      {contact.city && `${contact.city}, `}
                      {contact.state} {contact.postal_code}
                    </p>
                  )}
                  {contact.country && contact.country !== 'US' && <p>{contact.country}</p>}
                </div>
              </div>
            </div>
          )}

          {/* Tags */}
          {contact.tags && contact.tags.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold mb-3">Tags</h3>
              <div className="flex flex-wrap gap-2">
                {contact.tags.map((tag) => (
                  <Badge key={tag} variant="secondary">
                    {tag}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Notes */}
          {contact.notes && (
            <div>
              <h3 className="text-lg font-semibold mb-3">Notes</h3>
              <p className="text-sm whitespace-pre-wrap">{contact.notes}</p>
            </div>
          )}

          {/* Call History */}
          {callAttempts && callAttempts.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold mb-3">Call History</h3>
              <div className="space-y-2">
                {callAttempts.map((attempt: any) => (
                  <div key={attempt.id} className="border rounded-lg p-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3">
                        <PhoneCall className="h-4 w-4 mt-1 text-muted-foreground" />
                        <div>
                          <p className="text-sm font-medium">
                            Attempt #{attempt.attempt_number}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {format(new Date(attempt.started_at), 'PPp')}
                          </p>
                        </div>
                      </div>
                      {getDispositionBadge(attempt.disposition)}
                    </div>
                    
                    {attempt.duration_seconds && (
                      <div className="flex items-center gap-2 mt-2">
                        <Clock className="h-3 w-3 text-muted-foreground" />
                        <span className="text-sm text-muted-foreground">
                          Duration: {Math.floor(attempt.duration_seconds / 60)}m {attempt.duration_seconds % 60}s
                        </span>
                      </div>
                    )}
                    
                    {attempt.disposition_notes && (
                      <p className="text-sm mt-2 pl-7">{attempt.disposition_notes}</p>
                    )}
                    
                    {attempt.callback_requested && attempt.callback_date && (
                      <div className="flex items-center gap-2 mt-2 pl-7">
                        <Calendar className="h-3 w-3 text-muted-foreground" />
                        <span className="text-sm text-muted-foreground">
                          Callback: {format(new Date(attempt.callback_date), 'PPp')}
                        </span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Metadata */}
          <div className="border-t pt-4">
            <div className="grid grid-cols-2 gap-4 text-sm text-muted-foreground">
              <div>
                <span>Created: </span>
                <span>{format(new Date(contact.created_at), 'PPp')}</span>
              </div>
              {contact.updated_at && (
                <div>
                  <span>Updated: </span>
                  <span>{format(new Date(contact.updated_at), 'PPp')}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}