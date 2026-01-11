'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import CallBoard from './CallBoard'
import UnifiedCallBoard from './UnifiedCallBoard'
import { RealtimeCallBoard } from '@/components/calls/RealtimeCallBoard'

function CallBoardContent() {
  const searchParams = useSearchParams()
  const listId = searchParams.get('list')
  const campaign = searchParams.get('campaign')
  const unified = searchParams.get('unified')
  
  // If unified mode is enabled, use the new unified board
  if ((listId || campaign) && unified === 'true') {
    return <UnifiedCallBoard />
  }
  
  // If there's a specific list/campaign ID, show the dialer interface
  if (listId || campaign) {
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