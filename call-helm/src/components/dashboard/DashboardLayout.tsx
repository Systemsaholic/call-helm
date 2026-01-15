'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useAuth } from '@/lib/hooks/useAuth'
import { useProfile } from '@/lib/hooks/useProfile'
import { useBilling } from '@/lib/hooks/useBilling'
import { useUnreadCounts } from '@/lib/hooks/useUnreadCounts'
import { useUserRole } from '@/lib/hooks/useUserRole'
import { Button } from '@/components/ui/button'
import { NotificationCenter } from '@/components/dashboard/NotificationCenter'
import { RecordingToggle } from '@/components/dashboard/RecordingToggle'
import { CallProvider } from '@/lib/contexts/CallContext'
import {
  LayoutDashboard,
  Users,
  UserCheck,
  Phone,
  PhoneCall,
  MessageSquare,
  FileText,
  BarChart3,
  Settings,
  LogOut,
  Menu,
  X,
  ChevronDown,
  Building,
  Bell,
  HelpCircle,
  Radio
} from 'lucide-react'

interface NavItem {
  name: string
  href: string
  icon: React.ElementType
  badge?: number
  roles?: string[]
}

const navigation: NavItem[] = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Call Board', href: '/dashboard/call-board', icon: PhoneCall },
  { name: 'Call Lists', href: '/dashboard/call-lists', icon: FileText, roles: ['org_admin', 'team_lead', 'billing_admin'] },
  { name: 'Contacts', href: '/dashboard/contacts', icon: Users, roles: ['org_admin', 'team_lead', 'billing_admin'] },
  { name: 'Agents', href: '/dashboard/agents', icon: UserCheck, roles: ['org_admin', 'team_lead'] },
  { name: 'Messages', href: '/dashboard/messages', icon: MessageSquare },
  { name: 'Broadcasts', href: '/dashboard/broadcasts', icon: Radio, roles: ['org_admin', 'team_lead'] },
  { name: 'Analytics', href: '/dashboard/analytics', icon: BarChart3, roles: ['org_admin', 'team_lead', 'billing_admin'] },
  { name: 'Settings', href: '/dashboard/settings', icon: Settings },
]

// Billing status card component
function BillingStatusCard() {
  const { limits, trialDaysRemaining, isLoading } = useBilling()
  const router = useRouter()

  if (isLoading || !limits) {
    return (
      <div className="bg-gradient-to-r from-primary to-accent rounded-lg p-4 text-white">
        <div className="space-y-2">
          <div className="h-4 bg-white/20 rounded w-24 animate-pulse"></div>
          <div className="h-3 bg-white/20 rounded w-32 animate-pulse"></div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-gradient-to-r from-primary to-accent rounded-lg p-4 text-white">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium">{limits.plan_display_name}</span>
        <span className="text-xs capitalize">{limits.subscription_status}</span>
      </div>
      
      {/* Show trial days remaining if in trial */}
      {limits.subscription_status === 'trialing' && trialDaysRemaining !== null && trialDaysRemaining !== undefined && (
        <div className="mb-2 px-2 py-1 bg-amber-500/20 rounded text-amber-100 text-xs font-medium">
          {trialDaysRemaining > 0 
            ? `${trialDaysRemaining} day${trialDaysRemaining !== 1 ? 's' : ''} left in trial`
            : 'Trial expires today'
          }
        </div>
      )}
      
      <div className="text-xs opacity-90">
        {limits.max_agents} agents • {limits.max_call_minutes >= 999999 ? 'Unlimited' : `${limits.max_call_minutes} min/mo`}
      </div>
      {limits.plan_slug !== 'enterprise' && (
        <Button
          size="sm"
          variant="secondary"
          className="w-full mt-3 bg-white text-primary hover:bg-gray-100"
          onClick={() => router.push('/dashboard/settings?tab=billing')}
        >
          Upgrade Plan
        </Button>
      )}
    </div>
  )
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const { user, signOut } = useAuth()
  const { profile } = useProfile()
  const { role, isAgent } = useUserRole()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false)

  // Get unread message counts (using new centralized hook)
  // Note: useUnreadCounts handles realtime subscriptions internally
  const { unreadCounts } = useUnreadCounts()

  // Get user role from database (falls back to org_admin for backwards compatibility)
  const userRole = role || 'org_admin'

  const handleSignOut = async () => {
    await signOut()
    router.push('/auth/login')
  }

  const filteredNavigation = navigation.filter(item => {
    if (!item.roles) return true
    return item.roles.includes(userRole)
  })

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-gray-600 bg-opacity-75 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Mobile sidebar */}
      <div className={`fixed inset-y-0 left-0 z-50 w-64 bg-white shadow-xl transform transition-transform duration-300 ease-in-out lg:hidden ${
        sidebarOpen ? 'translate-x-0' : '-translate-x-full'
      }`}>
        <div className="flex items-center justify-between h-16 px-4 border-b">
          <Link href="/dashboard" className="flex items-center">
            <Phone className="h-8 w-8 text-primary" />
            <span className="ml-2 text-xl font-bold text-gray-900">Call Helm</span>
          </Link>
          <button
            onClick={() => setSidebarOpen(false)}
            className="text-gray-500 hover:text-gray-700"
          >
            <X className="h-6 w-6" />
          </button>
        </div>
        <nav className="px-4 py-4">
          {filteredNavigation.map((item) => {
            const isActive = item.href === '/dashboard' 
              ? pathname === '/dashboard'
              : pathname === item.href || pathname.startsWith(item.href + '/')
            return (
              <Link
                key={item.name}
                href={item.href}
                className={`flex items-center justify-between px-3 py-2 mb-1 rounded-lg transition-colors ${
                  isActive
                    ? 'bg-primary text-white'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
                onClick={() => setSidebarOpen(false)}
              >
                <div className="flex items-center">
                  <item.icon className="h-5 w-5 mr-3" />
                  <span className="font-medium">{item.name}</span>
                </div>
                {((item.name === 'Messages' && unreadCounts.totalUnread > 0) || (item.name !== 'Messages' && item.badge)) && (
                  <span className={`px-2 py-0.5 text-xs rounded-full ${
                    isActive ? 'bg-white text-primary' : 'bg-primary text-white'
                  }`}>
                    {item.name === 'Messages' ? unreadCounts.totalUnread : item.badge}
                  </span>
                )}
              </Link>
            )
          })}
        </nav>
      </div>

      {/* Desktop sidebar */}
      <div className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-40 lg:w-64 lg:bg-white lg:shadow-lg lg:flex lg:flex-col">
        <div className="flex items-center h-16 px-4 border-b">
          <Link href="/dashboard" className="flex items-center">
            <Phone className="h-8 w-8 text-primary" />
            <span className="ml-2 text-xl font-bold text-gray-900">Call Helm</span>
          </Link>
        </div>
        
        <nav className="flex-1 px-4 py-4 overflow-y-auto">
          {filteredNavigation.map((item) => {
            const isActive = item.href === '/dashboard' 
              ? pathname === '/dashboard'
              : pathname === item.href || pathname.startsWith(item.href + '/')
            return (
              <Link
                key={item.name}
                href={item.href}
                className={`flex items-center justify-between px-3 py-2 mb-1 rounded-lg transition-colors ${
                  isActive
                    ? 'bg-primary text-white'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                <div className="flex items-center">
                  <item.icon className="h-5 w-5 mr-3" />
                  <span className="font-medium">{item.name}</span>
                </div>
                {((item.name === 'Messages' && unreadCounts.totalUnread > 0) || (item.name !== 'Messages' && item.badge)) && (
                  <span className={`px-2 py-0.5 text-xs rounded-full ${
                    isActive ? 'bg-white text-primary' : 'bg-primary text-white'
                  }`}>
                    {item.name === 'Messages' ? unreadCounts.totalUnread : item.badge}
                  </span>
                )}
              </Link>
            )
          })}
        </nav>

        <div className="p-4 border-t">
          <BillingStatusCard />
        </div>
      </div>

      {/* Main content area */}
      <div className="lg:pl-64">
        {/* Top header */}
        <header className="bg-white shadow-sm border-b">
          <div className="flex items-center justify-between h-16 px-4 sm:px-6 lg:px-8">
            <button
              onClick={() => setSidebarOpen(true)}
              className="text-gray-500 hover:text-gray-700 lg:hidden"
            >
              <Menu className="h-6 w-6" />
            </button>

            <div className="flex-1 flex items-center">
              <h1 className="text-lg font-semibold text-gray-900 ml-4 lg:ml-0">
                {filteredNavigation.find(item => pathname.startsWith(item.href))?.name || 'Dashboard'}
              </h1>
            </div>

            <div className="flex items-center gap-4">
              {/* Recording Toggle - Only show for Pro plan users */}
              <RecordingToggle />
              
              {/* Notifications */}
              <NotificationCenter />

              {/* Help */}
              <button className="text-gray-500 hover:text-gray-700">
                <HelpCircle className="h-5 w-5" />
              </button>

              {/* Profile dropdown */}
              <div className="relative">
                <button
                  onClick={() => setProfileDropdownOpen(!profileDropdownOpen)}
                  className="flex items-center gap-3 text-sm font-medium text-gray-700 hover:text-gray-900"
                >
                  <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center overflow-hidden">
                    {(profile?.avatar_url || user?.user_metadata?.picture || user?.user_metadata?.avatar_url) ? (
                      <img
                        src={profile?.avatar_url || user?.user_metadata?.picture || user?.user_metadata?.avatar_url}
                        alt="Profile"
                        className="h-full w-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <span className="text-primary font-bold">
                        {(() => {
                          const fullName = profile?.full_name || user?.user_metadata?.full_name || user?.user_metadata?.name || ''
                          const [firstName, lastName] = fullName.split(' ')
                          return firstName?.charAt(0).toUpperCase() ||
                                 lastName?.charAt(0).toUpperCase() ||
                                 user?.email?.charAt(0).toUpperCase() || 'U'
                        })()}
                      </span>
                    )}
                  </div>
                  <span className="hidden md:block">
                    {(() => {
                      const fullName = profile?.full_name || user?.user_metadata?.full_name || user?.user_metadata?.name || ''
                      const [firstName, lastName] = fullName.split(' ')
                      return firstName || lastName || user?.email
                    })()}
                  </span>
                  <ChevronDown className="h-4 w-4" />
                </button>

                {profileDropdownOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-10"
                      onClick={() => setProfileDropdownOpen(false)}
                    />
                    <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-lg border z-20">
                      <div className="px-4 py-3 border-b">
                        <p className="text-sm font-medium text-gray-900">
                          {profile?.full_name || user?.user_metadata?.full_name || user?.user_metadata?.name || 'User'}
                        </p>
                        <p className="text-xs text-gray-500 truncate">
                          {user?.email}
                        </p>
                      </div>
                      <div className="py-1">
                        <Link
                          href="/dashboard/settings"
                          className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                          onClick={() => setProfileDropdownOpen(false)}
                        >
                          <Settings className="h-4 w-4 mr-3" />
                          Account Settings
                        </Link>
                        <Link
                          href="/dashboard/analytics"
                          className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                          onClick={() => setProfileDropdownOpen(false)}
                        >
                          <BarChart3 className="h-4 w-4 mr-3" />
                          Analytics
                        </Link>
                        <Link
                          href="/help"
                          className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                          onClick={() => setProfileDropdownOpen(false)}
                        >
                          <HelpCircle className="h-4 w-4 mr-3" />
                          Help & Support
                        </Link>
                        <hr className="my-1" />
                        <button
                          onClick={handleSignOut}
                          className="flex items-center w-full px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                        >
                          <LogOut className="h-4 w-4 mr-3" />
                          Sign Out
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1">
          {children}
        </main>
      </div>
    </div>
  )
}