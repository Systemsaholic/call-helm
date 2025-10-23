'use client'

import { SMSInbox } from '@/components/sms/SMSInbox'

export default function MessagesPage() {
  return (
    <div className="h-[calc(100vh-4rem)]">
      <SMSInbox />
    </div>
  )
}