'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import {
  ArrowLeft,
  Search,
  BookOpen,
  MessageCircle,
  Mail,
  Phone,
  ExternalLink,
  ChevronRight,
  FileText,
  Video,
  Users,
  Zap,
  HelpCircle,
  AlertCircle,
  CheckCircle,
  Clock,
  Shield,
  CreditCard,
  Settings
} from 'lucide-react'

interface FAQItem {
  question: string
  answer: string
  category: string
}

interface GuideItem {
  title: string
  description: string
  icon: React.ElementType
  href: string
  time: string
}

const faqItems: FAQItem[] = [
  {
    question: 'How do I add new agents to my team?',
    answer: 'Navigate to the Agents section in your dashboard and click "Invite Agent". Enter their email address and assign a role. They will receive an invitation to join your organization.',
    category: 'team'
  },
  {
    question: 'Can I import contacts from a CSV file?',
    answer: 'Yes! Go to the Contacts section and click the "Import" button. You can upload a CSV file with your contacts. Make sure your CSV has columns for name, phone number, and any other relevant information.',
    category: 'contacts'
  },
  {
    question: 'How does call recording work?',
    answer: 'Call recording is automatic when enabled in your Organization Settings. All recordings are stored securely and can be accessed from the call history. You can also download recordings for compliance purposes.',
    category: 'calling'
  },
  {
    question: 'What AI features are available?',
    answer: 'Call Helm uses AI for call transcription, sentiment analysis, and automated summaries. After each call, you\'ll receive insights about the conversation, including key topics discussed and action items.',
    category: 'ai'
  },
  {
    question: 'How do I change my billing plan?',
    answer: 'Go to Settings > Billing to view and change your plan. You can upgrade or downgrade at any time. Changes take effect at the start of your next billing cycle.',
    category: 'billing'
  },
  {
    question: 'Is my data secure?',
    answer: 'Yes, we use industry-standard encryption for all data transmission and storage. All call recordings and transcriptions are encrypted at rest. We are SOC 2 Type II compliant.',
    category: 'security'
  },
  {
    question: 'Can I integrate with my CRM?',
    answer: 'Yes, we support integrations with popular CRMs including Salesforce, HubSpot, and Pipedrive. You can set up integrations in Settings > Integrations.',
    category: 'integrations'
  },
  {
    question: 'How do I set up SMS messaging?',
    answer: 'SMS messaging requires connecting a provider like Twilio. Go to Settings > Integrations and follow the Twilio setup guide. Once connected, you can send SMS from the Messages section.',
    category: 'messaging'
  }
]

const guides: GuideItem[] = [
  {
    title: 'Getting Started Guide',
    description: 'Learn the basics of Call Helm and make your first call',
    icon: BookOpen,
    href: '#',
    time: '5 min read'
  },
  {
    title: 'Team Management',
    description: 'Add agents, set permissions, and manage your team',
    icon: Users,
    href: '#',
    time: '8 min read'
  },
  {
    title: 'Call List Best Practices',
    description: 'Organize and prioritize your calls effectively',
    icon: FileText,
    href: '#',
    time: '6 min read'
  },
  {
    title: 'Using AI Features',
    description: 'Leverage AI for better call insights and productivity',
    icon: Zap,
    href: '#',
    time: '10 min read'
  },
  {
    title: 'Video Tutorials',
    description: 'Watch step-by-step video guides',
    icon: Video,
    href: '#',
    time: 'Video library'
  },
  {
    title: 'API Documentation',
    description: 'Integrate Call Helm with your applications',
    icon: Settings,
    href: '#',
    time: 'Technical docs'
  }
]

export default function HelpPage() {
  const router = useRouter()
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>('all')

  const categories = [
    { id: 'all', label: 'All Topics' },
    { id: 'team', label: 'Team & Agents' },
    { id: 'contacts', label: 'Contacts' },
    { id: 'calling', label: 'Calling' },
    { id: 'messaging', label: 'Messaging' },
    { id: 'ai', label: 'AI Features' },
    { id: 'billing', label: 'Billing' },
    { id: 'security', label: 'Security' },
    { id: 'integrations', label: 'Integrations' }
  ]

  const filteredFAQs = faqItems.filter(item => {
    const matchesSearch = searchQuery === '' || 
      item.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.answer.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesCategory = selectedCategory === 'all' || item.category === selectedCategory
    return matchesSearch && matchesCategory
  })

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <button
                onClick={() => router.back()}
                className="text-gray-500 hover:text-gray-700"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              <h1 className="text-xl font-semibold text-gray-900">Help & Support</h1>
            </div>
            <Button
              onClick={() => router.push('/dashboard')}
              variant="outline"
            >
              Back to Dashboard
            </Button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Hero Section */}
        <div className="bg-gradient-to-r from-primary to-accent rounded-lg p-8 text-white mb-8">
          <h2 className="text-3xl font-bold mb-4">How can we help you?</h2>
          <p className="text-white/90 mb-6">
            Search our knowledge base or browse topics below
          </p>
          <div className="relative max-w-2xl">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search for help..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-3 rounded-lg text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-white"
            />
          </div>
        </div>

        {/* Quick Links */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <button className="bg-white rounded-lg p-6 text-left hover:shadow-lg transition-shadow">
            <div className="flex items-center gap-3 mb-3">
              <div className="h-10 w-10 bg-blue-100 rounded-lg flex items-center justify-center">
                <MessageCircle className="h-5 w-5 text-blue-600" />
              </div>
              <h3 className="font-semibold text-gray-900">Live Chat</h3>
            </div>
            <p className="text-sm text-gray-600 mb-3">
              Chat with our support team
            </p>
            <div className="flex items-center gap-2 text-sm text-green-600">
              <CheckCircle className="h-4 w-4" />
              <span>Available now</span>
            </div>
          </button>

          <button className="bg-white rounded-lg p-6 text-left hover:shadow-lg transition-shadow">
            <div className="flex items-center gap-3 mb-3">
              <div className="h-10 w-10 bg-purple-100 rounded-lg flex items-center justify-center">
                <Mail className="h-5 w-5 text-purple-600" />
              </div>
              <h3 className="font-semibold text-gray-900">Email Support</h3>
            </div>
            <p className="text-sm text-gray-600 mb-3">
              support@callhelm.com
            </p>
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Clock className="h-4 w-4" />
              <span>24-48 hour response</span>
            </div>
          </button>

          <button className="bg-white rounded-lg p-6 text-left hover:shadow-lg transition-shadow">
            <div className="flex items-center gap-3 mb-3">
              <div className="h-10 w-10 bg-green-100 rounded-lg flex items-center justify-center">
                <Phone className="h-5 w-5 text-green-600" />
              </div>
              <h3 className="font-semibold text-gray-900">Phone Support</h3>
            </div>
            <p className="text-sm text-gray-600 mb-3">
              1-800-CALLHELM
            </p>
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Clock className="h-4 w-4" />
              <span>Mon-Fri 9AM-6PM EST</span>
            </div>
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column - Guides */}
          <div className="lg:col-span-1">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Quick Start Guides</h3>
            <div className="space-y-3">
              {guides.map((guide, index) => (
                <a
                  key={index}
                  href={guide.href}
                  className="block bg-white rounded-lg p-4 hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start gap-3">
                    <div className="h-10 w-10 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
                      <guide.icon className="h-5 w-5 text-gray-600" />
                    </div>
                    <div className="flex-1">
                      <h4 className="font-medium text-gray-900 mb-1">{guide.title}</h4>
                      <p className="text-sm text-gray-600 mb-2">{guide.description}</p>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-500">{guide.time}</span>
                        <ChevronRight className="h-4 w-4 text-gray-400" />
                      </div>
                    </div>
                  </div>
                </a>
              ))}
            </div>

            {/* System Status */}
            <div className="mt-8 bg-white rounded-lg p-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-3">System Status</h3>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Call Service</span>
                  <div className="flex items-center gap-1">
                    <div className="h-2 w-2 bg-green-500 rounded-full"></div>
                    <span className="text-xs text-green-600">Operational</span>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">SMS Service</span>
                  <div className="flex items-center gap-1">
                    <div className="h-2 w-2 bg-green-500 rounded-full"></div>
                    <span className="text-xs text-green-600">Operational</span>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">AI Analysis</span>
                  <div className="flex items-center gap-1">
                    <div className="h-2 w-2 bg-green-500 rounded-full"></div>
                    <span className="text-xs text-green-600">Operational</span>
                  </div>
                </div>
              </div>
              <a href="#" className="text-sm text-primary hover:underline mt-3 inline-block">
                View full status page →
              </a>
            </div>
          </div>

          {/* Right Column - FAQs */}
          <div className="lg:col-span-2">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Frequently Asked Questions</h3>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="px-3 py-1 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              >
                {categories.map(cat => (
                  <option key={cat.id} value={cat.id}>{cat.label}</option>
                ))}
              </select>
            </div>

            <div className="space-y-4">
              {filteredFAQs.length > 0 ? (
                filteredFAQs.map((faq, index) => (
                  <details
                    key={index}
                    className="bg-white rounded-lg p-4 hover:shadow-md transition-shadow group"
                  >
                    <summary className="cursor-pointer list-none">
                      <div className="flex items-start gap-3">
                        <HelpCircle className="h-5 w-5 text-gray-400 mt-0.5" />
                        <div className="flex-1">
                          <h4 className="font-medium text-gray-900 group-open:text-primary">
                            {faq.question}
                          </h4>
                        </div>
                        <ChevronRight className="h-5 w-5 text-gray-400 transform group-open:rotate-90 transition-transform" />
                      </div>
                    </summary>
                    <div className="mt-3 pl-8 text-sm text-gray-600">
                      {faq.answer}
                    </div>
                  </details>
                ))
              ) : (
                <div className="bg-white rounded-lg p-8 text-center">
                  <AlertCircle className="h-12 w-12 text-gray-400 mx-auto mb-3" />
                  <h4 className="font-medium text-gray-900 mb-2">No results found</h4>
                  <p className="text-sm text-gray-600">
                    Try adjusting your search or browse all topics
                  </p>
                </div>
              )}
            </div>

            {/* Contact Support Card */}
            <div className="mt-8 bg-gradient-to-r from-primary to-accent rounded-lg p-6 text-white">
              <h3 className="text-xl font-semibold mb-2">Still need help?</h3>
              <p className="text-white/90 mb-4">
                Our support team is here to assist you with any questions or issues.
              </p>
              <div className="flex gap-3">
                <Button
                  variant="secondary"
                  className="bg-white text-primary hover:bg-gray-100"
                >
                  <MessageCircle className="h-4 w-4 mr-2" />
                  Start Live Chat
                </Button>
                <Button
                  variant="outline"
                  className="border-white text-white hover:bg-white/10"
                >
                  <Mail className="h-4 w-4 mr-2" />
                  Email Support
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}