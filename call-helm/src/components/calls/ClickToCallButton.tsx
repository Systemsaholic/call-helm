'use client'

import { useState } from 'react'
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
  const { limits, showUpgradePrompt } = useBilling()
  const router = useRouter()

  const initiateCall = async () => {
    setCalling(true)
    setError(null)

    try {
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
          provider: 'signalwire' // Use SignalWire as default
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        if (response.status === 402) {
          // Usage limit reached
          setShowUpgradeDialog(true)
          setCalling(false)
          return
        }
        throw new Error(data.error || 'Failed to initiate call')
      }

      setCallId(data.callId)
      setCallActive(true)
      setCalling(false)

      // Show call in progress UI
      // In a real implementation, this would open a call interface
      // with controls for mute, hold, transfer, etc.
      
    } catch (err) {
      console.error('Call initiation error:', err)
      setError(err instanceof Error ? err.message : 'Failed to initiate call')
      setCalling(false)
    }
  }

  const endCall = async () => {
    if (!callId) return

    try {
      await fetch(`/api/calls/${callId}/end`, {
        method: 'POST',
      })

      setCallActive(false)
      setCallId(null)
    } catch (err) {
      console.error('Error ending call:', err)
    }
  }

  const handleUpgrade = () => {
    setShowUpgradeDialog(false)
    router.push('/dashboard/settings?tab=billing')
  }

  // Check if user has available minutes
  const hasMinutes = limits?.call_minutes_remaining > 0 || limits?.plan_slug !== 'starter'

  return (
    <>
      {callActive ? (
        <Button
          onClick={endCall}
          size={size}
          variant="destructive"
          className={className}
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
                  {limits?.call_minutes_used || 0} / {limits?.call_minutes_included || 0}
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