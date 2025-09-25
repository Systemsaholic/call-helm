'use client'

import { useState, useEffect, useRef } from 'react'
import { X, Phone, FileText, Brain, Info, Download, Copy, Flag, Loader2, Play, Pause, Volume2, Clock, Calendar, User, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Slider } from '@/components/ui/slider'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Textarea } from '@/components/ui/textarea'
import { format } from 'date-fns'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'

interface CallDetailsSlideoutProps {
  callId: string
  isOpen: boolean
  onClose: () => void
}

interface CallDetails {
  id: string
  organization_id: string
  contact_id: string
  member_id: string
  direction: 'inbound' | 'outbound'
  caller_number: string
  called_number: string
  status: string
  start_time: string
  end_time: string
  duration: number
  recording_url?: string
  recording_sid?: string
  transcription?: string
  transcription_status?: string
  ai_analysis?: {
    summary?: string
    action_items?: string[]
    concerns?: string[]
    opportunities?: string[]
    talk_ratio?: { agent: number; contact: number }
    interruptions?: number
    silence_duration?: number
    topics_discussed?: string[]
    follow_up_required?: boolean
    call_quality_score?: number
  }
  mood_sentiment?: 'positive' | 'neutral' | 'negative' | 'mixed'
  key_points?: string[]
  compliance_flags?: {
    pci_detected?: boolean
    pii_detected?: boolean
    sensitive_data?: string[]
  }
  metadata?: any
  contact?: {
    id: string
    full_name: string
    email?: string
    phone?: string
    company?: string
  }
  member?: {
    id: string
    full_name: string
    email: string
  }
  call_list?: {
    id: string
    name: string
  }
}

export function CallDetailsSlideout({ callId, isOpen, onClose }: CallDetailsSlideoutProps) {
  const [activeTab, setActiveTab] = useState('recording')
  const [callDetails, setCallDetails] = useState<CallDetails | null>(null)
  const [loading, setLoading] = useState(true)
  const [notes, setNotes] = useState('')
  const [savingNotes, setSavingNotes] = useState(false)
  const [transcribing, setTranscribing] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  
  // Audio player state
  const audioRef = useRef<HTMLAudioElement>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(1)
  const [audioLoading, setAudioLoading] = useState(true)

  const supabase = createClient()

  useEffect(() => {
    if (isOpen && callId) {
      fetchCallDetails()
    }
  }, [isOpen, callId])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const handleLoadedMetadata = () => {
      setDuration(audio.duration)
      setAudioLoading(false)
    }

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime)
    }

    const handleEnded = () => {
      setIsPlaying(false)
    }

    const handleError = (e: Event) => {
      const audio = e.target as HTMLAudioElement
      console.error('Audio loading error:', {
        error: audio.error,
        errorCode: audio.error?.code,
        errorMessage: audio.error?.message,
        src: audio.src,
        readyState: audio.readyState,
        networkState: audio.networkState
      })
      setAudioLoading(false)
      // You could set an error state here if needed
    }

    const handleCanPlay = () => {
      setAudioLoading(false)
    }

    audio.addEventListener('loadedmetadata', handleLoadedMetadata)
    audio.addEventListener('timeupdate', handleTimeUpdate)
    audio.addEventListener('ended', handleEnded)
    audio.addEventListener('error', handleError)
    audio.addEventListener('canplay', handleCanPlay)

    return () => {
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata)
      audio.removeEventListener('timeupdate', handleTimeUpdate)
      audio.removeEventListener('ended', handleEnded)
      audio.removeEventListener('error', handleError)
      audio.removeEventListener('canplay', handleCanPlay)
    }
  }, [callDetails?.recording_url])

  const fetchCallDetails = async () => {
    setLoading(true)
    try {
      // First get the call details
      const { data: callData, error } = await supabase
        .from('calls')
        .select('*')
        .eq('id', callId)
        .maybeSingle()

      if (error) throw error
      if (!callData) {
        throw new Error('Call not found')
      }

      // Then get related data separately to avoid join issues
      let contact = null
      let member = null
      let callList = null

      if (callData.contact_id) {
        const { data: contactData } = await supabase
          .from('contacts')
          .select('*')
          .eq('id', callData.contact_id)
          .maybeSingle()
        contact = contactData
      }

      if (callData.member_id) {
        const { data: memberData } = await supabase
          .from('organization_members')
          .select('id, full_name, email')
          .eq('id', callData.member_id)
          .maybeSingle()
        
        member = memberData ? {
          id: memberData.id,
          full_name: memberData.full_name || 'Unknown',
          email: memberData.email || ''
        } : null
      }

      if (callData.metadata?.campaign_id) {
        const { data: listData } = await supabase
          .from('call_lists')
          .select('id, name')
          .eq('id', callData.metadata.campaign_id)
          .maybeSingle()
        callList = listData
      }

      const flattenedData = {
        ...callData,
        contact,
        member,
        call_list: callList
      }

      setCallDetails(flattenedData)
      setNotes(callData.metadata?.notes || '')
    } catch (error) {
      console.error('Error fetching call details:', error)
      toast.error('Failed to load call details')
    } finally {
      setLoading(false)
    }
  }

  const togglePlayPause = () => {
    if (!audioRef.current) return

    if (isPlaying) {
      audioRef.current.pause()
    } else {
      audioRef.current.play()
    }
    setIsPlaying(!isPlaying)
  }

  const handleSeek = (value: number[]) => {
    if (!audioRef.current) return
    const newTime = value[0]
    audioRef.current.currentTime = newTime
    setCurrentTime(newTime)
  }

  const handleVolumeChange = (value: number[]) => {
    if (!audioRef.current) return
    const newVolume = value[0]
    audioRef.current.volume = newVolume
    setVolume(newVolume)
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const handleDownloadRecording = () => {
    if (!callDetails?.recording_url) return
    const link = document.createElement('a')
    link.href = callDetails.recording_url
    link.download = `call-recording-${callDetails.id}.mp3`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const handleDownloadTranscript = () => {
    if (!callDetails?.transcription) return
    const blob = new Blob([callDetails.transcription], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `call-transcript-${callDetails.id}.txt`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  const handleCopyTranscript = () => {
    if (!callDetails?.transcription) return
    navigator.clipboard.writeText(callDetails.transcription)
    toast.success('Transcript copied to clipboard')
  }

  const handleSaveNotes = async () => {
    if (!callDetails) return
    setSavingNotes(true)
    try {
      const { error } = await supabase
        .from('calls')
        .update({
          metadata: {
            ...callDetails.metadata,
            notes
          }
        })
        .eq('id', callDetails.id)

      if (error) throw error
      toast.success('Notes saved')
    } catch (error) {
      console.error('Error saving notes:', error)
      toast.error('Failed to save notes')
    } finally {
      setSavingNotes(false)
    }
  }

  const handleTranscribe = async () => {
    if (!callDetails?.id) return
    
    setTranscribing(true)
    try {
      const response = await fetch(`/api/calls/${callDetails.id}/transcribe`, {
        method: 'POST',
      })
      
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to start transcription')
      }
      
      toast.success('Transcription started - this may take a few minutes')
      
      // Update the call details to show processing status
      setCallDetails(prev => prev ? {
        ...prev,
        transcription_status: 'processing'
      } : null)
      
    } catch (error) {
      console.error('Transcription error:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to start transcription')
    } finally {
      setTranscribing(false)
    }
  }

  const handleAnalyze = async () => {
    if (!callDetails?.id || !callDetails?.transcription) return
    
    setAnalyzing(true)
    try {
      const response = await fetch('/api/analysis/process', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          callId: callDetails.id,
          transcription: callDetails.transcription
        })
      })
      
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to start analysis')
      }
      
      toast.success('AI analysis started - this may take a moment')
      
      // Refresh call details after a short delay
      setTimeout(() => {
        fetchCallDetails()
      }, 3000)
      
    } catch (error) {
      console.error('Analysis error:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to start analysis')
    } finally {
      setAnalyzing(false)
    }
  }

  const getSentimentIcon = () => {
    switch (callDetails?.mood_sentiment) {
      case 'positive':
        return <TrendingUp className="h-4 w-4 text-green-600" />
      case 'negative':
        return <TrendingDown className="h-4 w-4 text-red-600" />
      case 'mixed':
        return <Minus className="h-4 w-4 text-yellow-600" />
      default:
        return <Minus className="h-4 w-4 text-gray-400" />
    }
  }

  const getSentimentColor = () => {
    switch (callDetails?.mood_sentiment) {
      case 'positive':
        return 'bg-green-100 text-green-800'
      case 'negative':
        return 'bg-red-100 text-red-800'
      case 'mixed':
        return 'bg-yellow-100 text-yellow-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  const maskSensitiveData = (text: string) => {
    // Mask credit card numbers (16 digits)
    let masked = text.replace(/\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, (match) => {
      const lastFour = match.replace(/[\s-]/g, '').slice(-4)
      return `****-****-****-${lastFour}`
    })
    
    // Mask SSN (9 digits with dashes)
    masked = masked.replace(/\b\d{3}-\d{2}-\d{4}\b/g, '***-**-****')
    
    return masked
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />
      
      {/* Slideout Panel */}
      <div className="relative w-full max-w-2xl bg-white shadow-xl animate-in slide-in-from-right duration-300">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
          </div>
        ) : callDetails ? (
          <>
            {/* Header */}
            <div className="border-b px-6 py-4">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-lg font-semibold flex items-center gap-2">
                    <Phone className="h-4 w-4" />
                    Call Details
                  </h2>
                  <div className="mt-2 space-y-1">
                    <p className="text-sm text-gray-600">
                      {callDetails.direction === 'outbound' ? 'To: ' : 'From: '}
                      <span className="font-medium">
                        {callDetails.contact?.full_name || callDetails.called_number}
                      </span>
                    </p>
                    <div className="flex items-center gap-4 text-xs text-gray-500">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {format(new Date(callDetails.start_time), 'MMM d, yyyy')}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatTime(callDetails.duration || 0)}
                      </span>
                      <span className="flex items-center gap-1">
                        <User className="h-3 w-3" />
                        {callDetails.member?.full_name}
                      </span>
                    </div>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onClose}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              {/* Status badges */}
              <div className="mt-3 flex items-center gap-2">
                {callDetails.call_list && (
                  <Badge variant="outline">
                    Campaign: {callDetails.call_list.name}
                  </Badge>
                )}
                {callDetails.mood_sentiment && (
                  <Badge className={cn('flex items-center gap-1', getSentimentColor())}>
                    {getSentimentIcon()}
                    {callDetails.mood_sentiment}
                  </Badge>
                )}
                {callDetails.transcription_status === 'completed' && (
                  <Badge variant="secondary">Transcribed</Badge>
                )}
              </div>
            </div>

            {/* Tabs */}
            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col h-[calc(100vh-180px)]">
              <TabsList className="mx-6 mt-4">
                <TabsTrigger value="recording" className="flex items-center gap-2">
                  <Phone className="h-3 w-3" />
                  Recording
                </TabsTrigger>
                <TabsTrigger value="transcript" className="flex items-center gap-2">
                  <FileText className="h-3 w-3" />
                  Transcript
                </TabsTrigger>
                <TabsTrigger value="analysis" className="flex items-center gap-2">
                  <Brain className="h-3 w-3" />
                  Analysis
                </TabsTrigger>
                <TabsTrigger value="details" className="flex items-center gap-2">
                  <Info className="h-3 w-3" />
                  Details
                </TabsTrigger>
              </TabsList>

              <ScrollArea className="flex-1">
                {/* Recording Tab */}
                <TabsContent value="recording" className="px-6 py-4 space-y-4">
                  {callDetails.recording_url ? (
                    <>
                      {(() => {
                        const audioSrc = callDetails.recording_sid 
                          ? `/api/recordings/${callDetails.recording_sid}` 
                          : callDetails.recording_url;
                        console.log('Audio src configuration:', {
                          recording_sid: callDetails.recording_sid,
                          recording_url: callDetails.recording_url,
                          computed_src: audioSrc
                        });
                        return (
                          <audio 
                            ref={audioRef} 
                            src={audioSrc}
                            preload="metadata" 
                            crossOrigin="anonymous"
                          />
                        );
                      })()}
                      
                      {/* Player Controls */}
                      <div className="space-y-4 p-4 bg-gray-50 rounded-lg">
                        <div className="flex items-center gap-3">
                          <Button
                            size="icon"
                            onClick={togglePlayPause}
                            disabled={audioLoading}
                          >
                            {audioLoading ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : isPlaying ? (
                              <Pause className="h-4 w-4" />
                            ) : (
                              <Play className="h-4 w-4" />
                            )}
                          </Button>

                          <div className="flex-1">
                            <Slider
                              value={[currentTime]}
                              max={duration}
                              step={1}
                              onValueChange={handleSeek}
                              className="cursor-pointer"
                              disabled={audioLoading}
                            />
                            <div className="flex justify-between mt-1">
                              <span className="text-xs text-gray-500">{formatTime(currentTime)}</span>
                              <span className="text-xs text-gray-500">{formatTime(duration)}</span>
                            </div>
                          </div>
                        </div>

                        {/* Volume Control */}
                        <div className="flex items-center gap-3">
                          <Volume2 className="h-4 w-4 text-gray-500" />
                          <Slider
                            value={[volume]}
                            max={1}
                            step={0.1}
                            onValueChange={handleVolumeChange}
                            className="w-32 cursor-pointer"
                          />
                        </div>
                      </div>

                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleDownloadRecording}
                        className="w-full"
                      >
                        <Download className="h-4 w-4 mr-2" />
                        Download Recording
                      </Button>
                    </>
                  ) : (
                    <div className="text-center py-8 text-gray-500">
                      <Phone className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                      <p>No recording available for this call</p>
                    </div>
                  )}
                </TabsContent>

                {/* Transcript Tab */}
                <TabsContent value="transcript" className="px-6 py-4 space-y-4">
                  {callDetails.transcription ? (
                    <>
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleCopyTranscript}
                        >
                          <Copy className="h-4 w-4 mr-2" />
                          Copy
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleDownloadTranscript}
                        >
                          <Download className="h-4 w-4 mr-2" />
                          Download
                        </Button>
                      </div>
                      
                      <div className="p-4 bg-gray-50 rounded-lg">
                        <p className="text-sm whitespace-pre-wrap font-mono">
                          {maskSensitiveData(callDetails.transcription)}
                        </p>
                      </div>

                      {callDetails.compliance_flags?.pci_detected && (
                        <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                          <p className="text-sm text-yellow-800">
                            ⚠️ Sensitive payment information detected and masked
                          </p>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="text-center py-8 text-gray-500">
                      <FileText className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                      <p className="mb-4">
                        {callDetails.transcription_status === 'processing' 
                          ? 'Transcription in progress...' 
                          : callDetails.transcription_status === 'failed'
                          ? 'Transcription failed'
                          : 'No transcript available'}
                      </p>
                      {callDetails.recording_url && callDetails.transcription_status !== 'processing' && (
                        <Button 
                          onClick={handleTranscribe}
                          disabled={transcribing}
                          size="sm"
                        >
                          {transcribing ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Transcribing...
                            </>
                          ) : (
                            <>
                              <FileText className="h-4 w-4 mr-2" />
                              {callDetails.transcription_status === 'failed' ? 'Retry Transcription' : 'Generate Transcript'}
                            </>
                          )}
                        </Button>
                      )}
                    </div>
                  )}
                </TabsContent>

                {/* Analysis Tab */}
                <TabsContent value="analysis" className="px-6 py-4 space-y-4">
                  {callDetails.ai_analysis && callDetails.ai_analysis.summary ? (
                    <>
                      {/* Summary */}
                      {callDetails.ai_analysis.summary && (
                        <div>
                          <h3 className="font-medium mb-2">Summary</h3>
                          <p className="text-sm text-gray-600">
                            {callDetails.ai_analysis.summary}
                          </p>
                        </div>
                      )}

                      {/* Key Points */}
                      {callDetails.key_points && callDetails.key_points.length > 0 && (
                        <div>
                          <h3 className="font-medium mb-2">Key Points</h3>
                          <ul className="space-y-1">
                            {callDetails.key_points.map((point, index) => (
                              <li key={index} className="text-sm text-gray-600 flex items-start">
                                <span className="mr-2">•</span>
                                <span>{point}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Action Items */}
                      {callDetails.ai_analysis.action_items && callDetails.ai_analysis.action_items.length > 0 && (
                        <div>
                          <h3 className="font-medium mb-2">Action Items</h3>
                          <ul className="space-y-1">
                            {callDetails.ai_analysis.action_items.map((item, index) => (
                              <li key={index} className="text-sm text-gray-600 flex items-start">
                                <span className="mr-2">☐</span>
                                <span>{item}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Concerns & Opportunities */}
                      <div className="grid grid-cols-2 gap-4">
                        {callDetails.ai_analysis.concerns && callDetails.ai_analysis.concerns.length > 0 && (
                          <div>
                            <h3 className="font-medium mb-2 text-orange-600">Concerns</h3>
                            <ul className="space-y-1">
                              {callDetails.ai_analysis.concerns.map((concern, index) => (
                                <li key={index} className="text-sm text-gray-600 flex items-start">
                                  <span className="mr-2 text-orange-500">⚠</span>
                                  <span>{concern}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        
                        {callDetails.ai_analysis.opportunities && callDetails.ai_analysis.opportunities.length > 0 && (
                          <div>
                            <h3 className="font-medium mb-2 text-green-600">Opportunities</h3>
                            <ul className="space-y-1">
                              {callDetails.ai_analysis.opportunities.map((opportunity, index) => (
                                <li key={index} className="text-sm text-gray-600 flex items-start">
                                  <span className="mr-2 text-green-500">✓</span>
                                  <span>{opportunity}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>

                      {/* Call Metrics */}
                      {callDetails.ai_analysis.talk_ratio && (
                        <div>
                          <h3 className="font-medium mb-2">Call Metrics</h3>
                          <div className="grid grid-cols-3 gap-4">
                            <div className="p-3 bg-gray-50 rounded">
                              <p className="text-xs text-gray-500">Agent Talk Time</p>
                              <p className="text-lg font-medium">{callDetails.ai_analysis.talk_ratio.agent}%</p>
                            </div>
                            <div className="p-3 bg-gray-50 rounded">
                              <p className="text-xs text-gray-500">Contact Talk Time</p>
                              <p className="text-lg font-medium">{callDetails.ai_analysis.talk_ratio.contact}%</p>
                            </div>
                            <div className="p-3 bg-gray-50 rounded">
                              <p className="text-xs text-gray-500">Quality Score</p>
                              <p className="text-lg font-medium">
                                {callDetails.ai_analysis.call_quality_score || '-'}/10
                              </p>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Follow-up Required */}
                      {callDetails.ai_analysis.follow_up_required && (
                        <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                          <p className="text-sm text-yellow-800 font-medium">
                            <Flag className="h-4 w-4 inline mr-2" />
                            Follow-up Required
                          </p>
                          {callDetails.ai_analysis.action_items && callDetails.ai_analysis.action_items.length > 0 && (
                            <p className="text-xs text-yellow-700 mt-1">
                              {callDetails.ai_analysis.action_items.length} action items pending
                            </p>
                          )}
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="text-center py-8 text-gray-500">
                      <Brain className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                      <p className="mb-4">
                        {callDetails.transcription 
                          ? 'No AI analysis available yet'
                          : 'Transcript required for analysis'}
                      </p>
                      {callDetails.transcription && (
                        <Button 
                          onClick={handleAnalyze}
                          disabled={analyzing}
                          size="sm"
                        >
                          {analyzing ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Analyzing...
                            </>
                          ) : (
                            <>
                              <Brain className="h-4 w-4 mr-2" />
                              Generate AI Analysis
                            </>
                          )}
                        </Button>
                      )}
                    </div>
                  )}
                </TabsContent>

                {/* Details Tab */}
                <TabsContent value="details" className="px-6 py-4 space-y-4">
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-gray-500">Call ID</p>
                        <p className="font-mono">{callDetails.id.slice(0, 8)}...</p>
                      </div>
                      <div>
                        <p className="text-gray-500">Direction</p>
                        <p className="capitalize">{callDetails.direction}</p>
                      </div>
                      <div>
                        <p className="text-gray-500">Start Time</p>
                        <p>{format(new Date(callDetails.start_time), 'h:mm a')}</p>
                      </div>
                      <div>
                        <p className="text-gray-500">End Time</p>
                        <p>{callDetails.end_time ? format(new Date(callDetails.end_time), 'h:mm a') : '-'}</p>
                      </div>
                      <div>
                        <p className="text-gray-500">From</p>
                        <p>{callDetails.caller_number}</p>
                      </div>
                      <div>
                        <p className="text-gray-500">To</p>
                        <p>{callDetails.called_number}</p>
                      </div>
                    </div>

                    {/* Notes */}
                    <div>
                      <label className="text-sm font-medium">Notes</label>
                      <Textarea
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="Add notes about this call..."
                        className="mt-1"
                        rows={4}
                      />
                      <Button
                        onClick={handleSaveNotes}
                        disabled={savingNotes}
                        size="sm"
                        className="mt-2"
                      >
                        {savingNotes && <Loader2 className="h-3 w-3 mr-2 animate-spin" />}
                        Save Notes
                      </Button>
                    </div>
                  </div>
                </TabsContent>
              </ScrollArea>
            </Tabs>
          </>
        ) : (
          <div className="flex items-center justify-center h-full">
            <p className="text-gray-500">Call details not found</p>
          </div>
        )}
      </div>
    </div>
  )
}