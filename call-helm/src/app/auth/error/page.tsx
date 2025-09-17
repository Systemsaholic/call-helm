import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { XCircle, AlertCircle } from 'lucide-react'

export default function AuthErrorPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8 text-center">
        <div className="bg-white p-8 rounded-lg shadow-lg">
          <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100 mb-4">
            <XCircle className="h-6 w-6 text-red-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Authentication Error</h2>
          <p className="text-gray-600 mb-4">
            There was an error during the authentication process. This could be due to:
          </p>
          <div className="text-left bg-gray-50 p-4 rounded-md mb-6">
            <ul className="list-disc list-inside text-sm text-gray-600 space-y-1">
              <li>An expired invitation link (links expire after 24 hours)</li>
              <li>The link has already been used</li>
              <li>An invalid or malformed request</li>
            </ul>
          </div>
          <div className="bg-blue-50 border border-blue-200 rounded-md p-3 mb-6">
            <div className="flex">
              <AlertCircle className="h-5 w-5 text-blue-400 mr-2 flex-shrink-0" />
              <p className="text-sm text-blue-700">
                If you need a new invitation, please contact your administrator.
              </p>
            </div>
          </div>
          <div className="space-y-3">
            <Link href="/auth/login" className="block">
              <Button className="w-full">
                Back to login
              </Button>
            </Link>
            <Link href="/auth/reset-password" className="block">
              <Button variant="outline" className="w-full">
                Reset password
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}