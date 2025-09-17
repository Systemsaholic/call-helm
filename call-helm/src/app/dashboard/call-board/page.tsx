'use client'

import { Suspense } from 'react'
import CallBoard from './CallBoard'

export default function CallBoardPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <CallBoard />
    </Suspense>
  )
}