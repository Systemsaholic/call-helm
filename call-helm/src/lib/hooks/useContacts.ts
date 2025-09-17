import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/lib/hooks/useAuth'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'

export interface Contact {
  id: string
  organization_id: string
  full_name: string
  first_name?: string
  last_name?: string
  phone_number: string
  phone?: string
  email?: string
  company?: string
  address?: string
  city?: string
  state?: string
  country?: string
  postal_code?: string
  position?: string
  notes?: string
  tags?: string[]
  custom_fields?: Record<string, any>
  status: 'active' | 'inactive' | 'do_not_call' | 'duplicate' | 'invalid'
  do_not_call_reason?: string
  source?: string
  source_id?: string
  imported_at?: string
  imported_by?: string
  is_duplicate_of?: string
  created_at: string
  updated_at: string
  deleted_at?: string
}

export interface ContactInput {
  full_name: string
  phone_number: string
  email?: string
  company?: string
  address?: string
  city?: string
  state?: string
  country?: string
  postal_code?: string
  position?: string
  notes?: string
  tags?: string[]
  custom_fields?: Record<string, any>
  status?: 'active' | 'inactive' | 'do_not_call'
}

export interface ContactFilters {
  searchTerm?: string
  status?: string
  tags?: string[]
  hasAssignments?: boolean
  callListId?: string
  assignedToMe?: boolean
}

// Query keys
export const contactKeys = {
  all: ['contacts'] as const,
  lists: () => [...contactKeys.all, 'list'] as const,
  list: (filters?: ContactFilters) => [...contactKeys.lists(), filters] as const,
  detail: (id: string) => [...contactKeys.all, 'detail', id] as const,
  duplicates: (phoneNumber: string) => [...contactKeys.all, 'duplicates', phoneNumber] as const,
  history: (id: string) => [...contactKeys.all, 'history', id] as const,
}

// Fetch contacts
export function useContacts(filters?: ContactFilters) {
  const { supabase, user } = useAuth()

  return useQuery({
    queryKey: contactKeys.list(filters),
    queryFn: async () => {
      let query = supabase
        .from('contacts')
        .select(`
          *,
          call_list_contacts!inner(
            id,
            call_list_id,
            assigned_to,
            status
          )
        `)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })

      // Apply filters
      if (filters?.searchTerm) {
        query = query.or(`full_name.ilike.%${filters.searchTerm}%,phone_number.ilike.%${filters.searchTerm}%,email.ilike.%${filters.searchTerm}%,company.ilike.%${filters.searchTerm}%`)
      }

      if (filters?.status && filters.status !== 'all') {
        query = query.eq('status', filters.status)
      }

      if (filters?.tags && filters.tags.length > 0) {
        query = query.contains('tags', filters.tags)
      }

      if (filters?.callListId) {
        query = query.eq('call_list_contacts.call_list_id', filters.callListId)
      }

      if (filters?.assignedToMe) {
        // Get current user's member ID
        const { data: member } = await supabase
          .from('organization_members')
          .select('id')
          .eq('user_id', user?.id)
          .single()

        if (member) {
          query = query.eq('call_list_contacts.assigned_to', member.id)
        }
      }

      const { data, error } = await query

      if (error) throw error

      // For regular users (agents), the RLS will filter to only show assigned contacts
      // For admins/team leads, all org contacts will be shown
      return data as Contact[]
    },
    enabled: !!user,
  })
}

// Fetch single contact
export function useContact(contactId: string) {
  const { supabase, user } = useAuth()

  return useQuery({
    queryKey: contactKeys.detail(contactId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contacts')
        .select(`
          *,
          call_list_contacts(
            id,
            call_list_id,
            assigned_to,
            status,
            call_list:call_lists(
              id,
              name,
              status
            )
          )
        `)
        .eq('id', contactId)
        .single()

      if (error) throw error
      return data as Contact
    },
    enabled: !!user && !!contactId,
  })
}

// Create contact
export function useCreateContact() {
  const { supabase, user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: ContactInput) => {
      // Get user's organization
      const { data: member } = await supabase
        .from('organization_members')
        .select('organization_id, id')
        .eq('user_id', user?.id)
        .single()

      if (!member) throw new Error('No organization found')

      // Check for duplicates
      const { data: existingContact } = await supabase
        .from('contacts')
        .select('id, full_name')
        .eq('organization_id', member.organization_id)
        .eq('phone_normalized', input.phone_number.replace(/[^0-9+]/g, ''))
        .single()

      if (existingContact) {
        throw new Error(`Contact with this phone number already exists: ${existingContact.full_name}`)
      }

      // Parse full name into first and last if not provided
      let firstName = input.full_name
      let lastName = ''
      
      if (input.full_name.includes(' ')) {
        const parts = input.full_name.split(' ')
        firstName = parts[0]
        lastName = parts.slice(1).join(' ')
      }

      // Create contact
      const { data, error } = await supabase
        .from('contacts')
        .insert({
          organization_id: member.organization_id,
          // full_name is a generated column, don't include it
          first_name: firstName,
          last_name: lastName,
          phone_number: input.phone_number,
          email: input.email,
          company: input.company,
          address: input.address,
          city: input.city,
          state: input.state,
          country: input.country || 'US',
          postal_code: input.postal_code,
          position: input.position,
          notes: input.notes,
          tags: input.tags || [],
          custom_fields: input.custom_fields || {},
          status: input.status || 'active',
          source: 'manual',
          imported_by: member.id,
          imported_at: new Date().toISOString(),
        })
        .select()
        .single()

      if (error) throw error

      // Log to contact history
      await supabase
        .from('contact_history')
        .insert({
          contact_id: data.id,
          organization_id: member.organization_id,
          event_type: 'created',
          event_data: { action: 'contact_created', by: user?.email },
          created_by: member.id,
        })

      return data as Contact
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: contactKeys.lists() })
      toast.success('Contact created successfully')
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to create contact')
    },
  })
}

// Update contact
export function useUpdateContact() {
  const { supabase, user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<ContactInput> }) => {
      // Get user's member ID
      const { data: member } = await supabase
        .from('organization_members')
        .select('id, organization_id')
        .eq('user_id', user?.id)
        .single()

      if (!member) throw new Error('No organization found')

      // Update contact
      const { data, error } = await supabase
        .from('contacts')
        .update({
          ...updates,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single()

      if (error) throw error

      // Log to contact history
      await supabase
        .from('contact_history')
        .insert({
          contact_id: id,
          organization_id: member.organization_id,
          event_type: 'updated',
          event_data: { action: 'contact_updated', changes: updates, by: user?.email },
          created_by: member.id,
        })

      return data as Contact
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: contactKeys.lists() })
      queryClient.invalidateQueries({ queryKey: contactKeys.detail(data.id) })
      toast.success('Contact updated successfully')
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to update contact')
    },
  })
}

// Delete contacts (soft delete)
export function useDeleteContacts() {
  const { supabase, user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (contactIds: string[]) => {
      // Soft delete by setting deleted_at
      const { error } = await supabase
        .from('contacts')
        .update({ 
          deleted_at: new Date().toISOString(),
          status: 'inactive'
        })
        .in('id', contactIds)

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: contactKeys.lists() })
      toast.success('Contact(s) deleted successfully')
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to delete contact(s)')
    },
  })
}

// Import contacts from CSV
export function useImportContacts() {
  const { supabase, user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (contacts: ContactInput[]) => {
      // Get user's organization
      const { data: member } = await supabase
        .from('organization_members')
        .select('organization_id, id')
        .eq('user_id', user?.id)
        .single()

      if (!member) throw new Error('No organization found')

      // Check quota
      const supabaseAdmin = createClient()
      const canAdd = await supabaseAdmin.rpc('check_quota', {
        p_organization_id: member.organization_id,
        p_resource: 'contacts',
        p_count: contacts.length
      })

      if (!canAdd) {
        throw new Error(`Adding ${contacts.length} contacts would exceed your plan limit. Please upgrade your plan or remove some existing contacts.`)
      }

      // Prepare contacts for bulk insert
      const contactRecords = contacts.map(contact => {
        // Parse full name
        let firstName = contact.full_name
        let lastName = ''
        
        if (contact.full_name.includes(' ')) {
          const parts = contact.full_name.split(' ')
          firstName = parts[0]
          lastName = parts.slice(1).join(' ')
        }

        return {
          organization_id: member.organization_id,
          // full_name is a generated column, don't include it
          first_name: firstName,
          last_name: lastName,
          phone_number: contact.phone_number,
          email: contact.email,
          company: contact.company,
          address: contact.address,
          city: contact.city,
          state: contact.state,
          country: contact.country || 'US',
          postal_code: contact.postal_code,
          position: contact.position,
          notes: contact.notes,
          tags: contact.tags || [],
          custom_fields: contact.custom_fields || {},
          status: contact.status || 'active',
          source: 'csv_import',
          imported_by: member.id,
          imported_at: new Date().toISOString(),
        }
      })

      // Insert contacts (duplicates will be skipped due to unique constraint)
      const { data, error } = await supabase
        .from('contacts')
        .insert(contactRecords)
        .select()

      if (error) {
        if (error.message.includes('duplicate')) {
          throw new Error('Some contacts have duplicate phone numbers and were skipped')
        }
        throw error
      }

      // Log import to history
      for (const contact of data) {
        await supabase
          .from('contact_history')
          .insert({
            contact_id: contact.id,
            organization_id: member.organization_id,
            event_type: 'imported',
            event_data: { 
              action: 'contact_imported', 
              source: 'csv',
              by: user?.email 
            },
            created_by: member.id,
          })
      }

      return data as Contact[]
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: contactKeys.lists() })
      toast.success(`${data.length} contacts imported successfully`)
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to import contacts')
    },
  })
}

// Check for duplicate contacts
export function useCheckDuplicates(phoneNumber: string) {
  const { supabase, user } = useAuth()

  return useQuery({
    queryKey: contactKeys.duplicates(phoneNumber),
    queryFn: async () => {
      // Get user's organization
      const { data: member } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user?.id)
        .single()

      if (!member) throw new Error('No organization found')

      const normalizedPhone = phoneNumber.replace(/[^0-9+]/g, '')

      const { data, error } = await supabase
        .from('contacts')
        .select('id, full_name, phone_number, email, company')
        .eq('organization_id', member.organization_id)
        .eq('phone_normalized', normalizedPhone)
        .is('deleted_at', null)

      if (error) throw error
      return data as Contact[]
    },
    enabled: !!user && !!phoneNumber && phoneNumber.length > 0,
  })
}

// Get contact history
export function useContactHistory(contactId: string) {
  const { supabase, user } = useAuth()

  return useQuery({
    queryKey: contactKeys.history(contactId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contact_history')
        .select(`
          *,
          created_by_member:organization_members!contact_history_created_by_fkey(
            id,
            full_name,
            email
          )
        `)
        .eq('contact_id', contactId)
        .order('created_at', { ascending: false })

      if (error) throw error
      return data
    },
    enabled: !!user && !!contactId,
  })
}

// Merge duplicate contacts
export function useMergeDuplicates() {
  const { supabase, user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ primaryId, duplicateIds }: { primaryId: string; duplicateIds: string[] }) => {
      // Get user's member ID
      const { data: member } = await supabase
        .from('organization_members')
        .select('id, organization_id')
        .eq('user_id', user?.id)
        .single()

      if (!member) throw new Error('No organization found')

      // Mark duplicates as merged
      const { error } = await supabase
        .from('contacts')
        .update({
          status: 'duplicate',
          is_duplicate_of: primaryId,
          deleted_at: new Date().toISOString(),
        })
        .in('id', duplicateIds)

      if (error) throw error

      // Log merge action
      await supabase
        .from('contact_history')
        .insert({
          contact_id: primaryId,
          organization_id: member.organization_id,
          event_type: 'merge',
          event_data: {
            action: 'contacts_merged',
            merged_ids: duplicateIds,
            by: user?.email
          },
          created_by: member.id,
        })

      return { primaryId, mergedCount: duplicateIds.length }
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: contactKeys.lists() })
      queryClient.invalidateQueries({ queryKey: contactKeys.detail(data.primaryId) })
      toast.success(`${data.mergedCount} duplicate(s) merged successfully`)
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to merge duplicates')
    },
  })
}