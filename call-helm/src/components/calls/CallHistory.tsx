'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { CallRecordingPlayer } from './CallRecordingPlayer'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { format } from 'date-fns'
import {
  Phone,
  PhoneIncoming,
  PhoneOutgoing,
  Play,
  Download,
  FileText,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  Loader2
} from 'lucide-react'

interface CallHistoryProps {
  contactId?: string
  callListId?: string
  agentId?: string
  limit?: number
}

export function CallHistory({ 
  contactId, 
  callListId, 
  agentId,
  limit = 50 
}: CallHistoryProps) {
  const [selectedRecording, setSelectedRecording] = useState<any>(null)
  const supabase = createClient()

  const { data: calls, isLoading, error } = useQuery({
    queryKey: ['call-history', contactId, callListId, agentId],
    queryFn: async () => {
      let query = supabase
        .from('calls')
        .select(`
          *,
          recordings:call_recordings(
            id,
            recording_url,
            duration,
            transcription,
            status
          ),
          contact:contacts(
            full_name,
            phone_number
          ),
          agent:agents(
            full_name,
            email
          )
        `)
        .order('start_time', { ascending: false })
        .limit(limit)

      if (contactId) {
        query = query.eq('contact_id', contactId)
      }
      if (callListId) {
        query = query.eq('call_list_id', callListId)
      }
      if (agentId) {
        query = query.eq('agent_id', agentId)
      }

      const { data, error } = await query

      if (error) throw error
      return data || []
    }
  })

  const getCallStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-500" />
      case 'failed':
      case 'busy':
      case 'no-answer':
        return <XCircle className="h-4 w-4 text-red-500" />
      case 'initiated':
      case 'ringing':
      case 'in-progress':
        return <AlertCircle className="h-4 w-4 text-yellow-500" />
      default:
        return null
    }
  }

  const getCallStatusBadge = (status: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
      completed: 'default',
      failed: 'destructive',
      'no-answer': 'destructive',
      busy: 'destructive',
      initiated: 'secondary',
      ringing: 'secondary',
      'in-progress': 'secondary'
    }

    return (
      <Badge variant={variants[status] || 'outline'}>
        {status.replace('-', ' ')}
      </Badge>
    )
  }

  const formatDuration = (seconds: number) => {
    if (!seconds || seconds === 0) return '-'
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const handlePlayRecording = (call: any) => {
    if (!call.recordings || call.recordings.length === 0) return

    const recording = {
      ...call.recordings[0],
      call_id: call.id,
      caller_number: call.caller_number,
      called_number: call.called_number,
      agent_name: call.agent?.full_name,
      contact_name: call.contact?.full_name,
      direction: call.direction,
      start_time: call.start_time,
      end_time: call.end_time
    }

    setSelectedRecording(recording)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <AlertCircle className="h-8 w-8 text-red-500 mx-auto mb-2" />
        <p className="text-sm text-red-600">Failed to load call history</p>
      </div>
    )
  }

  if (!calls || calls.length === 0) {
    return (
      <div className="text-center py-8">
        <Phone className="h-8 w-8 text-gray-400 mx-auto mb-2" />
        <p className="text-sm text-gray-500">No call history available</p>
      </div>
    )
  }

  return (
    <>
      <div className="space-y-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[40px]"></TableHead>
              <TableHead>Date & Time</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Agent</TableHead>
              <TableHead>Duration</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Recording</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {calls.map((call) => (
              <TableRow key={call.id}>
                <TableCell>
                  {call.direction === 'outbound' ? (
                    <PhoneOutgoing className="h-4 w-4 text-blue-500" />
                  ) : (
                    <PhoneIncoming className="h-4 w-4 text-green-500" />
                  )}
                </TableCell>
                <TableCell>
                  <div className="space-y-1">
                    <div className="text-sm font-medium">
                      {format(new Date(call.start_time), 'MMM d, yyyy')}
                    </div>
                    <div className="text-xs text-gray-500">
                      {format(new Date(call.start_time), 'h:mm a')}
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="space-y-1">
                    <div className="text-sm font-medium">
                      {call.contact?.full_name || 'Unknown'}
                    </div>
                    <div className="text-xs text-gray-500">
                      {call.called_number}
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="text-sm">
                    {call.agent?.full_name || 'System'}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <Clock className="h-3 w-3 text-gray-400" />
                    <span className="text-sm">
                      {formatDuration(call.duration_seconds)}
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    {getCallStatusIcon(call.status)}
                    {getCallStatusBadge(call.status)}
                  </div>
                </TableCell>
                <TableCell>
                  {call.recordings && call.recordings.length > 0 ? (
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">
                        <Play className="h-3 w-3 mr-1" />
                        Available
                      </Badge>
                      {call.recordings[0].transcription && (
                        <span title="Transcript available">
                          <FileText className="h-3 w-3 text-gray-400" />
                        </span>
                      )}
                    </div>
                  ) : (
                    <span className="text-xs text-gray-400">No recording</span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    {call.recordings && call.recordings.length > 0 && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handlePlayRecording(call)}
                      >
                        <Play className="h-3 w-3 mr-1" />
                        Play
                      </Button>
                    )}
                    {call.recordings && call.recordings.length > 0 && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          const link = document.createElement('a')
                          link.href = call.recordings[0].recording_url
                          link.download = `call-${call.id}.mp3`
                          document.body.appendChild(link)
                          link.click()
                          document.body.removeChild(link)
                        }}
                      >
                        <Download className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Recording Player Dialog */}
      <Dialog open={!!selectedRecording} onOpenChange={() => setSelectedRecording(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Call Recording</DialogTitle>
          </DialogHeader>
          {selectedRecording && (
            <CallRecordingPlayer
              recording={selectedRecording}
              onClose={() => setSelectedRecording(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}