'use client'

import { useAuth } from '@/lib/hooks/useAuth'
import { Button } from '@/components/ui/button'
import { useRouter } from 'next/navigation'
import { Loader2, Phone, Users, BarChart3, Settings, LogOut } from 'lucide-react'

export default function DashboardPage() {
  const { user, loading, signOut } = useAuth()
  const router = useRouter()

  const handleSignOut = async () => {
    await signOut()
    router.push('/auth/login')
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (!user) {
    router.push('/auth/login')
    return null
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <h1 className="text-xl font-bold text-primary">Call Helm</h1>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-sm text-gray-600">{user.email}</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleSignOut}
                className="text-gray-600 hover:text-gray-900"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-gray-900">Welcome back!</h2>
          <p className="text-gray-600 mt-1">Here's an overview of your call center activity</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="bg-white p-6 rounded-lg shadow">
            <div className="flex items-center justify-between mb-4">
              <div className="bg-primary/10 p-3 rounded-lg">
                <Phone className="h-6 w-6 text-primary" />
              </div>
              <span className="text-sm text-gray-500">Today</span>
            </div>
            <h3 className="text-2xl font-bold text-gray-900">0</h3>
            <p className="text-gray-600 text-sm mt-1">Total Calls</p>
          </div>

          <div className="bg-white p-6 rounded-lg shadow">
            <div className="flex items-center justify-between mb-4">
              <div className="bg-accent/10 p-3 rounded-lg">
                <Users className="h-6 w-6 text-accent" />
              </div>
              <span className="text-sm text-gray-500">Active</span>
            </div>
            <h3 className="text-2xl font-bold text-gray-900">0</h3>
            <p className="text-gray-600 text-sm mt-1">Agents Online</p>
          </div>

          <div className="bg-white p-6 rounded-lg shadow">
            <div className="flex items-center justify-between mb-4">
              <div className="bg-blue-100 p-3 rounded-lg">
                <BarChart3 className="h-6 w-6 text-blue-600" />
              </div>
              <span className="text-sm text-gray-500">Average</span>
            </div>
            <h3 className="text-2xl font-bold text-gray-900">0:00</h3>
            <p className="text-gray-600 text-sm mt-1">Call Duration</p>
          </div>

          <div className="bg-white p-6 rounded-lg shadow">
            <div className="flex items-center justify-between mb-4">
              <div className="bg-purple-100 p-3 rounded-lg">
                <Settings className="h-6 w-6 text-purple-600" />
              </div>
              <span className="text-sm text-gray-500">System</span>
            </div>
            <h3 className="text-2xl font-bold text-gray-900">Ready</h3>
            <p className="text-gray-600 text-sm mt-1">Status</p>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Button className="justify-start" variant="outline">
              <Phone className="h-4 w-4 mr-2" />
              Make a Call
            </Button>
            <Button className="justify-start" variant="outline">
              <Users className="h-4 w-4 mr-2" />
              Manage Agents
            </Button>
            <Button className="justify-start" variant="outline">
              <BarChart3 className="h-4 w-4 mr-2" />
              View Reports
            </Button>
          </div>
        </div>

        <div className="mt-8 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <p className="text-sm text-yellow-800">
            <strong>Getting Started:</strong> This is your dashboard. Start by adding agents to your organization and uploading call recordings for analysis.
          </p>
        </div>
      </div>
    </div>
  )
}