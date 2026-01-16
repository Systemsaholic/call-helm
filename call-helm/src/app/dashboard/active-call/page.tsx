'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAgentQueue } from '@/lib/hooks/useAgentAssignments'
import { Loader2, Phone, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import Link from 'next/link'

/**
 * Index page for /dashboard/active-call
 * Redirects to the next contact in queue or shows a message if queue is empty
 */
export default function ActiveCallIndexPage() {
  const router = useRouter()
  const { data: queueData, isLoading } = useAgentQueue()

  const nextContact = queueData?.contacts?.[0]

  useEffect(() => {
    // If we have a contact with a phone number, redirect to their active call page
    if (!isLoading && nextContact?.phone_number) {
      router.replace(`/dashboard/active-call/${encodeURIComponent(nextContact.phone_number)}`)
    }
  }, [isLoading, nextContact, router])

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-4" />
          <p className="text-gray-600">Loading your next contact...</p>
        </div>
      </div>
    )
  }

  // If we have a contact but no phone number, show error
  if (nextContact && !nextContact.phone_number) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="text-center max-w-md">
          <div className="bg-yellow-100 p-4 rounded-full w-16 h-16 mx-auto mb-4 flex items-center justify-center">
            <Phone className="h-8 w-8 text-yellow-600" />
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">Contact Missing Phone Number</h1>
          <p className="text-gray-600 mb-6">
            The next contact in your queue doesn't have a phone number. Please contact your administrator.
          </p>
          <Link href="/dashboard">
            <Button variant="outline">Back to Dashboard</Button>
          </Link>
        </div>
      </div>
    )
  }

  // No contacts in queue
  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="text-center max-w-md">
        <div className="bg-green-100 p-4 rounded-full w-16 h-16 mx-auto mb-4 flex items-center justify-center">
          <CheckCircle2 className="h-8 w-8 text-green-600" />
        </div>
        <h1 className="text-xl font-bold text-gray-900 mb-2">All Caught Up!</h1>
        <p className="text-gray-600 mb-6">
          You don't have any contacts assigned to you right now. Check back later or ask your team lead to assign you more contacts.
        </p>
        <div className="flex gap-4 justify-center">
          <Link href="/dashboard">
            <Button variant="outline">Back to Dashboard</Button>
          </Link>
          <Link href="/dashboard/call-board">
            <Button>View Call Board</Button>
          </Link>
        </div>
      </div>
    </div>
  )
}
