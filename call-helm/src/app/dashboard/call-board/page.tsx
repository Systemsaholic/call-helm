'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import CallBoard from './CallBoard'
import { RealtimeCallBoard } from '@/components/calls/RealtimeCallBoard'

function CallBoardContent() {
  const searchParams = useSearchParams()
  const listId = searchParams.get('list')
  
  // If there's a specific list ID, show the dialer interface
  // Otherwise show the real-time call monitoring board
  if (listId) {
    return <CallBoard />
  }
  
  return <RealtimeCallBoard />
}

export default function CallBoardPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <CallBoardContent />
    </Suspense>
  )
}