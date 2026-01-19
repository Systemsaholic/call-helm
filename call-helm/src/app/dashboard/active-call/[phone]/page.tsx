'use client'

import { useState, useEffect, use } from 'react'
import { useAuth } from '@/lib/hooks/useAuth'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Phone,
  User,
  Building2,
  Mail,
  FileText,
  Clock,
  Save,
  Calendar,
  ThumbsUp,
  ThumbsDown,
  Minus,
  AlertCircle,
  CheckCircle2,
  History,
  Loader2,
  Target,
  Tag,
  ScrollText,
  ChevronDown,
  ChevronUp,
  Pencil,
} from 'lucide-react'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { normalizePhoneNumber } from '@/lib/utils/phone'
import { processScriptTemplate, buildScriptVariables } from '@/lib/utils/scriptTemplate'

interface Contact {
  id: string
  full_name: string | null
  first_name: string | null
  last_name: string | null
  phone_number: string
  email: string | null
  company: string | null
  notes: string | null
  status: string
  organization_id: string
}

interface CustomDisposition {
  label: string
  value: string
  color?: string
}

interface CallListContact {
  id: string
  call_list_id: string
  contact_id: string
  assigned_to: string | null
  status: string
  notes: string | null
  total_attempts: number
  call_list: {
    id: string
    name: string
    script_template: string | null
    keywords: string[] | null
    call_goals: string[] | null
    custom_dispositions: CustomDisposition[] | null
  } | null
}

interface CallAttempt {
  id: string
  disposition: string
  disposition_notes: string | null
  started_at: string
  duration_seconds: number | null
  agent: {
    full_name: string | null
    email: string
  } | null
}

// Default/standard dispositions - used when no custom dispositions are defined
const DEFAULT_DISPOSITIONS = [
  { value: 'answered', label: 'Answered', color: 'bg-green-100 text-green-800' },
  { value: 'voicemail', label: 'Voicemail', color: 'bg-yellow-100 text-yellow-800' },
  { value: 'no_answer', label: 'No Answer', color: 'bg-gray-100 text-gray-800' },
  { value: 'busy', label: 'Busy', color: 'bg-orange-100 text-orange-800' },
  { value: 'callback_requested', label: 'Callback Requested', color: 'bg-blue-100 text-blue-800' },
  { value: 'sale_made', label: 'Sale Made', color: 'bg-emerald-100 text-emerald-800' },
  { value: 'appointment_set', label: 'Appointment Set', color: 'bg-purple-100 text-purple-800' },
  { value: 'not_interested', label: 'Not Interested', color: 'bg-red-100 text-red-800' },
  { value: 'wrong_number', label: 'Wrong Number', color: 'bg-red-100 text-red-800' },
  { value: 'do_not_call', label: 'Do Not Call', color: 'bg-red-100 text-red-800' },
]

// Custom disposition color palette (used when custom disposition doesn't have a color)
const CUSTOM_DISPOSITION_COLORS = [
  'bg-indigo-100 text-indigo-800',
  'bg-teal-100 text-teal-800',
  'bg-amber-100 text-amber-800',
  'bg-pink-100 text-pink-800',
]

const SENTIMENTS = [
  { value: 'positive', label: 'Positive', icon: ThumbsUp, color: 'text-green-600' },
  { value: 'neutral', label: 'Neutral', icon: Minus, color: 'text-gray-600' },
  { value: 'negative', label: 'Negative', icon: ThumbsDown, color: 'text-red-600' },
]

export default function ActiveCallPage({ params }: { params: Promise<{ phone: string }> }) {
  const resolvedParams = use(params)
  const phoneNumber = decodeURIComponent(resolvedParams.phone)

  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [contact, setContact] = useState<Contact | null>(null)
  const [callListContact, setCallListContact] = useState<CallListContact | null>(null)
  const [callHistory, setCallHistory] = useState<CallAttempt[]>([])
  const [memberId, setMemberId] = useState<string | null>(null)
  const [organizationId, setOrganizationId] = useState<string | null>(null)
  const [agentInfo, setAgentInfo] = useState<{ full_name: string | null; email: string | null } | null>(null)
  const [organizationInfo, setOrganizationInfo] = useState<{ name: string | null } | null>(null)

  // Form state
  const [notes, setNotes] = useState('')
  const [sentiment, setSentiment] = useState<string>('')
  const [disposition, setDisposition] = useState<string>('')
  const [callbackDate, setCallbackDate] = useState('')
  const [callbackNotes, setCallbackNotes] = useState('')
  const [durationMinutes, setDurationMinutes] = useState('')
  const [durationSeconds, setDurationSeconds] = useState('')

  // Collapsible section states
  const [scriptOpen, setScriptOpen] = useState(true)
  const [keywordsOpen, setKeywordsOpen] = useState(true)
  const [goalsOpen, setGoalsOpen] = useState(true)
  const [contactInfoOpen, setContactInfoOpen] = useState(true)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [dataEntryOpen, setDataEntryOpen] = useState(true)

  useEffect(() => {
    if (user && phoneNumber) {
      loadContactData()
    }
  }, [user, phoneNumber])

  async function loadContactData() {
    setLoading(true)
    const supabase = createClient()

    try {
      // Get current user's member info including name for script variables
      const { data: member } = await supabase
        .from('organization_members')
        .select('id, organization_id, full_name, email')
        .eq('user_id', user?.id)
        .single()

      if (!member) {
        toast.error('User not found in organization')
        setLoading(false)
        return
      }

      setMemberId(member.id)
      setOrganizationId(member.organization_id)
      setAgentInfo({ full_name: member.full_name, email: member.email })

      // Fetch organization name for script variables
      const { data: orgData } = await supabase
        .from('organizations')
        .select('name')
        .eq('id', member.organization_id)
        .single()

      if (orgData) {
        setOrganizationInfo({ name: orgData.name })
      }

      // Normalize phone number for lookup
      const normalized = normalizePhoneNumber(phoneNumber)

      // Due to RLS, agents can only access contacts they're assigned to via call_list_contacts
      // First, get all contacts assigned to this agent
      const { data: assignedContacts } = await supabase
        .from('call_list_contacts')
        .select('id, call_list_id, contact_id, assigned_to, status, notes, total_attempts')
        .eq('assigned_to', member.id)

      if (!assignedContacts || assignedContacts.length === 0) {
        // No assigned contacts
        return
      }

      // Get the contact IDs
      const contactIds = [...new Set(assignedContacts.map(c => c.contact_id).filter(Boolean))]
      const callListIds = [...new Set(assignedContacts.map(c => c.call_list_id).filter(Boolean))]

      // Fetch contact details for assigned contacts (RLS allows reading assigned contacts)
      const { data: contactsData } = contactIds.length > 0
        ? await supabase
            .from('contacts')
            .select('*')
            .in('id', contactIds)
        : { data: [] }

      // Find the contact matching the phone number
      const matchingContact = (contactsData || []).find(c =>
        c.phone_number === phoneNumber || normalizePhoneNumber(c.phone_number) === normalized
      )

      if (matchingContact) {
        setContact(matchingContact)

        // Find the call list contact record for this contact
        const clContact = assignedContacts.find(ac => ac.contact_id === matchingContact.id)

        if (clContact) {
          // Fetch call list details including script, keywords, goals, and custom dispositions
          const { data: callListData } = await supabase
            .from('call_lists')
            .select('id, name, script_template, keywords, call_goals, custom_dispositions')
            .in('id', callListIds)

          const callListsMap = new Map((callListData || []).map(cl => [cl.id, cl]))

          const transformedContact: CallListContact = {
            id: clContact.id,
            call_list_id: clContact.call_list_id,
            contact_id: clContact.contact_id,
            assigned_to: clContact.assigned_to,
            status: clContact.status,
            notes: clContact.notes,
            total_attempts: clContact.total_attempts,
            call_list: callListsMap.get(clContact.call_list_id) || null,
          }
          setCallListContact(transformedContact)

          // Load call history for this contact
          const { data: history } = await supabase
            .from('call_attempts')
            .select('id, disposition, disposition_notes, started_at, duration_seconds, agent_id')
            .eq('call_list_contact_id', clContact.id)
            .order('started_at', { ascending: false })
            .limit(5)

          if (history && history.length > 0) {
            // Fetch agent info separately
            const agentIds = [...new Set(history.map(h => h.agent_id).filter(Boolean))]
            const { data: agentsData } = agentIds.length > 0
              ? await supabase
                  .from('organization_members')
                  .select('id, full_name, email')
                  .in('id', agentIds)
              : { data: [] }

            const agentsMap = new Map((agentsData || []).map(a => [a.id, a]))

            const transformedHistory: CallAttempt[] = history.map((h: any) => ({
              id: h.id,
              disposition: h.disposition,
              disposition_notes: h.disposition_notes,
              started_at: h.started_at,
              duration_seconds: h.duration_seconds,
              agent: agentsMap.get(h.agent_id) || null,
            }))
            setCallHistory(transformedHistory)
          }
        }
      }
    } catch (error) {
      console.error('Error loading contact data:', error)
      toast.error('Failed to load contact data')
    } finally {
      setLoading(false)
    }
  }

  async function handleSave() {
    if (!contact || !memberId || !organizationId) {
      toast.error('Missing required data')
      return
    }

    setSaving(true)
    const supabase = createClient()

    try {
      const totalSeconds =
        (parseInt(durationMinutes) || 0) * 60 +
        (parseInt(durationSeconds) || 0)

      // If we have a call list contact, create a call attempt
      if (callListContact && disposition) {
        const { error: attemptError } = await supabase
          .from('call_attempts')
          .insert({
            call_list_contact_id: callListContact.id,
            agent_id: memberId,
            attempt_number: (callListContact.total_attempts || 0) + 1,
            started_at: new Date().toISOString(),
            ended_at: new Date().toISOString(),
            duration_seconds: totalSeconds,
            disposition: disposition,
            disposition_notes: notes,
            callback_requested: disposition === 'callback_requested',
            callback_date: callbackDate || null,
            callback_notes: callbackNotes || null,
          })

        if (attemptError) throw attemptError

        // Update call list contact
        let newStatus = callListContact.status
        if (['sale_made', 'appointment_set', 'not_interested', 'already_customer', 'do_not_call'].includes(disposition)) {
          newStatus = 'completed'
        }

        await supabase
          .from('call_list_contacts')
          .update({
            status: newStatus,
            last_attempt_at: new Date().toISOString(),
            total_attempts: (callListContact.total_attempts || 0) + 1,
            final_disposition: disposition,
            outcome_notes: notes,
          })
          .eq('id', callListContact.id)
      }

      // Log to contact history regardless of call list
      await supabase
        .from('contact_history')
        .insert({
          contact_id: contact.id,
          organization_id: organizationId,
          event_type: 'call',
          event_data: {
            disposition: disposition || 'note_added',
            duration: totalSeconds,
            notes: notes,
            sentiment: sentiment,
            from_active_call_panel: true,
          },
          agent_id: memberId,
        })

      // Update contact notes if provided
      if (notes) {
        const existingNotes = contact.notes || ''
        const timestamp = new Date().toLocaleString()
        const newNote = `[${timestamp}] ${notes}`
        const updatedNotes = existingNotes
          ? `${existingNotes}\n${newNote}`
          : newNote

        await supabase
          .from('contacts')
          .update({ notes: updatedNotes })
          .eq('id', contact.id)
      }

      toast.success('Call data saved successfully')

      // Refresh data
      loadContactData()

      // Clear form
      setNotes('')
      setSentiment('')
      setDisposition('')
      setCallbackDate('')
      setCallbackNotes('')
      setDurationMinutes('')
      setDurationSeconds('')

    } catch (error: any) {
      console.error('Error saving call data:', error)
      toast.error(error.message || 'Failed to save call data')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-6 md:grid-cols-2">
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
        </div>
        <Skeleton className="h-64" />
      </div>
    )
  }

  // Helper to create collapsible card header
  const CollapsibleCardHeader = ({
    title,
    icon: Icon,
    isOpen,
    onToggle,
    color = 'text-gray-900',
    compact = false
  }: {
    title: string
    icon: any
    isOpen: boolean
    onToggle: () => void
    color?: string
    compact?: boolean
  }) => (
    <CollapsibleTrigger asChild onClick={onToggle}>
      <div className={`flex items-center justify-between cursor-pointer hover:bg-gray-50 rounded-lg transition-colors ${compact ? 'p-2' : 'p-3'}`}>
        <div className={`flex items-center gap-2 ${color} font-semibold ${compact ? 'text-sm' : ''}`}>
          <Icon className={compact ? 'h-4 w-4' : 'h-5 w-5'} />
          {title}
        </div>
        {isOpen ? <ChevronUp className="h-4 w-4 text-gray-500" /> : <ChevronDown className="h-4 w-4 text-gray-500" />}
      </div>
    </CollapsibleTrigger>
  )

  const contactName = contact?.full_name || `${contact?.first_name || ''} ${contact?.last_name || ''}`.trim() || 'Unknown Contact'
  const hasScript = callListContact?.call_list?.script_template
  const hasKeywords = callListContact?.call_list?.keywords && callListContact.call_list.keywords.length > 0
  const hasGoals = callListContact?.call_list?.call_goals && callListContact.call_list.call_goals.length > 0
  const hasCampaignGuidance = hasScript || hasKeywords || hasGoals

  // Compute active dispositions - prefer custom dispositions from call list if available
  const customDispositions = callListContact?.call_list?.custom_dispositions
  const hasCustomDispositions = customDispositions && customDispositions.length > 0

  // If custom dispositions exist, show them first (up to 4), then add essential standard options
  const activeDispositions = hasCustomDispositions
    ? [
        // Custom dispositions with assigned colors
        ...customDispositions.slice(0, 4).map((d, index) => ({
          value: d.value,
          label: d.label,
          color: d.color || CUSTOM_DISPOSITION_COLORS[index % CUSTOM_DISPOSITION_COLORS.length],
          isCustom: true,
        })),
        // Separator marker (we'll handle display separately)
        // Essential standard dispositions that should always be available
        { value: 'voicemail', label: 'Voicemail', color: 'bg-yellow-100 text-yellow-800', isCustom: false },
        { value: 'no_answer', label: 'No Answer', color: 'bg-gray-100 text-gray-800', isCustom: false },
        { value: 'busy', label: 'Busy', color: 'bg-orange-100 text-orange-800', isCustom: false },
        { value: 'callback_requested', label: 'Callback Requested', color: 'bg-blue-100 text-blue-800', isCustom: false },
        { value: 'do_not_call', label: 'Do Not Call', color: 'bg-red-100 text-red-800', isCustom: false },
      ]
    : DEFAULT_DISPOSITIONS.map(d => ({ ...d, isCustom: false }))

  // Build script variables and process template
  const scriptVariables = buildScriptVariables({
    contact: contact,
    agent: agentInfo,
    campaign: callListContact?.call_list ? { name: callListContact.call_list.name } : null,
    organization: organizationInfo,
  })
  const processedScript = processScriptTemplate(
    callListContact?.call_list?.script_template,
    scriptVariables
  )

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col">
      {/* Sticky Header - Always Visible */}
      <div className="bg-white border-b px-4 py-3 flex-shrink-0 sticky top-0 z-10">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <div className="flex items-center gap-4">
            <div className="bg-green-100 p-2 rounded-full">
              <Phone className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-lg font-bold text-gray-900">{contactName}</h1>
                {contact?.company && (
                  <Badge variant="outline" className="text-xs">
                    <Building2 className="h-3 w-3 mr-1" />
                    {contact.company}
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-3 text-sm text-gray-500">
                <span>{phoneNumber}</span>
                {contact?.email && (
                  <>
                    <span>•</span>
                    <span>{contact.email}</span>
                  </>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {callListContact?.call_list?.name && (
              <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-200">
                <FileText className="h-3 w-3 mr-1" />
                {callListContact.call_list.name}
              </Badge>
            )}
            {callListContact && (
              <Badge variant="outline" className="text-xs">
                Attempt #{(callListContact.total_attempts || 0) + 1}
              </Badge>
            )}
          </div>
        </div>
      </div>

      {/* Contact Not Found */}
      {!contact && !loading && (
        <div className="flex-1 flex items-center justify-center">
          <Card className="max-w-md">
            <CardContent className="py-8 text-center">
              <AlertCircle className="h-12 w-12 text-yellow-500 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900">Contact Not Found</h3>
              <p className="text-gray-500 mt-1">No contact found for phone number: {phoneNumber}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Main Content Area */}
      {contact && (
        <div className="flex-1 overflow-hidden">
          <div className="h-full max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-4 p-4">

            {/* Left Column - Script (takes 2 columns when campaign guidance exists) */}
            <div className={`${hasCampaignGuidance ? 'lg:col-span-2' : 'lg:col-span-2'} flex flex-col gap-4 overflow-hidden`}>

              {/* Call Script - Main Focus */}
              {hasScript && (
                <Collapsible open={scriptOpen} onOpenChange={setScriptOpen} className="flex-1 flex flex-col min-h-0">
                  <Card className="flex-1 flex flex-col min-h-0 border-blue-200">
                    <CollapsibleCardHeader
                      title="Call Script"
                      icon={ScrollText}
                      isOpen={scriptOpen}
                      onToggle={() => setScriptOpen(!scriptOpen)}
                      color="text-blue-700"
                    />
                    <CollapsibleContent className="flex-1 overflow-hidden">
                      <CardContent className="h-full overflow-y-auto pb-4">
                        <div className="bg-blue-50 p-4 rounded-lg">
                          <div className="whitespace-pre-wrap text-gray-700 text-sm leading-relaxed">
                            {processedScript}
                          </div>
                        </div>
                      </CardContent>
                    </CollapsibleContent>
                  </Card>
                </Collapsible>
              )}

              {/* Call Data Entry - Always visible at bottom of left column */}
              <Collapsible open={dataEntryOpen} onOpenChange={setDataEntryOpen}>
                <Card className="border-gray-200">
                  <CollapsibleCardHeader
                    title="Call Data Entry"
                    icon={Pencil}
                    isOpen={dataEntryOpen}
                    onToggle={() => setDataEntryOpen(!dataEntryOpen)}
                  />
                  <CollapsibleContent>
                    <CardContent className="space-y-4 pt-0">
                      {/* Compact form layout */}
                      <div className="grid gap-4 md:grid-cols-4">
                        {/* Duration */}
                        <div>
                          <Label className="text-xs mb-1 block text-gray-500">Duration</Label>
                          <div className="flex items-center gap-1">
                            <Input
                              type="number"
                              placeholder="Min"
                              value={durationMinutes}
                              onChange={(e) => setDurationMinutes(e.target.value)}
                              min="0"
                              className="w-14 h-8 text-sm"
                            />
                            <span className="text-gray-400">:</span>
                            <Input
                              type="number"
                              placeholder="Sec"
                              value={durationSeconds}
                              onChange={(e) => setDurationSeconds(e.target.value)}
                              min="0"
                              max="59"
                              className="w-14 h-8 text-sm"
                            />
                          </div>
                        </div>

                        {/* Disposition */}
                        <div className="md:col-span-2">
                          <Label className="text-xs mb-1 block text-gray-500">
                            Disposition
                            {hasCustomDispositions && (
                              <span className="ml-1 text-indigo-600">(Custom)</span>
                            )}
                          </Label>
                          <Select value={disposition} onValueChange={setDisposition}>
                            <SelectTrigger className="h-8 text-sm">
                              <SelectValue placeholder="Select outcome..." />
                            </SelectTrigger>
                            <SelectContent>
                              {hasCustomDispositions && (
                                <>
                                  <div className="px-2 py-1.5 text-xs font-semibold text-indigo-700 bg-indigo-50">
                                    Campaign Dispositions
                                  </div>
                                  {activeDispositions.filter(d => d.isCustom).map((d) => (
                                    <SelectItem key={d.value} value={d.value} className="font-medium">
                                      {d.label}
                                    </SelectItem>
                                  ))}
                                  <div className="px-2 py-1.5 text-xs font-semibold text-gray-500 bg-gray-50 mt-1">
                                    Standard Options
                                  </div>
                                  {activeDispositions.filter(d => !d.isCustom).map((d) => (
                                    <SelectItem key={d.value} value={d.value}>
                                      {d.label}
                                    </SelectItem>
                                  ))}
                                </>
                              )}
                              {!hasCustomDispositions && activeDispositions.map((d) => (
                                <SelectItem key={d.value} value={d.value}>
                                  {d.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        {/* Sentiment */}
                        <div>
                          <Label className="text-xs mb-1 block text-gray-500">Sentiment</Label>
                          <div className="flex gap-1">
                            {SENTIMENTS.map((s) => (
                              <Button
                                key={s.value}
                                type="button"
                                size="sm"
                                variant={sentiment === s.value ? 'default' : 'outline'}
                                className={`h-8 w-8 p-0 ${sentiment === s.value ? '' : s.color}`}
                                onClick={() => setSentiment(s.value)}
                                title={s.label}
                              >
                                <s.icon className="h-3 w-3" />
                              </Button>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Notes */}
                      <div>
                        <Label className="text-xs mb-1 block text-gray-500">Notes</Label>
                        <Textarea
                          placeholder="Enter notes about this call..."
                          value={notes}
                          onChange={(e) => setNotes(e.target.value)}
                          rows={2}
                          className="text-sm"
                        />
                      </div>

                      {/* Callback Scheduling */}
                      {disposition === 'callback_requested' && (
                        <div className="p-3 bg-blue-50 rounded-lg grid gap-3 md:grid-cols-2">
                          <div>
                            <Label className="text-xs mb-1 block text-blue-700">Callback Date</Label>
                            <Input
                              type="datetime-local"
                              value={callbackDate}
                              onChange={(e) => setCallbackDate(e.target.value)}
                              className="h-8 text-sm"
                            />
                          </div>
                          <div>
                            <Label className="text-xs mb-1 block text-blue-700">Callback Notes</Label>
                            <Input
                              placeholder="Reason..."
                              value={callbackNotes}
                              onChange={(e) => setCallbackNotes(e.target.value)}
                              className="h-8 text-sm"
                            />
                          </div>
                        </div>
                      )}

                      {/* Save Button */}
                      <div className="flex justify-end">
                        <Button
                          onClick={handleSave}
                          disabled={saving || !contact}
                          size="sm"
                        >
                          {saving ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <>
                              <Save className="h-4 w-4 mr-1" />
                              Save
                            </>
                          )}
                        </Button>
                      </div>
                    </CardContent>
                  </CollapsibleContent>
                </Card>
              </Collapsible>
            </div>

            {/* Right Sidebar - Keywords, Goals, Contact Details, History */}
            <div className="space-y-3 overflow-y-auto">

              {/* Keywords */}
              {hasKeywords && (
                <Collapsible open={keywordsOpen} onOpenChange={setKeywordsOpen}>
                  <Card className="border-purple-200">
                    <CollapsibleCardHeader
                      title="Key Points"
                      icon={Tag}
                      isOpen={keywordsOpen}
                      onToggle={() => setKeywordsOpen(!keywordsOpen)}
                      color="text-purple-700"
                      compact
                    />
                    <CollapsibleContent>
                      <CardContent className="pt-0 pb-3">
                        <div className="flex flex-wrap gap-1.5">
                          {callListContact?.call_list?.keywords?.map((keyword, index) => (
                            <Badge
                              key={index}
                              variant="secondary"
                              className="bg-purple-100 text-purple-800 text-xs"
                            >
                              {keyword}
                            </Badge>
                          ))}
                        </div>
                      </CardContent>
                    </CollapsibleContent>
                  </Card>
                </Collapsible>
              )}

              {/* Call Goals */}
              {hasGoals && (
                <Collapsible open={goalsOpen} onOpenChange={setGoalsOpen}>
                  <Card className="border-green-200">
                    <CollapsibleCardHeader
                      title="Call Goals"
                      icon={Target}
                      isOpen={goalsOpen}
                      onToggle={() => setGoalsOpen(!goalsOpen)}
                      color="text-green-700"
                      compact
                    />
                    <CollapsibleContent>
                      <CardContent className="pt-0 pb-3">
                        <ul className="space-y-1.5">
                          {callListContact?.call_list?.call_goals?.map((goal, index) => (
                            <li key={index} className="flex items-start gap-2">
                              <CheckCircle2 className="h-3.5 w-3.5 text-green-600 mt-0.5 flex-shrink-0" />
                              <span className="text-xs text-gray-700">{goal}</span>
                            </li>
                          ))}
                        </ul>
                      </CardContent>
                    </CollapsibleContent>
                  </Card>
                </Collapsible>
              )}

              {/* Contact Details */}
              <Collapsible open={contactInfoOpen} onOpenChange={setContactInfoOpen}>
                <Card>
                  <CollapsibleCardHeader
                    title="Contact Details"
                    icon={User}
                    isOpen={contactInfoOpen}
                    onToggle={() => setContactInfoOpen(!contactInfoOpen)}
                    compact
                  />
                  <CollapsibleContent>
                    <CardContent className="pt-0 pb-3 space-y-2">
                      <div className="flex items-center gap-2 text-xs text-gray-600">
                        <Phone className="h-3 w-3 text-gray-400" />
                        <span>{contact.phone_number}</span>
                      </div>
                      {contact.email && (
                        <div className="flex items-center gap-2 text-xs text-gray-600">
                          <Mail className="h-3 w-3 text-gray-400" />
                          <span className="truncate">{contact.email}</span>
                        </div>
                      )}
                      {contact.company && (
                        <div className="flex items-center gap-2 text-xs text-gray-600">
                          <Building2 className="h-3 w-3 text-gray-400" />
                          <span>{contact.company}</span>
                        </div>
                      )}
                      {contact.notes && (
                        <div className="mt-2 p-2 bg-gray-50 rounded text-xs text-gray-600">
                          {contact.notes}
                        </div>
                      )}
                    </CardContent>
                  </CollapsibleContent>
                </Card>
              </Collapsible>

              {/* Call History */}
              <Collapsible open={historyOpen} onOpenChange={setHistoryOpen}>
                <Card>
                  <CollapsibleCardHeader
                    title={`History (${callHistory.length})`}
                    icon={History}
                    isOpen={historyOpen}
                    onToggle={() => setHistoryOpen(!historyOpen)}
                    compact
                  />
                  <CollapsibleContent>
                    <CardContent className="pt-0 pb-3">
                      {callHistory.length > 0 ? (
                        <div className="space-y-2">
                          {callHistory.map((call) => {
                            // Find disposition in custom or default list
                            const dispositionInfo = activeDispositions.find(d => d.value === call.disposition) ||
                              DEFAULT_DISPOSITIONS.find(d => d.value === call.disposition)
                            return (
                              <div key={call.id} className="p-2 bg-gray-50 rounded text-xs">
                                <div className="flex items-center gap-2">
                                  <Badge
                                    variant="secondary"
                                    className={`text-[10px] ${dispositionInfo?.color || 'bg-gray-100'}`}
                                  >
                                    {dispositionInfo?.label || call.disposition}
                                  </Badge>
                                  {call.duration_seconds && (
                                    <span className="text-gray-500">
                                      {Math.floor(call.duration_seconds / 60)}:{(call.duration_seconds % 60).toString().padStart(2, '0')}
                                    </span>
                                  )}
                                </div>
                                <p className="text-gray-500 mt-1">
                                  {new Date(call.started_at).toLocaleDateString()}
                                </p>
                              </div>
                            )
                          })}
                        </div>
                      ) : (
                        <p className="text-gray-500 text-xs">No call history</p>
                      )}
                    </CardContent>
                  </CollapsibleContent>
                </Card>
              </Collapsible>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
