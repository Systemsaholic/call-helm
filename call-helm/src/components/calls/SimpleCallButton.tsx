'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Phone, Loader2 } from 'lucide-react'
import { useCall } from '@/lib/contexts/CallContext'
import { useBilling } from '@/lib/hooks/useBilling'
import { useRouter } from 'next/navigation'
import { useConfirmation } from '@/lib/hooks/useConfirmation'
import { ConfirmationDialog } from '@/components/ui/confirmation-dialog'
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
  contactStatus?: string
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
  contactStatus,
  callListId,
  scriptId,
  size = 'default',
  variant = 'default',
  className
}: SimpleCallButtonProps) {
  const [loading, setLoading] = useState(false)
  const [showUpgradeDialog, setShowUpgradeDialog] = useState(false)
  const [systemError, setSystemError] = useState<string | null>(null)
  const { callState, startCall } = useCall()
  const { limits } = useBilling()
  const router = useRouter()
  const confirmation = useConfirmation()

  const initiateCall = async () => {
    console.log('initiateCall called', { loading, isActive: callState.isActive })
    
    // Prevent multiple calls
    if (loading || callState.isActive) {
      console.log('Call prevented:', { loading, isActive: callState.isActive })
      return
    }

    // Check if contact is marked as "Do Not Call"
    if (contactStatus === 'do_not_call') {
      confirmation.showConfirmation({
        title: 'Contact Marked as Do Not Call',
        description: `${contactName || 'This contact'} is marked as "Do Not Call". Are you sure you want to proceed with this call? Please ensure you have a valid reason to contact them.`,
        confirmText: 'Proceed with Call',
        cancelText: 'Cancel',
        variant: 'warning',
        onConfirm: async () => {
          await performCall()
        }
      })
      return
    }

    await performCall()
  }

  const performCall = async () => {
    setLoading(true)
    setSystemError(null)
    console.log('Starting call initiation...')

    try {
      // Check recent call health (pre-flight check)
      console.log('Checking system health...')
      const healthCheck = await checkCallSystemHealth()
      console.log('Health check result:', healthCheck)
      
      if (!healthCheck.healthy) {
        setSystemError(healthCheck.message || 'System health check failed')
        setLoading(false)
        // Show error for 5 seconds
        setTimeout(() => setSystemError(null), 5000)
        return
      }

      console.log('Sending call initiation request...')
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
          provider: 'telnyx'
        }),
      })

      const data = await response.json()
      console.log('Call initiation response:', { status: response.status, data })

      if (!response.ok) {
        if (response.status === 402) {
          setShowUpgradeDialog(true)
          setLoading(false)
          return
        }
        throw new Error(data.error || 'Failed to initiate call')
      }

      // Start call tracking in context
      console.log('Starting call tracking with ID:', data.callId)
      startCall(data.callId, contactName, phoneNumber)
      
    } catch (err) {
      console.error('Call initiation error:', err)
      setSystemError('Failed to start call - Please try again')
      setTimeout(() => setSystemError(null), 5000)
    } finally {
      setLoading(false)
    }
  }

  const checkCallSystemHealth = async (): Promise<{ healthy: boolean; message?: string }> => {
    try {
      // Check if recent calls have been failing
      const response = await fetch('/api/calls/health-check')
      if (!response.ok) {
        return { 
          healthy: false, 
          message: '⚠️ Call system may be experiencing issues' 
        }
      }
      
      const data = await response.json()
      
      // If more than 3 recent calls failed with timeouts, warn the user
      if (data.recentTimeouts > 3) {
        return {
          healthy: false,
          message: '⚠️ Call system connectivity issues detected - Please contact support'
        }
      }
      
      // If webhook hasn't been received in last 5 minutes for active calls
      if (data.webhookStale) {
        return {
          healthy: false,
          message: '⚠️ Call system not responding properly - Please try again later'
        }
      }
      
      return { healthy: true, message: undefined }
    } catch (error) {
      // If health check fails, allow call but log error
      console.error('Health check failed:', error)
      return { healthy: true, message: undefined } // Don't block calls if health check itself fails
    }
  }

  const handleUpgrade = () => {
    setShowUpgradeDialog(false)
    router.push('/dashboard/settings?tab=billing')
  }

  // Check if user has available minutes
  const remainingMinutes = limits ? limits.max_call_minutes - limits.used_call_minutes : 0
  const hasMinutes = !limits || remainingMinutes > 0
  
  // Debug logging
  console.log('SimpleCallButton state:', {
    limits,
    remainingMinutes,
    hasMinutes,
    loading,
    systemError,
    callStateIsActive: callState.isActive
  })
  
  // Don't show button if a call is already active
  if (callState.isActive) {
    return null
  }

  return (
    <>
      <div className="relative inline-block">
        <Button
          onClick={() => {
            console.log('Button clicked! Initiating call...', { phoneNumber, contactId, contactName })
            initiateCall()
          }}
          disabled={loading || !hasMinutes || !!systemError}
          size={size}
          variant={systemError ? 'destructive' : variant}
          className={className}
          title={
            systemError ? systemError :
            hasMinutes ? `Call ${contactName || phoneNumber}` : 
            'No minutes available'
          }
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
        {systemError && (
          <div className="absolute top-full mt-1 left-0 right-0 min-w-[200px] z-50">
            <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-md text-xs">
              {systemError}
            </div>
          </div>
        )}
      </div>

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

      {/* Confirmation Dialog for Do Not Call */}
      <ConfirmationDialog
        isOpen={confirmation.isOpen}
        onClose={confirmation.hideConfirmation}
        onConfirm={confirmation.handleConfirm}
        title={confirmation.title}
        description={confirmation.description}
        confirmText={confirmation.confirmText}
        cancelText={confirmation.cancelText}
        variant={confirmation.variant}
        isLoading={confirmation.isLoading}
      />
    </>
  )
}