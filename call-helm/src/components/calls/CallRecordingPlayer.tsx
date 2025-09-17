'use client'

import { useState, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  Download,
  FileText,
  Phone,
  Clock,
  Calendar,
  User,
  MessageSquare,
  ChevronRight,
  Loader2
} from 'lucide-react'
import { format } from 'date-fns'

interface CallRecording {
  id: string
  call_id: string
  recording_url: string
  duration: number
  start_time: string
  end_time: string
  transcription?: string
  caller_number: string
  called_number: string
  agent_name?: string
  contact_name?: string
  direction: 'inbound' | 'outbound'
  status: 'completed' | 'failed' | 'recording' | 'transcribing'
}

interface CallRecordingPlayerProps {
  recording: CallRecording
  onClose?: () => void
  showTranscript?: boolean
  compact?: boolean
}

export function CallRecordingPlayer({ 
  recording, 
  onClose, 
  showTranscript = true,
  compact = false 
}: CallRecordingPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(recording.duration || 0)
  const [volume, setVolume] = useState(1)
  const [showTranscriptDialog, setShowTranscriptDialog] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const handleLoadedMetadata = () => {
      setDuration(audio.duration)
      setIsLoading(false)
    }

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime)
    }

    const handleEnded = () => {
      setIsPlaying(false)
    }

    audio.addEventListener('loadedmetadata', handleLoadedMetadata)
    audio.addEventListener('timeupdate', handleTimeUpdate)
    audio.addEventListener('ended', handleEnded)

    return () => {
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata)
      audio.removeEventListener('timeupdate', handleTimeUpdate)
      audio.removeEventListener('ended', handleEnded)
    }
  }, [])

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

  const skipBackward = () => {
    if (!audioRef.current) return
    audioRef.current.currentTime = Math.max(0, audioRef.current.currentTime - 10)
  }

  const skipForward = () => {
    if (!audioRef.current) return
    audioRef.current.currentTime = Math.min(duration, audioRef.current.currentTime + 10)
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const handleDownload = () => {
    const link = document.createElement('a')
    link.href = recording.recording_url
    link.download = `call-recording-${recording.id}.mp3`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  if (compact) {
    return (
      <div className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg">
        <audio ref={audioRef} src={recording.recording_url} preload="metadata" />
        
        <Button
          size="icon"
          variant="ghost"
          onClick={togglePlayPause}
          disabled={isLoading}
        >
          {isLoading ? (
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
            disabled={isLoading}
          />
        </div>

        <span className="text-xs text-gray-500 min-w-[80px] text-right">
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>

        {recording.transcription && (
          <Button
            size="icon"
            variant="ghost"
            onClick={() => setShowTranscriptDialog(true)}
            title="View transcript"
          >
            <FileText className="h-4 w-4" />
          </Button>
        )}
      </div>
    )
  }

  return (
    <>
      <Card className="w-full">
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Phone className="h-4 w-4" />
                Call Recording
              </CardTitle>
              <CardDescription>
                {recording.direction === 'outbound' ? 'Outbound' : 'Inbound'} call
              </CardDescription>
            </div>
            <Badge variant={recording.status === 'completed' ? 'default' : 'secondary'}>
              {recording.status}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <audio ref={audioRef} src={recording.recording_url} preload="metadata" />
          
          {/* Call Details */}
          <div className="grid grid-cols-2 gap-4 p-3 bg-gray-50 rounded-lg">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm">
                <User className="h-3 w-3 text-gray-500" />
                <span className="text-gray-600">Agent:</span>
                <span className="font-medium">{recording.agent_name || 'Unknown'}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Phone className="h-3 w-3 text-gray-500" />
                <span className="text-gray-600">Contact:</span>
                <span className="font-medium">
                  {recording.contact_name || recording.called_number}
                </span>
              </div>
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm">
                <Calendar className="h-3 w-3 text-gray-500" />
                <span className="text-gray-600">Date:</span>
                <span className="font-medium">
                  {format(new Date(recording.start_time), 'MMM d, yyyy')}
                </span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Clock className="h-3 w-3 text-gray-500" />
                <span className="text-gray-600">Duration:</span>
                <span className="font-medium">{formatTime(duration)}</span>
              </div>
            </div>
          </div>

          {/* Player Controls */}
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Button
                size="icon"
                variant="outline"
                onClick={skipBackward}
                disabled={isLoading}
              >
                <SkipBack className="h-4 w-4" />
              </Button>
              
              <Button
                size="icon"
                onClick={togglePlayPause}
                disabled={isLoading}
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : isPlaying ? (
                  <Pause className="h-4 w-4" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
              </Button>
              
              <Button
                size="icon"
                variant="outline"
                onClick={skipForward}
                disabled={isLoading}
              >
                <SkipForward className="h-4 w-4" />
              </Button>

              <div className="flex-1">
                <Slider
                  value={[currentTime]}
                  max={duration}
                  step={1}
                  onValueChange={handleSeek}
                  className="cursor-pointer"
                  disabled={isLoading}
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

          {/* Actions */}
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleDownload}
            >
              <Download className="h-4 w-4 mr-2" />
              Download
            </Button>
            
            {recording.transcription && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowTranscriptDialog(true)}
              >
                <MessageSquare className="h-4 w-4 mr-2" />
                View Transcript
              </Button>
            )}
          </div>

          {/* Inline Transcript Preview */}
          {showTranscript && recording.transcription && (
            <div className="p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-medium">Transcript</h4>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowTranscriptDialog(true)}
                >
                  <span className="text-xs">View Full</span>
                  <ChevronRight className="h-3 w-3 ml-1" />
                </Button>
              </div>
              <p className="text-sm text-gray-600 line-clamp-3">
                {recording.transcription}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Full Transcript Dialog */}
      <Dialog open={showTranscriptDialog} onOpenChange={setShowTranscriptDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Call Transcript</DialogTitle>
            <DialogDescription>
              Full transcript of the call on {format(new Date(recording.start_time), 'MMMM d, yyyy')}
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 space-y-4">
            <div className="p-4 bg-gray-50 rounded-lg">
              <p className="text-sm whitespace-pre-wrap">
                {recording.transcription || 'No transcript available'}
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  const blob = new Blob([recording.transcription || ''], { type: 'text/plain' })
                  const url = URL.createObjectURL(blob)
                  const link = document.createElement('a')
                  link.href = url
                  link.download = `transcript-${recording.id}.txt`
                  document.body.appendChild(link)
                  link.click()
                  document.body.removeChild(link)
                  URL.revokeObjectURL(url)
                }}
              >
                <Download className="h-4 w-4 mr-2" />
                Download Transcript
              </Button>
              <Button onClick={() => setShowTranscriptDialog(false)}>
                Close
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}