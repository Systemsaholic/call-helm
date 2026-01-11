'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/lib/hooks/useAuth'
import { useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { SMSConversation } from '@/components/sms/SMSConversation'
import { 
  Phone,
  PhoneOff,
  PhoneCall,
  PhoneMissed,
  MessageSquare,
  User,
  Building,
  MapPin,
  Clock,
  CheckCircle2,
  XCircle,
  ChevronLeft,
  ChevronRight,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Loader2,
  ToggleLeft,
  ToggleRight,
  Send,
  Mail
} from 'lucide-react'

interface Contact {
  id: string
  contact_id: string
  first_name: string
  last_name: string
  phone_number: string
  email: string
  company: string
  city: string
  state: string
  status: string
  last_called_at: string | null
  call_count: number
  notes: string
  preferred_channel?: 'voice' | 'sms'
  sms_opted_in?: boolean
  sms_conversation_id?: string
}

interface CallStatus {
  answered: number
  voicemail: number
  busy: number
  noAnswer: number
  doNotCall: number
  smsConverted: number
}

type CommunicationMode = 'voice' | 'sms'

export default function UnifiedCallBoard() {
  const { user, supabase } = useAuth()
  const searchParams = useSearchParams()
  const campaignId = searchParams.get('campaign') || searchParams.get('list')
  
  const [contacts, setContacts] = useState<Contact[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [loading, setLoading] = useState(true)
  const [mode, setMode] = useState<CommunicationMode>('voice')
  const [calling, setCalling] = useState(false)
  const [callDuration, setCallDuration] = useState(0)
  const [callTimer, setCallTimer] = useState<NodeJS.Timeout | null>(null)
  const [isMuted, setIsMuted] = useState(false)
  const [speakerOn, setSpeakerOn] = useState(false)
  const [notes, setNotes] = useState('')
  const [showSmsConversation, setShowSmsConversation] = useState(false)
  const [callStats, setCallStats] = useState<CallStatus>({
    answered: 0,
    voicemail: 0,
    busy: 0,
    noAnswer: 0,
    doNotCall: 0,
    smsConverted: 0
  })

  useEffect(() => {
    if (campaignId) {
      fetchCampaignContacts()
    }
  }, [campaignId])

  useEffect(() => {
    if (calling && !callTimer) {
      const timer = setInterval(() => {
        setCallDuration(prev => prev + 1)
      }, 1000)
      setCallTimer(timer)
    } else if (!calling && callTimer) {
      clearInterval(callTimer)
      setCallTimer(null)
      setCallDuration(0)
    }

    return () => {
      if (callTimer) {
        clearInterval(callTimer)
      }
    }
  }, [calling, callTimer])

  const fetchCampaignContacts = async () => {
    try {
      const { data, error } = await supabase
        .from('call_list_contacts')
        .select(`
          *,
          contacts!inner(
            id,
            first_name,
            last_name,
            phone_number,
            email,
            company,
            city,
            state
          ),
          campaign_channel_preferences(
            preferred_channel,
            sms_enabled
          )
        `)
        .eq('call_list_id', campaignId)
        .eq('status', 'pending')
        .order('created_at', { ascending: true })

      if (error) throw error

      // Check for existing SMS conversations
      const formattedContacts = await Promise.all(
        (data || []).map(async (item) => {
          // Check if contact has SMS conversation
          const { data: smsConv } = await supabase
            .from('sms_conversations')
            .select('id, is_opted_out')
            .eq('contact_id', item.contact_id)
            .single()

          return {
            id: item.id,
            contact_id: item.contact_id,
            first_name: item.contacts.first_name,
            last_name: item.contacts.last_name,
            phone_number: item.contacts.phone_number,
            email: item.contacts.email,
            company: item.contacts.company,
            city: item.contacts.city,
            state: item.contacts.state,
            status: item.status,
            last_called_at: item.last_called_at,
            call_count: item.call_count,
            notes: item.notes,
            preferred_channel: item.campaign_channel_preferences?.[0]?.preferred_channel || 'voice',
            sms_opted_in: smsConv ? !smsConv.is_opted_out : true,
            sms_conversation_id: smsConv?.id
          }
        })
      )

      setContacts(formattedContacts)
      
      // Set initial mode based on first contact's preference
      if (formattedContacts.length > 0) {
        setMode(formattedContacts[0].preferred_channel || 'voice')
      }
    } catch (error) {
      console.error('Error fetching contacts:', error)
    } finally {
      setLoading(false)
    }
  }

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  const currentContact = contacts[currentIndex]

  const handleStartCall = async () => {
    setCalling(true)
    
    try {
      const response = await fetch('/api/voice/call', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contactId: currentContact?.contact_id,
          phoneNumber: currentContact?.phone_number,
          callListContactId: currentContact?.id,
          campaignId,
          agentId: user?.id
        })
      })

      const data = await response.json()
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to initiate call')
      }

      console.log('Call initiated:', data)
    } catch (error) {
      console.error('Failed to start call:', error)
      setCalling(false)
    }
  }

  const handleEndCall = async (status: string) => {
    setCalling(false)
    
    await supabase
      .from('call_list_contacts')
      .update({
        status: status,
        last_called_at: new Date().toISOString(),
        call_count: (currentContact?.call_count || 0) + 1,
        notes
      })
      .eq('id', currentContact?.id)

    await supabase
      .from('calls')
      .insert({
        organization_id: user?.id,
        contact_id: currentContact?.contact_id,
        direction: 'outbound',
        caller_number: 'system',
        called_number: currentContact?.phone_number,
        start_time: new Date(Date.now() - callDuration * 1000).toISOString(),
        end_time: new Date().toISOString(),
        duration: callDuration,
        status: status === 'answered' ? 'answered' : status,
        notes
      })

    setCallStats(prev => ({
      ...prev,
      [status]: prev[status as keyof CallStatus] + 1
    }))

    setNotes('')
    if (currentIndex < contacts.length - 1) {
      setCurrentIndex(prev => prev + 1)
      // Set mode for next contact
      const nextContact = contacts[currentIndex + 1]
      if (nextContact?.preferred_channel) {
        setMode(nextContact.preferred_channel)
      }
    }
  }

  const handleSwitchToSMS = async () => {
    setMode('sms')
    setShowSmsConversation(true)
    
    // Update campaign channel preference
    await supabase
      .from('campaign_channel_preferences')
      .upsert({
        campaign_id: campaignId,
        contact_id: currentContact?.contact_id,
        preferred_channel: 'sms',
        sms_enabled: true
      })
    
    setCallStats(prev => ({
      ...prev,
      smsConverted: prev.smsConverted + 1
    }))
  }

  const handleSmsComplete = () => {
    setShowSmsConversation(false)
    setNotes('')
    if (currentIndex < contacts.length - 1) {
      setCurrentIndex(prev => prev + 1)
      const nextContact = contacts[currentIndex + 1]
      if (nextContact?.preferred_channel) {
        setMode(nextContact.preferred_channel)
      }
    }
  }

  const handleSkip = () => {
    if (currentIndex < contacts.length - 1) {
      setCurrentIndex(prev => prev + 1)
      const nextContact = contacts[currentIndex + 1]
      if (nextContact?.preferred_channel) {
        setMode(nextContact.preferred_channel)
      }
    }
  }

  const handlePrevious = () => {
    if (currentIndex > 0) {
      setCurrentIndex(prev => prev - 1)
      const prevContact = contacts[currentIndex - 1]
      if (prevContact?.preferred_channel) {
        setMode(prevContact.preferred_channel)
      }
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (!currentContact) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <CheckCircle2 className="h-16 w-16 text-green-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Campaign Complete!</h2>
          <p className="text-gray-600 mb-4">You've contacted all people in this campaign.</p>
          <div className="bg-white rounded-lg p-6 mb-4 text-left max-w-md mx-auto">
            <h3 className="font-semibold mb-3">Campaign Statistics</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span>Answered:</span>
                <span className="font-bold text-green-600">{callStats.answered}</span>
              </div>
              <div className="flex justify-between">
                <span>Voicemail:</span>
                <span className="font-bold text-yellow-600">{callStats.voicemail}</span>
              </div>
              <div className="flex justify-between">
                <span>No Answer:</span>
                <span className="font-bold text-gray-600">{callStats.noAnswer}</span>
              </div>
              <div className="flex justify-between">
                <span>Switched to SMS:</span>
                <span className="font-bold text-blue-600">{callStats.smsConverted}</span>
              </div>
            </div>
          </div>
          <Button onClick={() => window.history.back()}>
            Back to Campaigns
          </Button>
        </div>
      </div>
    )
  }

  if (showSmsConversation && mode === 'sms') {
    return (
      <SMSConversation
        conversationId={currentContact.sms_conversation_id}
        contactId={currentContact.contact_id}
        phoneNumber={currentContact.phone_number}
        onBack={handleSmsComplete}
        className="h-screen"
      />
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg shadow mb-6 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => window.history.back()}
                className="text-gray-500 hover:text-gray-700"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <div>
                <h1 className="text-xl font-bold text-gray-900">Unified Outreach Board</h1>
                <p className="text-sm text-gray-600">
                  Contact {currentIndex + 1} of {contacts.length}
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-6">
              <div className="text-sm">
                <span className="text-gray-600">Answered:</span>
                <span className="font-bold text-green-600 ml-2">{callStats.answered}</span>
              </div>
              <div className="text-sm">
                <span className="text-gray-600">SMS:</span>
                <span className="font-bold text-blue-600 ml-2">{callStats.smsConverted}</span>
              </div>
              <div className="text-sm">
                <span className="text-gray-600">No Answer:</span>
                <span className="font-bold text-gray-600 ml-2">{callStats.noAnswer}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Contact Info & Controls */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Contact Information</h2>
              
              <div className="flex items-start gap-4 mb-6">
                <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
                  <span className="text-2xl font-bold text-primary">
                    {currentContact.first_name?.charAt(0)}{currentContact.last_name?.charAt(0)}
                  </span>
                </div>
                <div className="flex-1">
                  <h3 className="text-xl font-bold text-gray-900">
                    {currentContact.first_name} {currentContact.last_name}
                  </h3>
                  <p className="text-lg text-primary font-medium flex items-center gap-2 mt-1">
                    <Phone className="h-4 w-4" />
                    {currentContact.phone_number}
                  </p>
                  {!currentContact.sms_opted_in && (
                    <Badge variant="destructive" className="mt-2">
                      SMS Opted Out
                    </Badge>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {currentContact.email && (
                  <div className="flex items-start gap-2">
                    <Mail className="h-4 w-4 text-gray-400 mt-0.5" />
                    <div>
                      <p className="text-xs text-gray-500">Email</p>
                      <p className="text-sm text-gray-900">{currentContact.email}</p>
                    </div>
                  </div>
                )}
                
                {currentContact.company && (
                  <div className="flex items-start gap-2">
                    <Building className="h-4 w-4 text-gray-400 mt-0.5" />
                    <div>
                      <p className="text-xs text-gray-500">Company</p>
                      <p className="text-sm text-gray-900">{currentContact.company}</p>
                    </div>
                  </div>
                )}
                
                {(currentContact.city || currentContact.state) && (
                  <div className="flex items-start gap-2">
                    <MapPin className="h-4 w-4 text-gray-400 mt-0.5" />
                    <div>
                      <p className="text-xs text-gray-500">Location</p>
                      <p className="text-sm text-gray-900">
                        {currentContact.city}{currentContact.city && currentContact.state && ', '}{currentContact.state}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Communication Mode Toggle */}
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900">Communication Mode</h2>
                <div className="flex items-center gap-3">
                  <span className={mode === 'voice' ? 'font-medium' : 'text-gray-500'}>
                    <Phone className="h-4 w-4 inline mr-1" />
                    Voice
                  </span>
                  <button
                    onClick={() => setMode(mode === 'voice' ? 'sms' : 'voice')}
                    disabled={!currentContact.sms_opted_in}
                    className="relative inline-flex h-6 w-11 items-center rounded-full bg-gray-200 transition-colors disabled:opacity-50"
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        mode === 'sms' ? 'translate-x-6 bg-primary' : 'translate-x-1'
                      }`}
                    />
                  </button>
                  <span className={mode === 'sms' ? 'font-medium' : 'text-gray-500'}>
                    <MessageSquare className="h-4 w-4 inline mr-1" />
                    SMS
                  </span>
                </div>
              </div>
              
              {/* Mode-specific Controls */}
              {mode === 'voice' ? (
                !calling ? (
                  <div className="text-center">
                    <Button
                      onClick={handleStartCall}
                      className="bg-green-600 hover:bg-green-700 text-white px-8 py-6 text-lg"
                    >
                      <Phone className="h-6 w-6 mr-3" />
                      Start Call
                    </Button>
                    
                    {currentContact.sms_opted_in && (
                      <div className="mt-4">
                        <Button
                          variant="outline"
                          onClick={handleSwitchToSMS}
                          className="text-blue-600 border-blue-600 hover:bg-blue-50"
                        >
                          <MessageSquare className="h-4 w-4 mr-2" />
                          Switch to SMS Instead
                        </Button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div>
                    <div className="text-center mb-6">
                      <div className="text-3xl font-bold text-gray-900 mb-2">
                        {formatDuration(callDuration)}
                      </div>
                      <p className="text-sm text-gray-600">Call in progress</p>
                      
                      <div className="flex justify-center gap-4 mt-4">
                        <button
                          onClick={() => setIsMuted(!isMuted)}
                          className={`p-3 rounded-full ${isMuted ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-600'}`}
                        >
                          {isMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
                        </button>
                        <button
                          onClick={() => setSpeakerOn(!speakerOn)}
                          className={`p-3 rounded-full ${speakerOn ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-600'}`}
                        >
                          {speakerOn ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
                        </button>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        onClick={() => handleEndCall('answered')}
                        className="bg-green-600 hover:bg-green-700"
                      >
                        <PhoneCall className="h-4 w-4 mr-2" />
                        Answered
                      </Button>
                      <Button
                        onClick={() => handleEndCall('voicemail')}
                        className="bg-yellow-600 hover:bg-yellow-700"
                      >
                        <MessageSquare className="h-4 w-4 mr-2" />
                        Voicemail
                      </Button>
                      <Button
                        onClick={() => handleEndCall('busy')}
                        variant="outline"
                      >
                        <PhoneMissed className="h-4 w-4 mr-2" />
                        Busy
                      </Button>
                      <Button
                        onClick={() => handleEndCall('noAnswer')}
                        variant="outline"
                      >
                        <PhoneOff className="h-4 w-4 mr-2" />
                        No Answer
                      </Button>
                    </div>
                    
                    <Button
                      onClick={() => handleEndCall('doNotCall')}
                      variant="outline"
                      className="w-full mt-2 text-red-600 hover:text-red-700"
                    >
                      <XCircle className="h-4 w-4 mr-2" />
                      Do Not Call
                    </Button>
                  </div>
                )
              ) : (
                <div className="text-center">
                  <Button
                    onClick={() => setShowSmsConversation(true)}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-6 text-lg"
                  >
                    <MessageSquare className="h-6 w-6 mr-3" />
                    Open SMS Conversation
                  </Button>
                </div>
              )}

              {/* Navigation */}
              <div className="mt-4 flex justify-center gap-2">
                <Button
                  variant="outline"
                  onClick={handlePrevious}
                  disabled={currentIndex === 0}
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Previous
                </Button>
                <Button
                  variant="outline"
                  onClick={handleSkip}
                  disabled={currentIndex >= contacts.length - 1}
                >
                  Skip
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          </div>

          {/* Notes and Progress */}
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Notes</h2>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add notes about this contact..."
                className="w-full h-32 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary resize-none"
              />
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Previous Notes</h2>
              {currentContact.notes ? (
                <div className="text-sm text-gray-600 space-y-2">
                  <p>{currentContact.notes}</p>
                </div>
              ) : (
                <p className="text-sm text-gray-500">No previous notes</p>
              )}
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Campaign Progress</h2>
              <div className="space-y-3">
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-600">Progress</span>
                    <span className="font-medium">
                      {currentIndex + 1}/{contacts.length}
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-primary h-2 rounded-full transition-all"
                      style={{ width: `${((currentIndex + 1) / contacts.length) * 100}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}