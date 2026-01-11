'use client'

import { useState, useEffect, useRef, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { useAuth } from '@/lib/hooks/useAuth'
import { useProfile } from '@/lib/hooks/useProfile'
import { useOrganizationSettings } from '@/lib/hooks/useOrganizationSettings'
import { useBilling } from '@/lib/hooks/useBilling'
import { DepartmentManagement } from '@/components/settings/DepartmentManagement'
import { UsageDashboard } from '@/components/dashboard/UsageDashboard'
import { VoiceServicesSetup } from '@/components/settings/VoiceServicesSetup'
import { BillingDashboard } from '@/components/billing/BillingDashboard'
import { PhoneNumberManagement } from '@/components/settings/PhoneNumberManagement'
import { ThreeCXIntegration } from '@/components/settings/ThreeCXIntegration'
import { Button } from '@/components/ui/button'
import { 
  User,
  Building,
  Bell,
  CreditCard,
  Key,
  Puzzle,
  Shield,
  Mail,
  Phone,
  Globe,
  Save,
  Loader2,
  Check,
  ChevronRight,
  AlertCircle,
  MessageSquare,
  Lock
} from 'lucide-react'

type SettingsTab = 'profile' | 'organization' | 'phone_numbers' | 'notifications' | 'billing' | 'api' | 'integrations' | 'security'

interface TabConfig {
  id: SettingsTab
  label: string
  icon: React.ElementType
  description: string
}

const tabs: TabConfig[] = [
  { id: 'profile', label: 'Profile', icon: User, description: 'Manage your personal information' },
  { id: 'organization', label: 'Organization', icon: Building, description: 'Configure organization settings' },
  { id: 'phone_numbers', label: 'Phone Numbers', icon: Phone, description: 'Search, purchase, port numbers, and manage SMS compliance' },
  { id: 'notifications', label: 'Notifications', icon: Bell, description: 'Set your notification preferences' },
  { id: 'billing', label: 'Billing', icon: CreditCard, description: 'Manage subscription and payments' },
  { id: 'api', label: 'API Keys', icon: Key, description: 'Manage API keys and webhooks' },
  { id: 'integrations', label: 'Integrations', icon: Puzzle, description: 'Connect external services' },
  { id: 'security', label: 'Security', icon: Shield, description: 'Security and privacy settings' },
]

function SettingsContent() {
  const { user, supabase } = useAuth()
  const { profile, updateProfile, uploadAvatar } = useProfile()
  const { settings: orgSettings, updateSettings: updateOrgSettings } = useOrganizationSettings()
  const { limits, showUpgradePrompt } = useBilling()
  const searchParams = useSearchParams()
  const tabParam = searchParams.get('tab') as SettingsTab | null
  const [activeTab, setActiveTab] = useState<SettingsTab>(tabParam || 'profile')
  const [saving, setSaving] = useState(false)
  const [savedTab, setSavedTab] = useState<SettingsTab | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [selectedIntegration, setSelectedIntegration] = useState<string | null>(null)

  // Update active tab when URL parameter changes
  useEffect(() => {
    if (tabParam && tabs.some(t => t.id === tabParam)) {
      setActiveTab(tabParam)
    }
  }, [tabParam])

  // Profile state
  const [profileData, setProfileData] = useState({
    fullName: '',
    email: '',
    phone: '',
    bio: ''
  })

  // Organization state
  const [orgData, setOrgData] = useState({
    name: 'My Organization',
    website: '',
    timezone: 'UTC',
    language: 'en',
    dateFormat: 'MM/DD/YYYY',
    timeFormat: '12h'
  })

  // Initialize profile data when profile loads
  useEffect(() => {
    if (profile) {
      setProfileData({
        fullName: profile.full_name || '',
        email: profile.email || user?.email || '',
        phone: profile.phone || '',
        bio: profile.bio || ''
      })
    }
  }, [profile, user])

  // Initialize organization data when settings load
  useEffect(() => {
    if (orgSettings) {
      setOrgData({
        name: 'My Organization',
        website: orgSettings.website || '',
        timezone: orgSettings.date_format || 'UTC',
        language: orgSettings.language || 'en',
        dateFormat: orgSettings.date_format || 'MM/DD/YYYY',
        timeFormat: orgSettings.time_format || '12h'
      })
    }
  }, [orgSettings])

  // Notification state
  const [notifications, setNotifications] = useState({
    emailCalls: true,
    emailReports: true,
    emailAgentActivity: false,
    pushCalls: true,
    pushMessages: true,
    smsAlerts: false
  })

  // Billing state
  const [billingData, setBillingData] = useState({
    plan: 'Professional',
    seats: 5,
    billingEmail: user?.email || '',
    paymentMethod: '**** **** **** 4242'
  })

  const handleSave = async () => {
    setSaving(true)
    let success = false

    try {
      if (activeTab === 'profile') {
        const { error } = await updateProfile({
          full_name: profileData.fullName,
          email: profileData.email,
          phone: profileData.phone,
          bio: profileData.bio
        })
        success = !error
      } else if (activeTab === 'organization' && orgSettings) {
        const { error } = await updateOrgSettings({
          website: orgData.website,
          language: orgData.language,
          date_format: orgData.dateFormat,
          time_format: orgData.timeFormat
        })
        success = !error
      } else if (activeTab === 'notifications' && orgSettings) {
        const { error } = await updateOrgSettings({
          notification_preferences: notifications
        })
        success = !error
      } else if (activeTab === 'billing' && orgSettings) {
        const { error } = await updateOrgSettings({
          billing_email: billingData.billingEmail
        })
        success = !error
      } else {
        // For other tabs, just simulate save for now
        await new Promise(resolve => setTimeout(resolve, 1000))
        success = true
      }

      if (success) {
        setSavedTab(activeTab)
        setTimeout(() => setSavedTab(null), 3000)
      }
    } catch (error) {
      console.error('Error saving settings:', error)
    } finally {
      setSaving(false)
    }
  }

  const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    // Reset error state
    setUploadError(null)
    setUploading(true)

    try {
      // Check file size (2MB limit)
      if (file.size > 2 * 1024 * 1024) {
        setUploadError('File size must be less than 2MB')
        setUploading(false)
        return
      }

      // Check file type
      const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
      if (!validTypes.includes(file.type)) {
        setUploadError('Please upload a JPG, PNG, GIF, or WebP image')
        setUploading(false)
        return
      }

      const { data, error } = await uploadAvatar(file)
      
      if (error) {
        console.error('Upload error:', error)
        setUploadError(error)
      } else {
        // Avatar updated successfully
        setSavedTab('profile')
        setTimeout(() => setSavedTab(null), 3000)
      }
    } catch (err) {
      console.error('Upload error:', err)
      setUploadError('Failed to upload image. Please try again.')
    } finally {
      setUploading(false)
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const renderTabContent = () => {
    switch (activeTab) {
      case 'profile':
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Personal Information</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Full Name
                  </label>
                  <input
                    type="text"
                    value={profileData.fullName}
                    onChange={(e) => setProfileData({ ...profileData, fullName: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Email Address
                  </label>
                  <input
                    type="email"
                    value={profileData.email}
                    onChange={(e) => setProfileData({ ...profileData, email: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Phone Number
                  </label>
                  <input
                    type="tel"
                    value={profileData.phone}
                    onChange={(e) => setProfileData({ ...profileData, phone: e.target.value })}
                    placeholder="+1 (555) 000-0000"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Time Zone
                  </label>
                  <select className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary">
                    <option>Eastern Time (ET)</option>
                    <option>Central Time (CT)</option>
                    <option>Mountain Time (MT)</option>
                    <option>Pacific Time (PT)</option>
                  </select>
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Profile Photo</h3>
              <div className="flex items-center gap-4">
                <div className="h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center overflow-hidden relative">
                  {uploading && (
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                      <Loader2 className="h-6 w-6 text-white animate-spin" />
                    </div>
                  )}
                  {profile?.avatar_url ? (
                    <img 
                      src={profile.avatar_url} 
                      alt="Profile" 
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="text-2xl font-bold text-primary">
                      {profileData.fullName?.charAt(0) || 'U'}
                    </span>
                  )}
                </div>
                <div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/gif,image/webp"
                    className="hidden"
                    onChange={handleAvatarUpload}
                    disabled={uploading}
                  />
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                  >
                    {uploading ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Uploading...
                      </>
                    ) : (
                      'Upload Photo'
                    )}
                  </Button>
                  <p className="text-xs text-gray-500 mt-1">JPG, PNG, GIF or WebP, max 2MB</p>
                  {uploadError && (
                    <p className="text-xs text-red-600 mt-1 flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      {uploadError}
                    </p>
                  )}
                  {savedTab === 'profile' && !uploadError && (
                    <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
                      <Check className="h-3 w-3" />
                      Photo uploaded successfully
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Bio</h3>
              <textarea
                value={profileData.bio}
                onChange={(e) => setProfileData({ ...profileData, bio: e.target.value })}
                placeholder="Tell us about yourself..."
                rows={4}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>
        )

      case 'phone_numbers':
        // Check if user has access to phone number management
        if (!limits?.features?.phone_number_management) {
          return (
            <div className="text-center py-12">
              <div className="mx-auto w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                <Lock className="h-12 w-12 text-gray-400" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Phone Number Management Locked</h3>
              <p className="text-gray-600 mb-6">
                Phone number management and SMS services require a Starter plan or higher.
              </p>
              <div className="space-y-4">
                <div className="bg-gray-50 rounded-lg p-4">
                  <h4 className="font-medium text-gray-900 mb-2">Upgrade to unlock:</h4>
                  <ul className="text-sm text-gray-600 space-y-1">
                    <li>• Search and purchase phone numbers</li>
                    <li>• Port your existing business numbers</li>
                    <li>• Configure voice and SMS services automatically</li>
                    <li>• Create SMS brands and campaigns for compliance</li>
                    <li>• Manage multiple phone numbers with webhooks</li>
                    <li>• Real-time status tracking and monitoring</li>
                  </ul>
                </div>
                <Button 
                  onClick={() => {
                    setActiveTab('billing')
                    window.history.pushState({}, '', '/dashboard/settings?tab=billing')
                  }}
                  className="w-full sm:w-auto"
                >
                  Upgrade to Starter Plan
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          )
        }
        
        return <PhoneNumberManagement />

      case 'organization':
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Organization Details</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Organization Name
                  </label>
                  <input
                    type="text"
                    value={orgData.name}
                    onChange={(e) => setOrgData({ ...orgData, name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Website
                  </label>
                  <input
                    type="url"
                    value={orgData.website}
                    onChange={(e) => setOrgData({ ...orgData, website: e.target.value })}
                    placeholder="https://example.com"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Default Language
                  </label>
                  <select 
                    value={orgData.language}
                    onChange={(e) => setOrgData({ ...orgData, language: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                  >
                    <option value="en">English</option>
                    <option value="es">Spanish</option>
                    <option value="fr">French</option>
                    <option value="de">German</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Date Format
                  </label>
                  <select 
                    value={orgData.dateFormat}
                    onChange={(e) => setOrgData({ ...orgData, dateFormat: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                  >
                    <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                    <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                    <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                  </select>
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Call Settings</h3>
              <div className="space-y-3">
                <label className={`flex items-center gap-3 ${!limits?.features?.call_recording ? 'opacity-50 cursor-not-allowed' : ''}`}>
                  <input 
                    type="checkbox" 
                    className="h-4 w-4 text-primary rounded" 
                    defaultChecked={limits?.features?.call_recording}
                    disabled={!limits?.features?.call_recording}
                  />
                  <span className="text-sm text-gray-700">Auto-record all calls</span>
                  {!limits?.features?.call_recording && (
                    <div className="flex items-center gap-1 ml-auto">
                      <Lock className="h-3 w-3 text-gray-400" />
                      <span className="text-xs text-gray-500">Requires Starter plan</span>
                      <Button 
                        size="sm" 
                        variant="link" 
                        className="text-xs p-0 h-auto"
                        onClick={() => {
                          setActiveTab('billing')
                          window.history.pushState({}, '', '/dashboard/settings?tab=billing')
                        }}
                      >
                        Upgrade
                      </Button>
                    </div>
                  )}
                </label>
                <label className={`flex items-center gap-3 ${!limits?.features?.call_transcription ? 'opacity-50 cursor-not-allowed' : ''}`}>
                  <input 
                    type="checkbox" 
                    className="h-4 w-4 text-primary rounded" 
                    defaultChecked={limits?.features?.call_transcription}
                    disabled={!limits?.features?.call_transcription}
                  />
                  <span className="text-sm text-gray-700">Enable call transcription</span>
                  {!limits?.features?.call_transcription && (
                    <div className="flex items-center gap-1 ml-auto">
                      <Lock className="h-3 w-3 text-gray-400" />
                      <span className="text-xs text-gray-500">Requires Professional plan</span>
                      <Button 
                        size="sm" 
                        variant="link" 
                        className="text-xs p-0 h-auto"
                        onClick={() => {
                          setActiveTab('billing')
                          window.history.pushState({}, '', '/dashboard/settings?tab=billing')
                        }}
                      >
                        Upgrade
                      </Button>
                    </div>
                  )}
                </label>
                <label className="flex items-center gap-3">
                  <input 
                    type="checkbox" 
                    className="h-4 w-4 text-primary rounded"
                    checked={orgSettings?.allow_agents_toggle_recording || false}
                    onChange={(e) => {
                      updateOrgSettings({
                        allow_agents_toggle_recording: e.target.checked
                      })
                    }}
                  />
                  <span className="text-sm text-gray-700">Allow agents to toggle call recording</span>
                  <span className="text-xs text-gray-500 ml-auto">
                    When disabled, only administrators can control recording settings
                  </span>
                </label>
                <label className="flex items-center gap-3">
                  <input type="checkbox" className="h-4 w-4 text-primary rounded" />
                  <span className="text-sm text-gray-700">Require call notes</span>
                </label>
                <label className={`flex items-center gap-3 ${!limits?.features?.ai_analysis ? 'opacity-50 cursor-not-allowed' : ''}`}>
                  <input 
                    type="checkbox" 
                    className="h-4 w-4 text-primary rounded" 
                    defaultChecked={limits?.features?.ai_analysis}
                    disabled={!limits?.features?.ai_analysis}
                  />
                  <span className="text-sm text-gray-700">Enable AI analysis</span>
                  {!limits?.features?.ai_analysis && (
                    <div className="flex items-center gap-1 ml-auto">
                      <Lock className="h-3 w-3 text-gray-400" />
                      <span className="text-xs text-gray-500">Requires Professional plan</span>
                      <Button 
                        size="sm" 
                        variant="link" 
                        className="text-xs p-0 h-auto"
                        onClick={() => {
                          setActiveTab('billing')
                          window.history.pushState({}, '', '/dashboard/settings?tab=billing')
                        }}
                      >
                        Upgrade
                      </Button>
                    </div>
                  )}
                </label>
                <label className={`flex items-center gap-3 ${!limits?.features?.sentiment_analysis ? 'opacity-50 cursor-not-allowed' : ''}`}>
                  <input 
                    type="checkbox" 
                    className="h-4 w-4 text-primary rounded" 
                    defaultChecked={limits?.features?.sentiment_analysis}
                    disabled={!limits?.features?.sentiment_analysis}
                  />
                  <span className="text-sm text-gray-700">Enable sentiment analysis</span>
                  {!limits?.features?.sentiment_analysis && (
                    <div className="flex items-center gap-1 ml-auto">
                      <Lock className="h-3 w-3 text-gray-400" />
                      <span className="text-xs text-gray-500">Requires Professional plan</span>
                      <Button 
                        size="sm" 
                        variant="link" 
                        className="text-xs p-0 h-auto"
                        onClick={() => {
                          setActiveTab('billing')
                          window.history.pushState({}, '', '/dashboard/settings?tab=billing')
                        }}
                      >
                        Upgrade
                      </Button>
                    </div>
                  )}
                </label>
              </div>
            </div>
            
            <div className="border-t pt-6">
              <DepartmentManagement />
            </div>
          </div>
        )

      case 'notifications':
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Email Notifications</h3>
              <div className="space-y-3">
                <label className="flex items-center justify-between">
                  <div>
                    <span className="text-sm font-medium text-gray-700">Call Summaries</span>
                    <p className="text-xs text-gray-500">Daily summary of calls made</p>
                  </div>
                  <input 
                    type="checkbox" 
                    checked={notifications.emailCalls}
                    onChange={(e) => setNotifications({ ...notifications, emailCalls: e.target.checked })}
                    className="h-4 w-4 text-primary rounded" 
                  />
                </label>
                <label className="flex items-center justify-between">
                  <div>
                    <span className="text-sm font-medium text-gray-700">Weekly Reports</span>
                    <p className="text-xs text-gray-500">Performance and analytics reports</p>
                  </div>
                  <input 
                    type="checkbox" 
                    checked={notifications.emailReports}
                    onChange={(e) => setNotifications({ ...notifications, emailReports: e.target.checked })}
                    className="h-4 w-4 text-primary rounded" 
                  />
                </label>
                <label className="flex items-center justify-between">
                  <div>
                    <span className="text-sm font-medium text-gray-700">Agent Activity</span>
                    <p className="text-xs text-gray-500">When agents join or leave</p>
                  </div>
                  <input 
                    type="checkbox" 
                    checked={notifications.emailAgentActivity}
                    onChange={(e) => setNotifications({ ...notifications, emailAgentActivity: e.target.checked })}
                    className="h-4 w-4 text-primary rounded" 
                  />
                </label>
              </div>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Push Notifications</h3>
              <div className="space-y-3">
                <label className="flex items-center justify-between">
                  <div>
                    <span className="text-sm font-medium text-gray-700">Incoming Calls</span>
                    <p className="text-xs text-gray-500">Notify when receiving calls</p>
                  </div>
                  <input 
                    type="checkbox" 
                    checked={notifications.pushCalls}
                    onChange={(e) => setNotifications({ ...notifications, pushCalls: e.target.checked })}
                    className="h-4 w-4 text-primary rounded" 
                  />
                </label>
                <label className="flex items-center justify-between">
                  <div>
                    <span className="text-sm font-medium text-gray-700">Messages</span>
                    <p className="text-xs text-gray-500">New message notifications</p>
                  </div>
                  <input 
                    type="checkbox" 
                    checked={notifications.pushMessages}
                    onChange={(e) => setNotifications({ ...notifications, pushMessages: e.target.checked })}
                    className="h-4 w-4 text-primary rounded" 
                  />
                </label>
                <label className="flex items-center justify-between">
                  <div>
                    <span className="text-sm font-medium text-gray-700">SMS Alerts</span>
                    <p className="text-xs text-gray-500">Critical alerts via SMS</p>
                  </div>
                  <input 
                    type="checkbox" 
                    checked={notifications.smsAlerts}
                    onChange={(e) => setNotifications({ ...notifications, smsAlerts: e.target.checked })}
                    className="h-4 w-4 text-primary rounded" 
                  />
                </label>
              </div>
            </div>
          </div>
        )

      case 'billing':
        return (
          <BillingDashboard />
        )

      case 'api':
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">API Keys</h3>
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-5 w-5 text-yellow-600 flex-shrink-0" />
                  <div>
                    <p className="text-sm text-yellow-800">
                      Keep your API keys secure and never share them publicly. Rotate keys regularly for security.
                    </p>
                  </div>
                </div>
              </div>
              
              <div className="space-y-3">
                <div className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <p className="text-sm font-medium text-gray-900">Production API Key</p>
                      <p className="text-xs text-gray-500">Created Jan 15, 2024</p>
                    </div>
                    <Button variant="outline" size="sm" className="text-red-600 hover:text-red-700">
                      Revoke
                    </Button>
                  </div>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 px-3 py-1 bg-gray-100 rounded text-xs">
                      ch_live_sk_********************3a2f
                    </code>
                    <Button variant="outline" size="sm">
                      Copy
                    </Button>
                  </div>
                </div>
                
                <div className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <p className="text-sm font-medium text-gray-900">Test API Key</p>
                      <p className="text-xs text-gray-500">Created Dec 10, 2023</p>
                    </div>
                    <Button variant="outline" size="sm" className="text-red-600 hover:text-red-700">
                      Revoke
                    </Button>
                  </div>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 px-3 py-1 bg-gray-100 rounded text-xs">
                      ch_test_sk_********************7b4e
                    </code>
                    <Button variant="outline" size="sm">
                      Copy
                    </Button>
                  </div>
                </div>
              </div>
              
              <Button className="w-full">
                <Key className="h-4 w-4 mr-2" />
                Generate New API Key
              </Button>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Webhooks</h3>
              <div className="space-y-3">
                <div className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-900">Call Completed</p>
                      <p className="text-xs text-gray-500">https://api.example.com/webhooks/calls</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full">Active</span>
                      <Button variant="outline" size="sm">Edit</Button>
                    </div>
                  </div>
                </div>
              </div>
              <Button variant="outline" className="w-full mt-3">
                Add Webhook Endpoint
              </Button>
            </div>
          </div>
        )

      case 'integrations':
        // If a specific integration is selected, show its detail view
        if (selectedIntegration === '3cx') {
          return (
            <div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedIntegration(null)}
                className="mb-4"
              >
                <ChevronRight className="h-4 w-4 mr-1 rotate-180" />
                Back to Integrations
              </Button>
              <ThreeCXIntegration />
            </div>
          )
        }

        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Available Integrations</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 bg-blue-100 rounded-lg flex items-center justify-center">
                        <Phone className="h-5 w-5 text-blue-600" />
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">Voice Provider</p>
                        <p className="text-xs text-gray-500">Telephony services</p>
                      </div>
                    </div>
                    <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full">Connected</span>
                  </div>
                  <Button variant="outline" size="sm" className="w-full">
                    Configure
                  </Button>
                </div>

                <div className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 bg-purple-100 rounded-lg flex items-center justify-center">
                        <MessageSquare className="h-5 w-5 text-purple-600" />
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">Twilio</p>
                        <p className="text-xs text-gray-500">SMS messaging</p>
                      </div>
                    </div>
                  </div>
                  <Button size="sm" className="w-full">
                    Connect
                  </Button>
                </div>

                <div className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 bg-green-100 rounded-lg flex items-center justify-center">
                        <Phone className="h-5 w-5 text-green-600" />
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">3CX</p>
                        <p className="text-xs text-gray-500">PBX system</p>
                      </div>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    className="w-full"
                    onClick={() => setSelectedIntegration('3cx')}
                  >
                    Configure
                  </Button>
                </div>

                <div className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 bg-orange-100 rounded-lg flex items-center justify-center">
                        <Globe className="h-5 w-5 text-orange-600" />
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">Salesforce</p>
                        <p className="text-xs text-gray-500">CRM integration</p>
                      </div>
                    </div>
                  </div>
                  <Button size="sm" className="w-full">
                    Connect
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )

      case 'security':
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Password & Authentication</h3>
              <div className="space-y-4">
                <div>
                  <Button variant="outline">
                    Change Password
                  </Button>
                  <p className="text-xs text-gray-500 mt-1">Last changed 30 days ago</p>
                </div>
                
                <div>
                  <label className="flex items-center justify-between">
                    <div>
                      <span className="text-sm font-medium text-gray-700">Two-Factor Authentication</span>
                      <p className="text-xs text-gray-500">Add an extra layer of security</p>
                    </div>
                    <Button size="sm">
                      Enable 2FA
                    </Button>
                  </label>
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Active Sessions</h3>
              <div className="space-y-3">
                <div className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-900">Chrome on MacOS</p>
                      <p className="text-xs text-gray-500">San Francisco, CA • Current session</p>
                    </div>
                    <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full">Active</span>
                  </div>
                </div>
                <div className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-900">Mobile App on iOS</p>
                      <p className="text-xs text-gray-500">San Francisco, CA • 2 hours ago</p>
                    </div>
                    <Button variant="outline" size="sm" className="text-red-600 hover:text-red-700">
                      Revoke
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Data & Privacy</h3>
              <div className="space-y-3">
                <Button variant="outline" className="w-full justify-between">
                  <span>Download Your Data</span>
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <Button variant="outline" className="w-full justify-between text-red-600 hover:text-red-700">
                  <span>Delete Account</span>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        )

      default:
        return null
    }
  }

  return (
    <div className="px-6 lg:px-8 py-6 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Settings</h1>
        <p className="text-gray-600">Manage your account and organization preferences</p>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Sidebar Navigation */}
        <div className="lg:w-64">
          <nav className="bg-white rounded-lg shadow p-4 space-y-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                  activeTab === tab.id
                    ? 'bg-primary text-primary-foreground'
                    : 'text-gray-700 hover:bg-accent hover:text-accent-foreground'
                }`}
              >
                <tab.icon className="h-5 w-5" />
                <div className="text-left">
                  <p className="font-medium">{tab.label}</p>
                  <p className={`text-xs ${activeTab === tab.id ? 'text-primary-foreground/80' : 'text-gray-500'}`}>
                    {tab.description}
                  </p>
                </div>
              </button>
            ))}
          </nav>
        </div>

        {/* Content Area */}
        <div className="flex-1">
          <div className="bg-white rounded-lg shadow p-6">
            {renderTabContent()}
            
            {/* Save Button - Hide for tabs with their own save logic */}
            {activeTab !== 'phone_numbers' && activeTab !== 'billing' && (
              <div className="mt-6 pt-6 border-t flex items-center justify-between">
                <div>
                  {savedTab === activeTab && (
                    <div className="flex items-center gap-2 text-accent">
                      <Check className="h-4 w-4" />
                      <span className="text-sm font-medium">Settings saved successfully</span>
                    </div>
                  )}
                </div>
                <Button onClick={handleSave} disabled={saving}>
                  {saving ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-2" />
                      Save Changes
                    </>
                  )}
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <SettingsContent />
    </Suspense>
  )
}