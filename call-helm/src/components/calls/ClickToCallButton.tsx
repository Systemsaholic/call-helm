'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Phone, PhoneOff, Loader2, AlertCircle } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { useBilling } from '@/lib/hooks/useBilling'
import { useRouter } from 'next/navigation'

interface ClickToCallButtonProps {
  phoneNumber: string
  contactId?: string
  contactName?: string
  callListId?: string
  scriptId?: string
  size?: 'sm' | 'default' | 'lg' | 'icon'
  variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link'
  className?: string
}

export function ClickToCallButton({
  phoneNumber,
  contactId,
  contactName,
  callListId,
  scriptId,
  size = 'default',
  variant = 'default',
  className
}: ClickToCallButtonProps) {
  const [calling, setCalling] = useState(false)
  const [callActive, setCallActive] = useState(false)
  const [callId, setCallId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showUpgradeDialog, setShowUpgradeDialog] = useState(false)
  const [callStatus, setCallStatus] = useState<string>('')
  const [lastStatus, setLastStatus] = useState<string>('')
  const statusPollingRef = useRef<NodeJS.Timeout | null>(null)
  const { limits, showUpgradePrompt } = useBilling()
  const router = useRouter()

  const initiateCall = async () => {
    // Prevent multiple concurrent calls
    if (calling || callActive) {
      return
    }
    
    setCalling(true)
    setError(null)
    setLastStatus('')
    setCallStatus('Initiating call...')

    try {
      // Step 1: Show we're calling the agent
      setCallStatus('📞 Calling your phone...')
      
      const response = await fetch('/api/calls/initiate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          phoneNumber,
          contactId,
          callListId,
          scriptId,
          provider: 'telnyx' // Use Telnyx as provider
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        if (response.status === 402) {
          // Usage limit reached
          setShowUpgradeDialog(true)
          setCalling(false)
          setCallStatus('')
          return
        }
        throw new Error(data.error || 'Failed to initiate call')
      }

      setCallId(data.callId)
      setCallActive(true)
      setCalling(false)
      
      // Start polling for real call status
      startStatusPolling(data.callId)
      
    } catch (err) {
      console.error('Call initiation error:', err)
      setError(err instanceof Error ? err.message : 'Failed to initiate call')
      setCalling(false)
      setCallStatus('')
    }
  }

  const startStatusPolling = useCallback((callId: string) => {
    // Clear any existing polling first
    if (statusPollingRef.current) {
      clearInterval(statusPollingRef.current)
      statusPollingRef.current = null
    }
    
    const pollStatus = async () => {
      try {
        const response = await fetch(`/api/calls/${callId}/status`)
        if (response.ok) {
          const data = await response.json()
          console.log('Frontend received status:', data)
          
          // Stop polling if call has ended (has end_time) or status indicates completion
          if (data.endTime || ['completed', 'busy', 'failed', 'no-answer', 'missed', 'ended'].includes(data.status)) {
            console.log('Call ended, stopping polling')
            if (statusPollingRef.current) {
              clearInterval(statusPollingRef.current)
              statusPollingRef.current = null
            }
            setCallActive(false)
            updateStatusFromBackend(data.status)
            return
          }
          
          updateStatusFromBackend(data.status)
        }
      } catch (error) {
        console.error('Error polling call status:', error)
      }
    }

    // Poll immediately and then every 2 seconds
    pollStatus()
    const interval = setInterval(pollStatus, 2000)
    statusPollingRef.current = interval
  }, [])

  const updateStatusFromBackend = useCallback((status: string) => {
    console.log('UI Status Update:', status)
    
    // Prevent redundant updates
    if (status === lastStatus) {
      return
    }
    setLastStatus(status)
    
    switch (status) {
      case 'initiated':
        setCallStatus('📞 Initiating call...')
        break
      case 'ringing':
        setCallStatus('📲 Calling your phone...')
        break
      case 'answered':
        setCallStatus('✅ You answered! Connecting to contact...')
        break
      case 'contact-connected':
        setCallStatus('🎯 Contact answered! Both parties connected')
        break
      case 'in-progress':
        setCallStatus('🔄 Call in progress')
        break
      case 'completed':
        setCallStatus('✅ Call completed successfully')
        setCallActive(false)
        if (statusPollingRef.current) {
          clearInterval(statusPollingRef.current)
          statusPollingRef.current = null
        }
        // Clear the call ID to prevent further polling
        setTimeout(() => {
          setCallStatus('')
          setCallId(null)
        }, 5000)
        break
      case 'busy':
        setCallStatus('📵 Line busy - please try again')
        setCallActive(false)
        if (statusPollingRef.current) {
          clearInterval(statusPollingRef.current)
          statusPollingRef.current = null
        }
        setTimeout(() => {
          setCallStatus('')
          setCallId(null)
        }, 5000)
        break
      case 'failed':
      case 'canceled':
        setCallStatus('❌ Call failed - please try again')
        setCallActive(false)
        if (statusPollingRef.current) {
          clearInterval(statusPollingRef.current)
          statusPollingRef.current = null
        }
        setTimeout(() => {
          setCallStatus('')
          setCallId(null)
        }, 5000)
        break
      case 'no-answer':
      case 'missed':
        setCallStatus('📞 No answer - please try again')
        setCallActive(false)
        if (statusPollingRef.current) {
          clearInterval(statusPollingRef.current)
          statusPollingRef.current = null
        }
        setTimeout(() => {
          setCallStatus('')
          setCallId(null)
        }, 5000)
        break
      case 'ended':
        setCallStatus('📱 Call ended by user')
        setCallActive(false)
        if (statusPollingRef.current) {
          clearInterval(statusPollingRef.current)
          statusPollingRef.current = null
        }
        setTimeout(() => {
          setCallStatus('')
          setCallId(null)
        }, 3000)
        break
      default:
        setCallStatus(`📡 ${status}`)
    }
  }, [lastStatus])

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (statusPollingRef.current) {
        clearInterval(statusPollingRef.current)
        statusPollingRef.current = null
      }
    }
  }, [])

  const endCall = async () => {
    if (!callId) return

    try {
      setCallStatus('Ending call...')
      
      await fetch(`/api/calls/${callId}/end`, {
        method: 'POST',
      })

      // Stop status polling
      if (statusPollingRef.current) {
        clearInterval(statusPollingRef.current)
        statusPollingRef.current = null
      }

      setCallActive(false)
      setCallId(null)
      setCallStatus('')
      setLastStatus('')
    } catch (err) {
      console.error('Error ending call:', err)
      setCallStatus('Error ending call')
      setTimeout(() => setCallStatus(''), 2000)
    }
  }

  const handleUpgrade = () => {
    setShowUpgradeDialog(false)
    router.push('/dashboard/settings?tab=billing')
  }

  // Check if user has available minutes
  const remainingMinutes = limits ? limits.max_call_minutes - limits.used_call_minutes : 0
  const hasMinutes = remainingMinutes > 0 || limits?.plan_slug !== 'starter'

  return (
    <>
      <div className="flex flex-col gap-2">
        {callActive ? (
          <Button
            onClick={endCall}
            size={size}
            variant="destructive"
            className={`${className} animate-pulse bg-red-600 hover:bg-red-700`}
            title="End call"
          >
            {size === 'icon' ? (
              <PhoneOff className="h-4 w-4" />
            ) : (
              <>
                <PhoneOff className="h-4 w-4 mr-2" />
                End Call
              </>
            )}
          </Button>
        ) : (
          <Button
            onClick={initiateCall}
            disabled={calling || !hasMinutes}
            size={size}
            variant={variant}
            className={className}
            title={hasMinutes ? `Call ${contactName || phoneNumber}` : 'No minutes available'}
          >
            {calling ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : size === 'icon' ? (
              <Phone className="h-4 w-4" />
            ) : (
              <>
                <Phone className="h-4 w-4 mr-2" />
                Call
              </>
            )}
          </Button>
        )}
        
        {/* Show call status with improved styling */}
        {callStatus && (
          <div className={`text-sm text-center px-3 py-2 rounded-lg font-medium transition-all duration-300 ${
            callStatus.includes('✅') 
              ? 'bg-green-50 text-green-700 border border-green-200' 
              : callStatus.includes('❌') || callStatus.includes('📵')
              ? 'bg-red-50 text-red-700 border border-red-200'
              : callStatus.includes('🔄') || callStatus.includes('in progress')
              ? 'bg-blue-50 text-blue-700 border border-blue-200 animate-pulse'
              : 'bg-gray-50 text-gray-700 border border-gray-200'
          }`}>
            <div className="flex items-center justify-center gap-2">
              <span>{callStatus}</span>
              {(callStatus.includes('Calling') || callStatus.includes('Connecting') || callStatus.includes('progress')) && (
                <Loader2 className="h-3 w-3 animate-spin" />
              )}
            </div>
          </div>
        )}
      </div>

      {error && (
        <Alert variant="destructive" className="mt-2">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Call Failed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Upgrade Dialog */}
      <Dialog open={showUpgradeDialog} onOpenChange={setShowUpgradeDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Call Minutes Limit Reached</DialogTitle>
            <DialogDescription>
              You've used all your included call minutes for this month. 
              Upgrade your plan to continue making calls.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Minutes used:</span>
                <span className="text-sm font-medium">
                  {limits?.used_call_minutes || 0} / {limits?.max_call_minutes || 0}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Current plan:</span>
                <span className="text-sm font-medium capitalize">
                  {limits?.plan_slug || 'Starter'}
                </span>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowUpgradeDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpgrade}>
              Upgrade Plan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}