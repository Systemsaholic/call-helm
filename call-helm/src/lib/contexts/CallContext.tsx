'use client'

import React, { createContext, useContext, useState, useCallback, useRef } from 'react'
import { CallStatusNotification } from '@/components/calls/CallStatusNotification'

interface CallState {
  isActive: boolean
  callId: string | null
  status: string
  contactName?: string
  phoneNumber?: string
}

interface CallContextType {
  callState: CallState
  startCall: (callId: string, contactName?: string, phoneNumber?: string) => void
  updateCallStatus: (status: string) => void
  endCall: () => void
}

const CallContext = createContext<CallContextType | undefined>(undefined)

export function CallProvider({ children }: { children: React.ReactNode }) {
  const [callState, setCallState] = useState<CallState>({
    isActive: false,
    callId: null,
    status: '',
    contactName: undefined,
    phoneNumber: undefined
  })

  const statusPollingRef = useRef<NodeJS.Timeout | null>(null)
  const lastStatusRef = useRef<string>('')

  const startCall = useCallback((callId: string, contactName?: string, phoneNumber?: string) => {
    setCallState({
      isActive: true,
      callId,
      status: '📞 Initiating call...',
      contactName,
      phoneNumber
    })
    
    // Start polling for status
    startStatusPolling(callId)
  }, [])

  const updateCallStatus = useCallback((status: string) => {
    // Prevent duplicate updates
    if (status === lastStatusRef.current) return
    lastStatusRef.current = status
    
    setCallState(prev => ({
      ...prev,
      status
    }))

    // Check if call ended - look for specific keywords in the mapped status
    const isCallEnded = ['✅ Call completed', '📵 Line busy', '❌ Call failed', '📞 No answer', '📱 Call ended'].some(s => status === s)
    
    if (isCallEnded) {
      stopStatusPolling()
      // Mark as not active immediately but keep the status message visible for 5 seconds
      setTimeout(() => {
        setCallState(prev => ({
          ...prev,
          isActive: false
        }))
      }, 100)
    }
  }, [])

  const endCall = useCallback(async () => {
    const { callId } = callState
    if (!callId) return

    try {
      await fetch(`/api/calls/${callId}/end`, { method: 'POST' })
    } catch (error) {
      console.error('Error ending call:', error)
    }

    stopStatusPolling()
    setCallState({
      isActive: false,
      callId: null,
      status: '',
      contactName: undefined,
      phoneNumber: undefined
    })
    lastStatusRef.current = ''
  }, [callState])

  const startStatusPolling = (callId: string) => {
    // Clear any existing polling
    if (statusPollingRef.current) {
      clearInterval(statusPollingRef.current)
    }

    const pollStatus = async () => {
      try {
        const response = await fetch(`/api/calls/${callId}/status`)
        if (response.ok) {
          const data = await response.json()
          
          // Stop polling if call ended (check endTime first as it's most reliable)
          if (data.endTime) {
            // Use completed status if we have an end time
            const finalStatus = ['completed', 'busy', 'failed', 'no-answer', 'ended'].includes(data.status) 
              ? data.status 
              : 'completed'
            updateCallStatus(mapStatusToDisplay(finalStatus))
            stopStatusPolling()
            
            // Clear the call state after a delay
            setTimeout(() => {
              setCallState({
                isActive: false,
                callId: null,
                status: '',
                contactName: undefined,
                phoneNumber: undefined
              })
              lastStatusRef.current = ''
            }, 5000)
            return
          }
          
          // Also stop if status is terminal
          if (['completed', 'busy', 'failed', 'no-answer', 'ended', 'canceled'].includes(data.status)) {
            updateCallStatus(mapStatusToDisplay(data.status))
            stopStatusPolling()
            
            // Clear the call state after a delay
            setTimeout(() => {
              setCallState({
                isActive: false,
                callId: null,
                status: '',
                contactName: undefined,
                phoneNumber: undefined
              })
              lastStatusRef.current = ''
            }, 5000)
            return
          }
          
          updateCallStatus(mapStatusToDisplay(data.status))
        }
      } catch (error) {
        console.error('Error polling call status:', error)
      }
    }

    // Poll immediately and then every 2 seconds
    pollStatus()
    statusPollingRef.current = setInterval(pollStatus, 2000)
  }

  const stopStatusPolling = () => {
    if (statusPollingRef.current) {
      clearInterval(statusPollingRef.current)
      statusPollingRef.current = null
    }
  }

  const mapStatusToDisplay = (status: string): string => {
    switch (status) {
      case 'initiated':
        return '📞 Initiating call...'
      case 'ringing':
        return '📲 Calling your phone...'
      case 'answered':
        return '✅ You answered! Connecting to contact...'
      case 'contact-connected':
        return '🎯 Contact answered! Both parties connected'
      case 'in-progress':
        return '🔄 Call in progress'
      case 'completed':
        return '✅ Call completed successfully'
      case 'busy':
        return '📵 Line busy - please try again'
      case 'failed':
      case 'canceled':
        return '❌ Call failed - please try again'
      case 'no-answer':
      case 'missed':
        return '📞 No answer - please try again'
      case 'ended':
        return '📱 Call ended by user'
      default:
        return `📡 ${status}`
    }
  }

  const handleCloseNotification = useCallback(() => {
    setCallState(prev => ({
      ...prev,
      status: '',
      isActive: false
    }))
    lastStatusRef.current = ''
  }, [])

  return (
    <CallContext.Provider value={{ callState, startCall, updateCallStatus, endCall }}>
      {children}
      <CallStatusNotification
        callStatus={callState.status}
        callActive={callState.isActive}
        contactName={callState.contactName}
        phoneNumber={callState.phoneNumber || ''}
        onEndCall={endCall}
        onClose={handleCloseNotification}
      />
    </CallContext.Provider>
  )
}

export function useCall() {
  const context = useContext(CallContext)
  if (!context) {
    throw new Error('useCall must be used within CallProvider')
  }
  return context
}