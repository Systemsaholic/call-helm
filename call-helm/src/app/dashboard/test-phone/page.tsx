'use client'

import { useState } from 'react'
import { usePhoneNumbers } from '@/lib/hooks/usePhoneNumbers'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Phone, CheckCircle, AlertCircle, Loader2, RefreshCw } from 'lucide-react'

export default function TestPhonePage() {
  const {
    phoneNumbers,
    voiceIntegration,
    loading,
    error,
    refetch
  } = usePhoneNumbers()

  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<any>(null)

  const testPhoneSystem = async () => {
    setTesting(true)
    setTestResult(null)

    try {
      // Test voice setup endpoint
      const voiceResponse = await fetch('/api/voice/setup')
      const voiceData = await voiceResponse.json()

      // Test phone numbers endpoint
      const phoneResponse = await fetch('/api/phone-numbers')
      const phoneData = await phoneResponse.json()

      setTestResult({
        success: true,
        voiceConfigured: voiceData.configured,
        voiceActive: voiceData.isActive,
        phoneNumbersCount: phoneData.phoneNumbers?.length || 0,
        primaryNumber: phoneData.phoneNumbers?.find((p: any) => p.is_primary)?.number || 'None',
        integration: voiceIntegration
      })
    } catch (err) {
      setTestResult({
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error'
      })
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="px-6 lg:px-8 py-6 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Phone System Test</h1>
        <p className="text-gray-600">Test and verify your phone number configuration</p>
      </div>

      <div className="grid gap-6">
        {/* Voice Integration Status */}
        <Card>
          <CardHeader>
            <CardTitle>Voice Integration Status</CardTitle>
            <CardDescription>Current configuration state</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading configuration...
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Provider Status:</span>
                  {voiceIntegration?.is_active ? (
                    <Badge className="bg-accent/20 text-accent">
                      <CheckCircle className="h-3 w-3 mr-1" />
                      Connected
                    </Badge>
                  ) : (
                    <Badge variant="outline">Not Configured</Badge>
                  )}
                </div>
                {voiceIntegration && (
                  <>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">App ID:</span>
                      <span className="text-sm text-gray-600">{voiceIntegration.app_id || 'Not set'}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Recording Enabled:</span>
                      <span className="text-sm text-gray-600">{voiceIntegration.recording_enabled ? 'Yes' : 'No'}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Voicemail Enabled:</span>
                      <span className="text-sm text-gray-600">{voiceIntegration.voicemail_enabled ? 'Yes' : 'No'}</span>
                    </div>
                  </>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Phone Numbers */}
        <Card>
          <CardHeader>
            <CardTitle>Configured Phone Numbers</CardTitle>
            <CardDescription>Your organization's phone numbers</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading phone numbers...
              </div>
            ) : phoneNumbers.length === 0 ? (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  No phone numbers configured. Go to Settings → Phone Numbers to add one.
                </AlertDescription>
              </Alert>
            ) : (
              <div className="space-y-3">
                {phoneNumbers.map((number) => (
                  <div key={number.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center gap-3">
                      <Phone className="h-4 w-4 text-gray-600" />
                      <div>
                        <p className="font-medium">{number.number}</p>
                        <p className="text-sm text-gray-600">{number.friendly_name}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {number.is_primary && (
                        <Badge className="bg-primary/20 text-primary">Primary</Badge>
                      )}
                      <Badge variant={number.status === 'active' ? 'default' : 'outline'}>
                        {number.status}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Test Results */}
        {testResult && (
          <Card>
            <CardHeader>
              <CardTitle>Test Results</CardTitle>
            </CardHeader>
            <CardContent>
              {testResult.success ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-green-600">
                    <CheckCircle className="h-5 w-5" />
                    <span className="font-medium">Phone system is configured correctly</span>
                  </div>
                  <div className="pl-7 space-y-1 text-sm">
                    <p>Voice configured: {testResult.voiceConfigured ? 'Yes' : 'No'}</p>
                    <p>Voice active: {testResult.voiceActive ? 'Yes' : 'No'}</p>
                    <p>Phone numbers: {testResult.phoneNumbersCount}</p>
                    <p>Primary number: {testResult.primaryNumber}</p>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-2 text-red-600">
                  <AlertCircle className="h-5 w-5 mt-0.5" />
                  <div>
                    <p className="font-medium">Test failed</p>
                    <p className="text-sm">{testResult.error}</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <Button onClick={testPhoneSystem} disabled={testing}>
            {testing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Testing...
              </>
            ) : (
              <>
                <Phone className="h-4 w-4 mr-2" />
                Test Phone System
              </>
            )}
          </Button>
          <Button variant="outline" onClick={refetch} disabled={loading}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>

        {/* Error Display */}
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </div>
    </div>
  )
}