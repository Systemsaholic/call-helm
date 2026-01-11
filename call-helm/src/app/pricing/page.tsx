import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { 
  ArrowRight, 
  Phone, 
  Users, 
  MessageSquare, 
  Smartphone, 
  Brain, 
  Mic, 
  Zap, 
  Crown,
  Check,
  X
} from 'lucide-react'
import { cn } from '@/lib/utils'

const plans = [
  {
    name: 'Pro Starter',
    description: 'Perfect for small teams getting started',
    price_monthly: 49,
    price_yearly: 490,
    badge_text: 'Most Popular',
    max_phone_numbers: 1,
    max_agents: 5,
    max_contacts: 1000,
    max_call_minutes: 500,
    max_sms_messages: 500,
    max_ai_tokens_per_month: 10000,
    max_transcription_minutes_per_month: 50,
    max_ai_analysis_per_month: 25,
    features: {
      phone_number_management: true,
      voice_calls: true,
      sms_messaging: true,
      call_recording: true,
      call_transcription: true,
      ai_analysis: true,
      sentiment_analysis: true,
      api_access: true,
      webhooks: true,
      white_label: false,
      priority_support: false,
    }
  },
  {
    name: 'Professional',
    description: 'Ideal for growing businesses',
    price_monthly: 99,
    price_yearly: 990,
    max_phone_numbers: 5,
    max_agents: 25,
    max_contacts: 10000,
    max_call_minutes: 2500,
    max_sms_messages: 2500,
    max_ai_tokens_per_month: 100000,
    max_transcription_minutes_per_month: 500,
    max_ai_analysis_per_month: 250,
    features: {
      phone_number_management: true,
      voice_calls: true,
      sms_messaging: true,
      call_recording: true,
      call_transcription: true,
      ai_analysis: true,
      sentiment_analysis: true,
      api_access: true,
      webhooks: true,
      white_label: false,
      priority_support: true,
    }
  },
  {
    name: 'Enterprise',
    description: 'Advanced features for large organizations',
    price_monthly: 299,
    price_yearly: 2990,
    max_phone_numbers: 9999,
    max_agents: 999999,
    max_contacts: 999999,
    max_call_minutes: 999999,
    max_sms_messages: 999999,
    max_ai_tokens_per_month: 999999,
    max_transcription_minutes_per_month: 999999,
    max_ai_analysis_per_month: 999999,
    features: {
      phone_number_management: true,
      voice_calls: true,
      sms_messaging: true,
      call_recording: true,
      call_transcription: true,
      ai_analysis: true,
      sentiment_analysis: true,
      api_access: true,
      webhooks: true,
      white_label: true,
      priority_support: true,
    }
  }
]

export default function PricingPage() {
  return (
    <div className="min-h-screen">
      {/* Navigation */}
      <nav className="border-b bg-white/50 backdrop-blur-sm fixed top-0 w-full z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-8">
              <Link href="/" className="flex items-center space-x-2">
                <Phone className="h-8 w-8 text-primary" />
                <span className="text-2xl font-bold text-primary">Call Helm</span>
              </Link>
              <div className="hidden md:flex space-x-6">
                <Link href="/features" className="text-gray-600 hover:text-primary">Features</Link>
                <Link href="/pricing" className="text-gray-600 hover:text-primary">Pricing</Link>
                <Link href="/resources" className="text-gray-600 hover:text-primary">Resources</Link>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <Link href="/auth/login">
                <Button variant="ghost">Log in</Button>
              </Link>
              <Link href="/auth/signup">
                <Button variant="accent" className="font-semibold">
                  Start Free Trial
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-20 bg-gradient-to-br from-primary/5 to-accent/5">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h1 className="text-5xl font-bold text-gray-900 mb-6">
              Simple, transparent pricing
            </h1>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto mb-8">
              Choose the perfect plan for your call center needs. Start with a 14-day free trial, 
              then select the plan that scales with your business.
            </p>
            <div className="flex items-center justify-center gap-2 mb-4">
              <span className="text-sm text-gray-600">All plans include:</span>
              <div className="flex items-center gap-4 text-sm text-gray-600">
                <span className="flex items-center gap-1">
                  <Check className="h-4 w-4 text-green-500" />
                  14-day free trial
                </span>
                <span className="flex items-center gap-1">
                  <Check className="h-4 w-4 text-green-500" />
                  No setup fees
                </span>
                <span className="flex items-center gap-1">
                  <Check className="h-4 w-4 text-green-500" />
                  Cancel anytime
                </span>
              </div>
            </div>
          </div>

          {/* Pricing Cards */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {plans.map((plan, index) => {
              const isPopular = plan.badge_text === 'Most Popular'
              const savings = Math.round(((plan.price_monthly * 12 - plan.price_yearly) / (plan.price_monthly * 12)) * 100)
              
              return (
                <Card 
                  key={plan.name}
                  className={cn(
                    "relative flex flex-col h-full",
                    isPopular && "border-primary ring-2 ring-primary/20 scale-105"
                  )}
                >
                  {plan.badge_text && (
                    <Badge className="absolute -top-2 -right-2 z-10">{plan.badge_text}</Badge>
                  )}
                  <CardHeader className="pb-4">
                    <CardTitle className="text-2xl">{plan.name}</CardTitle>
                    <CardDescription className="min-h-[3.5rem] sm:min-h-[3rem] flex items-start">{plan.description}</CardDescription>
                    <div className="pt-4">
                      <div className="text-4xl font-bold">
                        ${plan.price_monthly}
                      </div>
                      <div className="text-sm text-gray-500">
                        per month
                      </div>
                      {savings > 0 && (
                        <div className="mt-2">
                          <Badge variant="secondary">Save {savings}% with annual</Badge>
                        </div>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="flex-1 flex flex-col">
                    <ul className="space-y-3 mb-6 flex-1">
                      {/* Phone Numbers - Fixed height block */}
                      <div className="min-h-[3rem]">
                        <li className="flex items-center gap-3 text-sm">
                          <Smartphone className="h-4 w-4 text-blue-500 flex-shrink-0" />
                          <span className="font-medium">
                            {plan.max_phone_numbers >= 999 
                              ? '100+ Numbers (fair use)' 
                              : plan.max_phone_numbers === 1 
                              ? '1 Number included' 
                              : `${plan.max_phone_numbers} Numbers included`
                            }
                          </span>
                        </li>
                        {plan.max_phone_numbers < 999 && (
                          <li className="flex items-center gap-3 text-xs text-gray-500 pl-7">
                            <span>+$2.50/mo per additional</span>
                          </li>
                        )}
                      </div>
                      
                      {/* Agents */}
                      <li className="flex items-center gap-3 text-sm">
                        <Users className="h-4 w-4 text-green-500 flex-shrink-0" />
                        <span>{plan.max_agents >= 999999 ? 'Unlimited agents' : `${plan.max_agents} agents`}</span>
                      </li>
                      
                      {/* Call Minutes */}
                      <li className="flex items-center gap-3 text-sm">
                        <Phone className="h-4 w-4 text-green-500 flex-shrink-0" />
                        <span>{plan.max_call_minutes >= 999999 ? 'Unlimited minutes' : `${plan.max_call_minutes.toLocaleString()} minutes/mo`}</span>
                      </li>
                      
                      {/* SMS */}
                      <li className="flex items-center gap-3 text-sm">
                        <MessageSquare className="h-4 w-4 text-green-500 flex-shrink-0" />
                        <span>{plan.max_sms_messages >= 999999 ? 'Unlimited SMS' : `${plan.max_sms_messages.toLocaleString()} SMS/mo`}</span>
                      </li>
                      
                      {/* AI Services - Fixed height block */}
                      <div className="min-h-[4.5rem]">
                        <li className="flex items-center gap-3 text-sm">
                          <Brain className="h-4 w-4 text-purple-500 flex-shrink-0" />
                          <span>{plan.max_ai_tokens_per_month >= 999999 ? 'Unlimited AI' : `${plan.max_ai_tokens_per_month.toLocaleString()} AI tokens`}</span>
                        </li>
                        <li className="flex items-center gap-3 text-sm">
                          <Mic className="h-4 w-4 text-blue-500 flex-shrink-0" />
                          <span>{plan.max_transcription_minutes_per_month >= 999999 ? 'Unlimited transcription' : `${plan.max_transcription_minutes_per_month} min transcription`}</span>
                        </li>
                        <li className="flex items-center gap-3 text-sm">
                          <Zap className="h-4 w-4 text-amber-500 flex-shrink-0" />
                          <span>{plan.max_ai_analysis_per_month >= 999999 ? 'Unlimited analysis' : `${plan.max_ai_analysis_per_month} analyses`}</span>
                        </li>
                      </div>
                      
                      {/* Advanced Features */}
                      <li className="flex items-center gap-3 text-sm">
                        {plan.features?.white_label ? (
                          <>
                            <Crown className="h-4 w-4 text-amber-500 flex-shrink-0" />
                            <span>White Label</span>
                          </>
                        ) : (
                          <>
                            <X className="h-4 w-4 text-gray-300 flex-shrink-0" />
                            <span className="text-gray-400">No White Label</span>
                          </>
                        )}
                      </li>
                      
                      <li className="flex items-center gap-3 text-sm">
                        {plan.features?.priority_support ? (
                          <>
                            <Check className="h-4 w-4 text-green-500 flex-shrink-0" />
                            <span>Priority Support</span>
                          </>
                        ) : (
                          <>
                            <X className="h-4 w-4 text-gray-300 flex-shrink-0" />
                            <span className="text-gray-400">Standard Support</span>
                          </>
                        )}
                      </li>
                    </ul>
                    {plan.name === 'Enterprise' ? (
                      <Link href="/contact" className="w-full">
                        <Button 
                          className="w-full" 
                          variant="default"
                          size="lg"
                        >
                          Contact Sales
                          <ArrowRight className="ml-2 h-4 w-4" />
                        </Button>
                      </Link>
                    ) : (
                      <Link href="/auth/signup" className="w-full">
                        <Button 
                          className="w-full" 
                          variant={isPopular ? "default" : "outline"}
                          size="lg"
                        >
                          Start Free Trial
                          <ArrowRight className="ml-2 h-4 w-4" />
                        </Button>
                      </Link>
                    )}
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </div>
      </section>

      {/* Additional Pricing Info */}
      <section className="py-20 bg-white">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl font-bold text-center mb-12">Everything you need to succeed</h2>
            <div className="grid md:grid-cols-2 gap-8">
              <div>
                <h3 className="text-xl font-semibold mb-4">✨ AI-Powered Features</h3>
                <ul className="space-y-2 text-gray-600">
                  <li>• Automatic call transcription with speaker diarization</li>
                  <li>• Sentiment analysis and mood detection</li>
                  <li>• AI-powered call summaries and insights</li>
                  <li>• Smart action item extraction</li>
                  <li>• Call quality scoring and coaching recommendations</li>
                </ul>
              </div>
              <div>
                <h3 className="text-xl font-semibold mb-4">📞 Communication Tools</h3>
                <ul className="space-y-2 text-gray-600">
                  <li>• Phone number provisioning and porting</li>
                  <li>• Call forwarding and routing</li>
                  <li>• SMS messaging and campaigns</li>
                  <li>• Voicemail and call recording</li>
                  <li>• Real-time call monitoring</li>
                </ul>
              </div>
              <div>
                <h3 className="text-xl font-semibold mb-4">👥 Team Management</h3>
                <ul className="space-y-2 text-gray-600">
                  <li>• Agent performance tracking</li>
                  <li>• Contact and lead management</li>
                  <li>• Campaign management tools</li>
                  <li>• Role-based permissions</li>
                  <li>• Team collaboration features</li>
                </ul>
              </div>
              <div>
                <h3 className="text-xl font-semibold mb-4">🔧 Integration & APIs</h3>
                <ul className="space-y-2 text-gray-600">
                  <li>• RESTful API with comprehensive documentation</li>
                  <li>• Webhook support for real-time events</li>
                  <li>• CRM integrations (Salesforce, HubSpot, etc.)</li>
                  <li>• Zapier and automation support</li>
                  <li>• Custom integrations and white-labeling</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-20 bg-gray-50">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-3xl font-bold text-center mb-12">Frequently Asked Questions</h2>
            <div className="space-y-8">
              <div>
                <h3 className="text-lg font-semibold mb-2">How does the phone number pricing work?</h3>
                <p className="text-gray-600">
                  Each plan includes a set number of phone numbers. Pro Starter includes 1 number, 
                  Professional includes 5 numbers, and Enterprise includes 100+ numbers with fair use policy. 
                  Additional numbers are $2.50/month each for Pro Starter and Professional plans.
                </p>
              </div>
              <div>
                <h3 className="text-lg font-semibold mb-2">What happens if I exceed my AI usage limits?</h3>
                <p className="text-gray-600">
                  We'll notify you when you're approaching your limits. If you exceed them, you can upgrade 
                  your plan or purchase additional AI credits. Your service won't be interrupted, but 
                  additional usage will be charged based on our overage rates.
                </p>
              </div>
              <div>
                <h3 className="text-lg font-semibold mb-2">Can I change plans at any time?</h3>
                <p className="text-gray-600">
                  Yes! You can upgrade or downgrade your plan at any time. Upgrades take effect immediately, 
                  and downgrades take effect at your next billing cycle. We'll prorate any changes fairly.
                </p>
              </div>
              <div>
                <h3 className="text-lg font-semibold mb-2">What's included in the 14-day free trial?</h3>
                <p className="text-gray-600">
                  Your free trial includes full access to all features in the Pro Starter plan. 
                  No credit card required to start. After your trial, you can choose any plan or 
                  cancel at any time.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-primary text-white">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-4xl font-bold mb-4">
            Ready to transform your call center?
          </h2>
          <p className="text-xl mb-8 opacity-90">
            Start your free trial today and see the difference AI-powered calling can make
          </p>
          <Link href="/auth/signup">
            <Button size="lg" variant="accent" className="font-semibold">
              Start Your Free Trial
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          </Link>
          <p className="mt-4 text-sm opacity-75">
            No credit card required • 14-day free trial • Cancel anytime
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-50 border-t py-12">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-4 gap-8">
            <div>
              <div className="flex items-center space-x-2 mb-4">
                <Phone className="h-6 w-6 text-primary" />
                <span className="text-xl font-bold text-primary">Call Helm</span>
              </div>
              <p className="text-gray-600">
                AI-powered call center management platform
              </p>
            </div>
            <div>
              <h3 className="font-semibold mb-4">Product</h3>
              <ul className="space-y-2">
                <li><Link href="/features" className="text-gray-600 hover:text-primary">Features</Link></li>
                <li><Link href="/pricing" className="text-gray-600 hover:text-primary">Pricing</Link></li>
                <li><Link href="/integrations" className="text-gray-600 hover:text-primary">Integrations</Link></li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold mb-4">Company</h3>
              <ul className="space-y-2">
                <li><Link href="/about" className="text-gray-600 hover:text-primary">About</Link></li>
                <li><Link href="/blog" className="text-gray-600 hover:text-primary">Blog</Link></li>
                <li><Link href="/careers" className="text-gray-600 hover:text-primary">Careers</Link></li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold mb-4">Support</h3>
              <ul className="space-y-2">
                <li><Link href="/help" className="text-gray-600 hover:text-primary">Help Center</Link></li>
                <li><Link href="/contact" className="text-gray-600 hover:text-primary">Contact</Link></li>
                <li><Link href="/status" className="text-gray-600 hover:text-primary">Status</Link></li>
              </ul>
            </div>
          </div>
          <div className="border-t mt-8 pt-8 text-center text-gray-600">
            <p>&copy; 2025 Call Helm. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  )
}