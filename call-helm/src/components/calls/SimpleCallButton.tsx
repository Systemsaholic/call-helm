'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Phone, Loader2 } from 'lucide-react'
import { useCall } from '@/lib/contexts/CallContext'
import { useBilling } from '@/lib/hooks/useBilling'
import { useRouter } from 'next/navigation'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface SimpleCallButtonProps {
  phoneNumber: string
  contactId?: string
  contactName?: string
  callListId?: string
  scriptId?: string
  size?: 'sm' | 'default' | 'lg' | 'icon'
  variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link'
  className?: string
}

export function SimpleCallButton({
  phoneNumber,
  contactId,
  contactName,
  callListId,
  scriptId,
  size = 'default',
  variant = 'default',
  className
}: SimpleCallButtonProps) {
  const [loading, setLoading] = useState(false)
  const [showUpgradeDialog, setShowUpgradeDialog] = useState(false)
  const { callState, startCall } = useCall()
  const { limits } = useBilling()
  const router = useRouter()

  const initiateCall = async () => {
    // Prevent multiple calls
    if (loading || callState.isActive) return
    
    setLoading(true)

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
          provider: 'signalwire'
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        if (response.status === 402) {
          setShowUpgradeDialog(true)
          setLoading(false)
          return
        }
        throw new Error(data.error || 'Failed to initiate call')
      }

      // Start call tracking in context
      startCall(data.callId, contactName, phoneNumber)
      
    } catch (err) {
      console.error('Call initiation error:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleUpgrade = () => {
    setShowUpgradeDialog(false)
    router.push('/dashboard/settings?tab=billing')
  }

  // Check if user has available minutes
  const remainingMinutes = limits ? limits.max_call_minutes - limits.used_call_minutes : 0
  const hasMinutes = remainingMinutes > 0 || limits?.plan_slug !== 'starter'
  
  // Don't show button if a call is already active
  if (callState.isActive) {
    return null
  }

  return (
    <>
      <Button
        onClick={initiateCall}
        disabled={loading || !hasMinutes}
        size={size}
        variant={variant}
        className={className}
        title={hasMinutes ? `Call ${contactName || phoneNumber}` : 'No minutes available'}
      >
        {loading ? (
          <Loader2 className={size === 'icon' ? 'h-4 w-4' : 'h-4 w-4 animate-spin'} />
        ) : size === 'icon' ? (
          <Phone className="h-4 w-4" />
        ) : (
          <>
            <Phone className="h-4 w-4 mr-2" />
            Call
          </>
        )}
      </Button>

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