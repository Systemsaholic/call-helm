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
  custom_fields?: Record<string, string | number | boolean | null>
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
  full_name?: string // For display/backwards compatibility
  first_name?: string
  last_name?: string
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
  custom_fields?: Record<string, string | number | boolean | null>
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
        .select('*')
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
        // For call list filtering, we need to join with call_list_contacts
        const { data: callListContacts } = await supabase
          .from('call_list_contacts')
          .select('contact_id')
          .eq('call_list_id', filters.callListId)
        
        if (callListContacts) {
          const contactIds = callListContacts.map(clc => clc.contact_id)
          if (contactIds.length > 0) {
            query = query.in('id', contactIds)
          }
        }
      }

      if (filters?.assignedToMe) {
        // Get current user's member ID
        const { data: member } = await supabase
          .from('organization_members')
          .select('id')
          .eq('user_id', user?.id)
          .single()

        if (member) {
          // Get contacts assigned to this member
          const { data: callListContacts } = await supabase
            .from('call_list_contacts')
            .select('contact_id')
            .eq('assigned_to', member.id)
          
          if (callListContacts) {
            const contactIds = callListContacts.map(clc => clc.contact_id)
            if (contactIds.length > 0) {
              query = query.in('id', contactIds)
            }
          }
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
      let firstName = input.first_name || ''
      let lastName = input.last_name || ''
      
      // If full_name is provided but not first/last name, parse it
      if (input.full_name && !input.first_name && !input.last_name) {
        if (input.full_name.includes(' ')) {
          const parts = input.full_name.split(' ')
          firstName = parts[0]
          lastName = parts.slice(1).join(' ')
        } else {
          firstName = input.full_name
        }
      } else if (!input.full_name && !input.first_name && !input.last_name) {
        throw new Error('Contact name is required')
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
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create contact')
    },
  })
}

// Update contact
export function useUpdateContact() {
  const { supabase, user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, data: updates }: { id: string; data: Partial<ContactInput> }) => {
      // Get user's member ID
      const { data: member } = await supabase
        .from('organization_members')
        .select('id, organization_id')
        .eq('user_id', user?.id)
        .single()

      if (!member) throw new Error('No organization found')

      // Prepare the update object, excluding full_name if present
      const updateData: Partial<ContactInput> & { first_name?: string; last_name?: string } = { ...updates }
      
      // If full_name is provided, split it into first_name and last_name
      if (updates.full_name) {
        const parts = updates.full_name.split(' ')
        updateData.first_name = parts[0]
        updateData.last_name = parts.slice(1).join(' ') || ''
        delete updateData.full_name // Remove full_name as it's a generated column
      }

      // Update contact
      const { data, error } = await supabase
        .from('contacts')
        .update({
          ...updateData,
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
    onMutate: async ({ id, data: updates }) => {
      // Cancel outgoing refetches (so they don't overwrite our optimistic update)
      await queryClient.cancelQueries({ queryKey: contactKeys.lists() })
      await queryClient.cancelQueries({ queryKey: contactKeys.detail(id) })

      // Snapshot the previous value
      const previousContacts = queryClient.getQueryData<Contact[]>(contactKeys.lists())
      const previousDetail = queryClient.getQueryData<Contact>(contactKeys.detail(id))
      
      // Optimistically update to the new value
      queryClient.setQueriesData(
        { queryKey: contactKeys.lists() },
        (old: Contact[] | undefined) => {
          if (!old) return old
          return old.map((contact: Contact) =>
            contact.id === id ? { ...contact, ...updates, updated_at: new Date().toISOString() } : contact
          )
        }
      )

      queryClient.setQueryData(
        contactKeys.detail(id),
        (old: Contact | undefined) => {
          if (!old) return old
          return { ...old, ...updates, updated_at: new Date().toISOString() }
        }
      )
      
      // Return a context with the previous and new data
      return { previousContacts, previousDetail, id }
    },
    onError: (error: Error, variables, context: { previousContacts?: Contact[]; previousDetail?: Contact; id: string } | undefined) => {
      // If the mutation fails, use the context to roll back
      if (context?.previousContacts) {
        queryClient.setQueriesData({ queryKey: contactKeys.lists() }, context.previousContacts)
      }
      if (context?.previousDetail) {
        queryClient.setQueryData(contactKeys.detail(context.id), context.previousDetail)
      }
      toast.error(error.message || 'Failed to update contact')
    },
    onSettled: (data, error, variables) => {
      // Always refetch after error or success to ensure we're in sync
      queryClient.invalidateQueries({ queryKey: contactKeys.lists() })
      queryClient.invalidateQueries({ queryKey: contactKeys.detail(variables.id) })
      // Also invalidate stats queries that depend on contact details
      queryClient.invalidateQueries({ queryKey: [...contactKeys.detail(variables.id), 'stats'] })
    },
    onSuccess: (data) => {
      toast.success('Contact updated successfully')
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
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete contact(s)')
    },
  })
}

// Import contacts from CSV
export type DuplicateStrategy = 'skip' | 'update' | 'create'

export function useImportContacts() {
  const { supabase, user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ contacts, strategy = 'skip' }: { contacts: ContactInput[]; strategy?: DuplicateStrategy }) => {
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
        let firstName = contact.full_name || ''
        let lastName = ''
        
        if (contact.full_name?.includes(' ')) {
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

      // Handle different duplicate strategies
      let data: Contact[] = []
      let error: any = null

      if (strategy === 'update') {
        // Use upsert to update existing contacts based on phone_normalized
        // First, we need to handle this differently since phone_normalized is a generated column
        // We'll update existing contacts and insert new ones
        const results: Contact[] = []

        // Helper to get all possible normalized phone formats for matching
        const getPhoneVariants = (phone: string): string[] => {
          const digitsOnly = phone.replace(/[^0-9]/g, '')
          const withPlus = phone.replace(/[^0-9+]/g, '')
          const variants = [digitsOnly, withPlus]

          // If 10 digits, also try with +1 and 1 prefix (US number)
          if (digitsOnly.length === 10) {
            variants.push(`1${digitsOnly}`, `+1${digitsOnly}`)
          }
          // If 11 digits starting with 1, also try without the 1
          if (digitsOnly.length === 11 && digitsOnly.startsWith('1')) {
            variants.push(digitsOnly.slice(1), `+${digitsOnly}`)
          }

          return [...new Set(variants)]
        }

        for (const record of contactRecords) {
          const phoneVariants = getPhoneVariants(record.phone_number)

          // Check if contact exists by trying all phone variants
          let existing: { id: string } | null = null
          for (const variant of phoneVariants) {
            const { data: found } = await supabase
              .from('contacts')
              .select('id')
              .eq('organization_id', member.organization_id)
              .eq('phone_normalized', variant)
              .is('deleted_at', null)
              .single()

            if (found) {
              existing = found
              break
            }
          }

          if (existing) {
            // Update existing contact
            const { data: updated, error: updateError } = await supabase
              .from('contacts')
              .update({
                first_name: record.first_name,
                last_name: record.last_name,
                email: record.email,
                company: record.company,
                address: record.address,
                city: record.city,
                state: record.state,
                country: record.country,
                postal_code: record.postal_code,
                position: record.position,
                notes: record.notes,
                tags: record.tags,
                custom_fields: record.custom_fields,
                updated_at: new Date().toISOString(),
              })
              .eq('id', existing.id)
              .select()
              .single()

            if (updateError) {
              console.error('Error updating contact:', updateError)
            } else if (updated) {
              results.push(updated as Contact)
            }
          } else {
            // Insert new contact
            const { data: inserted, error: insertError } = await supabase
              .from('contacts')
              .insert(record)
              .select()
              .single()

            if (insertError) {
              console.error('Error inserting contact:', insertError)
            } else if (inserted) {
              results.push(inserted as Contact)
            }
          }
        }

        data = results
      } else if (strategy === 'create') {
        // Create anyway - add suffix to phone number to avoid conflicts
        const recordsWithUniquePhones = contactRecords.map((record, index) => ({
          ...record,
          phone_number: `${record.phone_number}-dup-${Date.now()}-${index}`,
          notes: `${record.notes || ''}\n[Original phone: ${record.phone_number}]`.trim(),
        }))

        const result = await supabase
          .from('contacts')
          .insert(recordsWithUniquePhones)
          .select()

        data = result.data || []
        error = result.error
      } else {
        // Default: skip duplicates (insert and let constraint handle it)
        const result = await supabase
          .from('contacts')
          .insert(contactRecords)
          .select()

        data = result.data || []
        error = result.error
      }

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
    onError: (error: Error) => {
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
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to merge duplicates')
    },
  })
}