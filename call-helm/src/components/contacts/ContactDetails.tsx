'use client'

import { type Contact } from '@/lib/hooks/useContacts'
import { format } from 'date-fns'
import { 
  User, 
  Phone, 
  Mail, 
  Building, 
  MapPin, 
  Calendar, 
  Clock,
  Tag,
  FileText,
  Globe,
  Briefcase
} from 'lucide-react'

interface ContactDetailsProps {
  contact: Contact
}

export function ContactDetails({ contact }: ContactDetailsProps) {
  const DetailItem = ({ 
    icon: Icon, 
    label, 
    value 
  }: { 
    icon: any, 
    label: string, 
    value: string | undefined | null 
  }) => {
    if (!value) return null
    
    return (
      <div className="flex items-start gap-3 py-3 border-b last:border-0">
        <Icon className="h-4 w-4 mt-0.5 text-muted-foreground flex-shrink-0" />
        <div className="flex-1">
          <p className="text-sm text-muted-foreground mb-1">{label}</p>
          <p className="text-sm font-medium">{value}</p>
        </div>
      </div>
    )
  }

  const formatAddress = () => {
    const parts = []
    if (contact.address) parts.push(contact.address)
    
    const cityState = []
    if (contact.city) cityState.push(contact.city)
    if (contact.state) cityState.push(contact.state)
    if (cityState.length > 0) {
      parts.push(cityState.join(', '))
    }
    
    if (contact.postal_code) parts.push(contact.postal_code)
    if (contact.country && contact.country !== 'US') parts.push(contact.country)
    
    return parts.join('\n')
  }

  const hasAddress = contact.address || contact.city || contact.state || contact.postal_code || contact.country

  return (
    <div className="space-y-1">
      {/* Basic Information */}
      <DetailItem 
        icon={User} 
        label="Full Name" 
        value={contact.full_name} 
      />
      
      <DetailItem 
        icon={Phone} 
        label="Phone Number" 
        value={contact.phone_number} 
      />
      
      <DetailItem 
        icon={Mail} 
        label="Email Address" 
        value={contact.email} 
      />

      {/* Company Information */}
      <DetailItem 
        icon={Building} 
        label="Company" 
        value={contact.company} 
      />
      
      <DetailItem 
        icon={Briefcase} 
        label="Position" 
        value={contact.position} 
      />

      {/* Address */}
      {hasAddress && (
        <div className="flex items-start gap-3 py-3 border-b">
          <MapPin className="h-4 w-4 mt-0.5 text-muted-foreground flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm text-muted-foreground mb-1">Address</p>
            <p className="text-sm font-medium whitespace-pre-line">{formatAddress()}</p>
          </div>
        </div>
      )}

      {/* Source */}
      <DetailItem 
        icon={Globe} 
        label="Source" 
        value={contact.source} 
      />

      {/* Notes */}
      {contact.notes && (
        <div className="flex items-start gap-3 py-3 border-b">
          <FileText className="h-4 w-4 mt-0.5 text-muted-foreground flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm text-muted-foreground mb-1">Notes</p>
            <p className="text-sm whitespace-pre-wrap">{contact.notes}</p>
          </div>
        </div>
      )}

      {/* Custom Fields */}
      {contact.custom_fields && Object.keys(contact.custom_fields).length > 0 && (
        <div className="py-3 border-b">
          <p className="text-sm text-muted-foreground mb-2">Custom Fields</p>
          <div className="space-y-2">
            {Object.entries(contact.custom_fields).map(([key, value]) => (
              <div key={key} className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground capitalize">
                  {key.replace(/_/g, ' ')}:
                </span>
                <span className="text-sm font-medium">{String(value)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Metadata */}
      <div className="pt-3 space-y-2">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <Calendar className="h-4 w-4" />
          <span>Created: {format(new Date(contact.created_at), 'PPp')}</span>
        </div>
        {contact.updated_at && (
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <Clock className="h-4 w-4" />
            <span>Updated: {format(new Date(contact.updated_at), 'PPp')}</span>
          </div>
        )}
      </div>
    </div>
  )
}