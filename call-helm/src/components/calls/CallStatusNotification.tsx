'use client'

import { useEffect } from 'react'
import { Phone, PhoneOff, Loader2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface CallStatusNotificationProps {
  callStatus: string
  callActive: boolean
  contactName?: string
  phoneNumber: string
  onEndCall: () => void
  onClose: () => void
}

export function CallStatusNotification({
  callStatus,
  callActive,
  contactName,
  phoneNumber,
  onEndCall,
  onClose
}: CallStatusNotificationProps) {
  // Auto-hide after call ends
  useEffect(() => {
    if (!callActive && callStatus.includes('completed')) {
      const timer = setTimeout(() => {
        onClose()
      }, 5000)
      return () => clearTimeout(timer)
    }
  }, [callActive, callStatus, onClose])

  if (!callStatus) return null

  const getStatusColor = () => {
    if (callStatus.includes('✅') || callStatus.includes('completed')) {
      return 'bg-green-50 border-green-200 text-green-800'
    }
    if (callStatus.includes('❌') || callStatus.includes('failed') || callStatus.includes('📵')) {
      return 'bg-red-50 border-red-200 text-red-800'
    }
    if (callStatus.includes('🔄') || callStatus.includes('progress')) {
      return 'bg-blue-50 border-blue-200 text-blue-800'
    }
    if (callStatus.includes('🎯') || callStatus.includes('Contact answered')) {
      return 'bg-purple-50 border-purple-200 text-purple-800'
    }
    return 'bg-gray-50 border-gray-200 text-gray-800'
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 animate-in slide-in-from-bottom-2 duration-300">
      <div className={cn(
        "rounded-lg border-2 shadow-lg p-4 min-w-[320px] max-w-md",
        getStatusColor()
      )}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <div className="font-medium mb-1">
              {contactName || phoneNumber}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm">{callStatus}</span>
              {(callStatus.includes('Calling') || callStatus.includes('Connecting') || callStatus.includes('progress')) && (
                <Loader2 className="h-3 w-3 animate-spin" />
              )}
            </div>
          </div>
          
          <div className="flex items-center gap-1">
            {callActive ? (
              <Button
                size="sm"
                variant="destructive"
                onClick={onEndCall}
                className="h-8 px-3"
              >
                <PhoneOff className="h-3 w-3 mr-1" />
                End
              </Button>
            ) : (
              <Button
                size="sm"
                variant="ghost"
                onClick={onClose}
                className="h-8 w-8 p-0"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>

        {/* Progress bar for active calls */}
        {callActive && (
          <div className="mt-3 h-1 bg-black/10 rounded-full overflow-hidden">
            <div className="h-full bg-black/30 rounded-full animate-pulse" />
          </div>
        )}
      </div>
    </div>
  )
}