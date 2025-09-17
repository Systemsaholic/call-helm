'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Progress } from '@/components/ui/progress'
import {
  Play,
  Pause,
  AlertCircle,
  Users,
  UserCheck,
  Clock,
  CheckCircle2,
  XCircle,
  Info,
  Upload,
  Settings,
  Calendar
} from 'lucide-react'
import { useCallList, useUpdateCallList, useAssignContacts, useCallListContacts } from '@/lib/hooks/useCallLists'
import { useAgents } from '@/lib/hooks/useAgents'
import { toast } from 'sonner'
import type { CallList, AssignmentStrategy } from '@/lib/hooks/useCallLists'

interface CampaignActivationProps {
  callListId: string
}

export function CampaignActivation({ callListId }: CampaignActivationProps) {
  const [showActivationDialog, setShowActivationDialog] = useState(false)
  const [showAssignmentDialog, setShowAssignmentDialog] = useState(false)
  const [assignmentStrategy, setAssignmentStrategy] = useState<AssignmentStrategy['strategy']>('round_robin')
  const [selectedAgents, setSelectedAgents] = useState<string[]>([])
  const [maxContactsPerAgent, setMaxContactsPerAgent] = useState<number>(50)
  const [confirmActivation, setConfirmActivation] = useState(false)

  const { data: callList, isLoading: loadingCallList } = useCallList(callListId)
  const { data: contacts, isLoading: loadingContacts } = useCallListContacts(callListId)
  const { data: agents, isLoading: loadingAgents } = useAgents({ status: 'active' })
  const updateCallList = useUpdateCallList()
  const assignContacts = useAssignContacts()

  const unassignedContacts = contacts?.filter(c => c.status === 'pending') || []
  const assignedContacts = contacts?.filter(c => c.status === 'assigned' || c.status === 'in_progress') || []
  const completedContacts = contacts?.filter(c => c.status === 'completed') || []

  const canActivate = callList && (
    callList.status === 'draft' || 
    callList.status === 'paused'
  ) && assignedContacts.length > 0

  const handleActivateCampaign = async () => {
    if (!callList) return

    try {
      await updateCallList.mutateAsync({
        id: callListId,
        updates: { status: 'active' }
      })
      setShowActivationDialog(false)
      toast.success('Campaign activated successfully')
    } catch (error) {
      toast.error('Failed to activate campaign')
    }
  }

  const handlePauseCampaign = async () => {
    if (!callList) return

    try {
      await updateCallList.mutateAsync({
        id: callListId,
        updates: { status: 'paused' }
      })
      toast.success('Campaign paused')
    } catch (error) {
      toast.error('Failed to pause campaign')
    }
  }

  const handleAssignContacts = async () => {
    if (selectedAgents.length === 0) {
      toast.error('Please select at least one agent')
      return
    }

    try {
      await assignContacts.mutateAsync({
        callListId,
        strategy: {
          strategy: assignmentStrategy,
          agentIds: selectedAgents,
          maxContactsPerAgent: assignmentStrategy === 'load_based' ? maxContactsPerAgent : undefined
        }
      })
      setShowAssignmentDialog(false)
      toast.success('Contacts assigned successfully')
    } catch (error: any) {
      toast.error(error.message || 'Failed to assign contacts')
    }
  }

  if (loadingCallList || loadingContacts) {
    return <div>Loading...</div>
  }

  if (!callList) {
    return <div>Campaign not found</div>
  }

  const totalContacts = contacts?.length || 0
  const assignmentProgress = totalContacts > 0 
    ? Math.round((assignedContacts.length / totalContacts) * 100)
    : 0
  const completionProgress = totalContacts > 0
    ? Math.round((completedContacts.length / totalContacts) * 100)
    : 0

  return (
    <div className="space-y-6">
      {/* Campaign Status Card */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Campaign Status</h3>
            <p className="text-sm text-gray-600 mt-1">{callList.name}</p>
          </div>
          <Badge 
            variant={
              callList.status === 'active' ? 'default' :
              callList.status === 'paused' ? 'secondary' :
              callList.status === 'completed' ? 'default' :
              'outline'
            }
            className={
              callList.status === 'active' ? 'bg-accent/20 text-accent' :
              callList.status === 'completed' ? 'bg-primary/20 text-primary' :
              ''
            }
          >
            {callList.status.charAt(0).toUpperCase() + callList.status.slice(1)}
          </Badge>
        </div>

        {/* Progress Bars */}
        <div className="space-y-4">
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-gray-600">Contact Assignment</span>
              <span className="font-medium">{assignmentProgress}%</span>
            </div>
            <Progress value={assignmentProgress} className="h-2" />
            <p className="text-xs text-gray-600 mt-1">
              {assignedContacts.length} of {totalContacts} contacts assigned
            </p>
          </div>

          <div>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-gray-600">Campaign Completion</span>
              <span className="font-medium">{completionProgress}%</span>
            </div>
            <Progress value={completionProgress} className="h-2" />
            <p className="text-xs text-gray-600 mt-1">
              {completedContacts.length} of {totalContacts} contacts completed
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3 mt-6">
          {callList.status === 'draft' && (
            <>
              {unassignedContacts.length > 0 && (
                <Button
                  variant="outline"
                  onClick={() => setShowAssignmentDialog(true)}
                  className="flex-1"
                >
                  <Users className="h-4 w-4 mr-2" />
                  Assign Contacts ({unassignedContacts.length})
                </Button>
              )}
              <Button
                onClick={() => setShowActivationDialog(true)}
                disabled={!canActivate}
                className="flex-1"
              >
                <Play className="h-4 w-4 mr-2" />
                Activate Campaign
              </Button>
            </>
          )}

          {callList.status === 'active' && (
            <Button
              variant="outline"
              onClick={handlePauseCampaign}
              className="flex-1"
            >
              <Pause className="h-4 w-4 mr-2" />
              Pause Campaign
            </Button>
          )}

          {callList.status === 'paused' && (
            <>
              {unassignedContacts.length > 0 && (
                <Button
                  variant="outline"
                  onClick={() => setShowAssignmentDialog(true)}
                  className="flex-1"
                >
                  <Users className="h-4 w-4 mr-2" />
                  Assign More Contacts
                </Button>
              )}
              <Button
                onClick={() => setShowActivationDialog(true)}
                className="flex-1"
              >
                <Play className="h-4 w-4 mr-2" />
                Resume Campaign
              </Button>
            </>
          )}
        </div>

        {/* Warnings */}
        {callList.status === 'draft' && assignedContacts.length === 0 && (
          <Alert className="mt-4 border-amber-200 bg-amber-50">
            <AlertCircle className="h-4 w-4 text-amber-600" />
            <AlertDescription className="text-amber-800">
              You must assign contacts to agents before activating this campaign.
            </AlertDescription>
          </Alert>
        )}
      </div>

      {/* Campaign Settings Summary */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Campaign Settings</h3>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-gray-600">Distribution Strategy:</span>
            <span className="ml-2 font-medium">
              {callList.distribution_strategy.replace('_', ' ').charAt(0).toUpperCase() + 
               callList.distribution_strategy.replace('_', ' ').slice(1)}
            </span>
          </div>
          <div>
            <span className="text-gray-600">Max Attempts:</span>
            <span className="ml-2 font-medium">{callList.max_attempts_per_contact}</span>
          </div>
          <div>
            <span className="text-gray-600">Calling Hours:</span>
            <span className="ml-2 font-medium">
              {callList.calling_hours_start || '09:00'} - {callList.calling_hours_end || '17:00'}
            </span>
          </div>
          <div>
            <span className="text-gray-600">Allow Voicemail:</span>
            <span className="ml-2 font-medium">{callList.allow_voicemail ? 'Yes' : 'No'}</span>
          </div>
        </div>
      </div>

      {/* Activation Dialog */}
      <Dialog open={showActivationDialog} onOpenChange={setShowActivationDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {callList.status === 'paused' ? 'Resume Campaign' : 'Activate Campaign'}
            </DialogTitle>
            <DialogDescription>
              {callList.status === 'paused' 
                ? 'Resume this campaign to allow agents to continue making calls.'
                : 'Once activated, assigned agents will begin receiving contacts to call.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="flex items-center space-x-2">
              <UserCheck className="h-5 w-5 text-gray-600" />
              <span className="text-sm">{assignedContacts.length} contacts ready to call</span>
            </div>
            <div className="flex items-center space-x-2">
              <Users className="h-5 w-5 text-gray-600" />
              <span className="text-sm">
                {new Set(assignedContacts.map(c => c.assigned_to)).size} agents assigned
              </span>
            </div>
            <div className="flex items-center space-x-2">
              <Clock className="h-5 w-5 text-gray-600" />
              <span className="text-sm">
                Calling hours: {callList.calling_hours_start || '09:00'} - {callList.calling_hours_end || '17:00'}
              </span>
            </div>

            <Alert className="bg-primary/10 border-primary/20">
              <Info className="h-4 w-4 text-primary" />
              <AlertDescription className="text-gray-700">
                Agents will be notified and can start making calls immediately.
              </AlertDescription>
            </Alert>

            <div className="flex items-center space-x-2">
              <Checkbox 
                id="confirm" 
                checked={confirmActivation}
                onCheckedChange={(checked) => setConfirmActivation(checked as boolean)}
              />
              <Label htmlFor="confirm" className="text-sm">
                I understand that agents will begin calling contacts
              </Label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowActivationDialog(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleActivateCampaign}
              disabled={!confirmActivation || updateCallList.isPending}
            >
              {updateCallList.isPending ? 'Activating...' : 'Activate Campaign'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assignment Dialog */}
      <Dialog open={showAssignmentDialog} onOpenChange={setShowAssignmentDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Assign Contacts to Agents</DialogTitle>
            <DialogDescription>
              Choose how to distribute {unassignedContacts.length} contacts among your agents.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Assignment Strategy */}
            <div>
              <Label className="text-base mb-3">Assignment Strategy</Label>
              <RadioGroup 
                value={assignmentStrategy} 
                onValueChange={(value) => setAssignmentStrategy(value as AssignmentStrategy['strategy'])}
              >
                <div className="space-y-3">
                  <div className="flex items-start space-x-2">
                    <RadioGroupItem value="round_robin" id="round_robin" />
                    <div className="grid gap-1">
                      <Label htmlFor="round_robin" className="font-normal">
                        Round Robin
                      </Label>
                      <p className="text-sm text-gray-600">
                        Distribute contacts evenly among selected agents
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start space-x-2">
                    <RadioGroupItem value="load_based" id="load_based" />
                    <div className="grid gap-1">
                      <Label htmlFor="load_based" className="font-normal">
                        Load Based
                      </Label>
                      <p className="text-sm text-gray-600">
                        Assign a specific number of contacts per agent
                      </p>
                    </div>
                  </div>
                </div>
              </RadioGroup>
            </div>

            {/* Max contacts per agent (for load-based) */}
            {assignmentStrategy === 'load_based' && (
              <div>
                <Label htmlFor="max-contacts">Max Contacts per Agent</Label>
                <Input
                  id="max-contacts"
                  type="number"
                  value={maxContactsPerAgent}
                  onChange={(e) => setMaxContactsPerAgent(parseInt(e.target.value))}
                  min={1}
                  max={unassignedContacts.length}
                  className="mt-1"
                />
              </div>
            )}

            {/* Agent Selection */}
            <div>
              <Label className="text-base mb-3">Select Agents</Label>
              <div className="border border-gray-200 rounded-lg max-h-48 overflow-y-auto">
                {loadingAgents ? (
                  <div className="p-4 text-center text-gray-600">Loading agents...</div>
                ) : agents && agents.length > 0 ? (
                  <div className="p-2">
                    {agents.map((agent) => (
                      <div key={agent.id} className="flex items-center space-x-2 p-2 hover:bg-accent/10 rounded">
                        <Checkbox
                          id={agent.id}
                          checked={selectedAgents.includes(agent.id)}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setSelectedAgents([...selectedAgents, agent.id])
                            } else {
                              setSelectedAgents(selectedAgents.filter(id => id !== agent.id))
                            }
                          }}
                        />
                        <Label 
                          htmlFor={agent.id} 
                          className="flex-1 font-normal cursor-pointer"
                        >
                          {agent.full_name} ({agent.email})
                        </Label>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-4 text-center text-gray-600">No active agents available</div>
                )}
              </div>
            </div>

            {/* Assignment Preview */}
            {selectedAgents.length > 0 && (
              <Alert className="bg-primary/10 border-primary/20">
                <Info className="h-4 w-4 text-primary" />
                <AlertDescription className="text-gray-700">
                  {assignmentStrategy === 'round_robin' 
                    ? `Each agent will receive approximately ${Math.ceil(unassignedContacts.length / selectedAgents.length)} contacts.`
                    : `Each agent will receive up to ${maxContactsPerAgent} contacts.`}
                </AlertDescription>
              </Alert>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAssignmentDialog(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleAssignContacts}
              disabled={selectedAgents.length === 0 || assignContacts.isPending}
            >
              {assignContacts.isPending ? 'Assigning...' : 'Assign Contacts'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}