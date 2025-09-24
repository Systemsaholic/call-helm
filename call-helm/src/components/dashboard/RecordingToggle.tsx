'use client'

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Mic, MicOff, Settings, Crown } from 'lucide-react'
import { useBilling } from '@/lib/hooks/useBilling'
import { useAuth } from '@/lib/hooks/useAuth'
import { useProfile } from '@/lib/hooks/useProfile'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'

export function RecordingToggle() {
  const { user } = useAuth()
  const { profile } = useProfile()
  const { limits } = useBilling()
  const [showSettings, setShowSettings] = useState(false)
  const supabase = createClient()
  const queryClient = useQueryClient()

  // Get organization ID from user metadata or profile
  const organizationId = user?.user_metadata?.organization_id || profile?.organization_id

  // Check user's role - only admins and org_admins can always toggle
  const userRole = user?.user_metadata?.role || 'agent'
  const isAdmin = userRole === 'admin' || userRole === 'org_admin'

  // Fetch organization settings to check if agents can toggle recording
  const { data: orgSettings } = useQuery({
    queryKey: ['org-recording-settings', organizationId],
    queryFn: async () => {
      if (!organizationId) return null
      
      const { data, error } = await supabase
        .from('organization_settings')
        .select('allow_agents_toggle_recording, auto_record_calls')
        .eq('organization_id', organizationId)
        .single()
      
      if (error) {
        console.error('Error fetching org recording settings:', error)
        return null
      }
      
      return data
    },
    enabled: !!organizationId,
  })

  // Fetch current recording preference
  const { data: recordingEnabled, isLoading } = useQuery({
    queryKey: ['recording-preference', user?.id],
    queryFn: async () => {
      if (!user?.id) return false
      
      const { data, error } = await supabase
        .from('user_profiles')
        .select('default_record_calls')
        .eq('id', user.id)
        .single()
      
      if (error && error.code !== 'PGRST116') {
        // PGRST116 is "no rows returned", which is fine
        console.error('Error fetching recording preference:', error)
        return false
      }
      
      return data?.default_record_calls || false
    },
    enabled: !!user?.id,
  })

  // Update recording preference mutation
  const updateRecordingMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      if (!user?.id) throw new Error('No user ID')
      
      const { error } = await supabase
        .from('user_profiles')
        .update({
          default_record_calls: enabled,
          updated_at: new Date().toISOString()
        })
        .eq('id', user.id)
      
      if (error) throw error
      return enabled
    },
    onSuccess: (enabled) => {
      queryClient.invalidateQueries({ queryKey: ['recording-preference'] })
      toast.success(
        enabled 
          ? 'Call recording enabled - All new calls will be recorded' 
          : 'Call recording disabled'
      )
    },
    onError: (error) => {
      console.error('Failed to update recording preference:', error)
      toast.error('Failed to update recording preference')
    }
  })

  const handleToggleRecording = async (checked: boolean) => {
    await updateRecordingMutation.mutateAsync(checked)
  }

  // Check if user has Pro plan with recording feature
  const hasRecordingFeature = limits?.features?.call_recording_transcription === true
  
  // Determine if user can toggle recording
  const canToggleRecording = isAdmin || orgSettings?.allow_agents_toggle_recording === true

  // Don't render if no recording feature access
  if (!hasRecordingFeature) {
    return null
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-2">
        <div className="h-5 w-9 bg-gray-200 rounded-full animate-pulse" />
        <div className="h-4 w-16 bg-gray-200 rounded animate-pulse" />
      </div>
    )
  }

  return (
    <TooltipProvider>
      <Popover open={showSettings} onOpenChange={setShowSettings}>
        <div className="flex items-center gap-2">
          {/* Recording Status Indicator */}
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-2">
                <div className={`p-1 rounded-full transition-colors ${
                  recordingEnabled ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-400'
                }`}>
                  {recordingEnabled ? (
                    <Mic className="h-4 w-4" />
                  ) : (
                    <MicOff className="h-4 w-4" />
                  )}
                </div>
                
                <Switch
                  id="recording-toggle"
                  checked={recordingEnabled || false}
                  onCheckedChange={handleToggleRecording}
                  disabled={updateRecordingMutation.isPending || !canToggleRecording}
                />
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p className="text-sm">
                {!canToggleRecording 
                  ? 'Recording control is restricted to administrators'
                  : recordingEnabled 
                  ? 'Call recording is ON - All calls will be recorded' 
                  : 'Call recording is OFF'
                }
              </p>
              <div className="flex items-center gap-1 mt-1">
                <Crown className="h-3 w-3 text-amber-400" />
                <span className="text-xs text-amber-400">Pro Feature</span>
              </div>
            </TooltipContent>
          </Tooltip>

          {/* Settings Button */}
          <PopoverTrigger asChild>
            <Button variant="ghost" size="sm" className="p-1 h-8 w-8">
              <Settings className="h-4 w-4 text-gray-500" />
            </Button>
          </PopoverTrigger>
        </div>

        {/* Settings Popover */}
        <PopoverContent className="w-80" align="end">
          <div className="space-y-4">
            <div>
              <h3 className="font-medium text-sm">Call Recording Settings</h3>
              <p className="text-xs text-muted-foreground mt-1">
                Configure how calls are recorded and stored
              </p>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="auto-record" className="text-sm font-medium">
                    Auto-record calls
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Automatically record all outbound calls
                  </p>
                </div>
                <Switch
                  id="auto-record"
                  checked={recordingEnabled || false}
                  onCheckedChange={handleToggleRecording}
                  disabled={updateRecordingMutation.isPending || !canToggleRecording}
                />
              </div>

              {!canToggleRecording && !isAdmin && (
                <div className="p-3 bg-orange-50 rounded-lg border border-orange-200">
                  <p className="text-xs text-orange-700">
                    Recording controls are restricted to administrators. Contact your admin to change recording settings.
                  </p>
                </div>
              )}

              {recordingEnabled && (
                <div className="p-3 bg-amber-50 rounded-lg border border-amber-200">
                  <div className="flex items-start gap-2">
                    <Mic className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-amber-800">Recording Active</p>
                      <p className="text-xs text-amber-700">
                        All new outbound calls will be automatically recorded and transcribed. 
                        Recordings are securely stored and accessible in call history.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="border-t pt-3">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Pro Plan Feature</span>
                <Badge variant="secondary" className="text-xs">
                  <Crown className="h-3 w-3 mr-1" />
                  Pro
                </Badge>
              </div>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </TooltipProvider>
  )
}