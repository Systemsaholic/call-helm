'use client'

import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { 
  Users, 
  UserPlus, 
  AlertCircle,
  Search,
  Filter,
  Shuffle,
  Target,
  BarChart3
} from 'lucide-react'
import { useAssignContacts, type CallList, type AssignmentStrategy } from '@/lib/hooks/useCallLists'
import { useOrganizationMembers } from '@/lib/hooks/useAuth'

interface AssignContactsModalProps {
  callList: CallList
  open: boolean
  onOpenChange: (open: boolean) => void
  selectedContactIds?: string[]
}

export function AssignContactsModal({ 
  callList, 
  open, 
  onOpenChange,
  selectedContactIds = []
}: AssignContactsModalProps) {
  const assignContacts = useAssignContacts()
  const { data: members } = useOrganizationMembers()
  
  const [strategy, setStrategy] = useState<AssignmentStrategy['strategy']>('manual')
  const [selectedAgents, setSelectedAgents] = useState<string[]>([])
  const [maxPerAgent, setMaxPerAgent] = useState<number>(50)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterRole, setFilterRole] = useState<string>('all')

  const agents = members?.filter(m => 
    ['agent', 'team_lead'].includes(m.role) &&
    m.status === 'active'
  ) || []

  const filteredAgents = agents.filter(agent => {
    const matchesSearch = agent.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         agent.email.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesRole = filterRole === 'all' || agent.role === filterRole
    return matchesSearch && matchesRole
  })

  useEffect(() => {
    // Reset selections when modal opens
    if (open) {
      setSelectedAgents([])
      setStrategy('manual')
      setMaxPerAgent(50)
    }
  }, [open])

  const handleSubmit = () => {
    if (selectedAgents.length === 0) {
      return
    }

    const assignmentStrategy: AssignmentStrategy = {
      strategy,
      agentIds: selectedAgents,
      maxContactsPerAgent: maxPerAgent,
    }

    // Convert contactIds and agentIds to assignments based on strategy
    const assignments = strategy === 'manual' && selectedContactIds.length > 0
      ? selectedContactIds.map((contactId, index) => ({
          contactId,
          agentId: selectedAgents[index % selectedAgents.length]
        }))
      : undefined

    assignContacts.mutate(
      {
        callListId: callList.id,
        assignments,
        strategy: assignments ? undefined : assignmentStrategy,
      },
      {
        onSuccess: () => {
          onOpenChange(false)
        },
      }
    )
  }

  const toggleAgent = (agentId: string) => {
    setSelectedAgents(prev =>
      prev.includes(agentId)
        ? prev.filter(id => id !== agentId)
        : [...prev, agentId]
    )
  }

  const selectAllAgents = () => {
    setSelectedAgents(filteredAgents.map(a => a.id))
  }

  const clearSelection = () => {
    setSelectedAgents([])
  }

  const getStrategyDescription = () => {
    switch (strategy) {
      case 'manual':
        return 'Contacts will be assigned to specific agents you select'
      case 'round_robin':
        return 'Contacts will be distributed evenly among selected agents in rotation'
      case 'load_based':
        return 'Contacts will be assigned based on current agent workload'
      case 'skill_based':
        return 'Contacts will be matched to agents based on skills and tags'
      default:
        return ''
    }
  }

  const calculateDistribution = () => {
    if (selectedAgents.length === 0) return null
    
    const totalContacts = selectedContactIds.length || ((callList.total_contacts || 0) - (callList.assigned_contacts || 0))
    const perAgent = Math.ceil(totalContacts / selectedAgents.length)
    const capped = Math.min(perAgent, maxPerAgent)
    
    return {
      total: totalContacts,
      perAgent: capped,
      agents: selectedAgents.length,
      overflow: perAgent > maxPerAgent
    }
  }

  const distribution = calculateDistribution()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Assign Contacts to Agents</DialogTitle>
          <DialogDescription>
            Select agents and distribution strategy for {selectedContactIds.length || 'unassigned'} contacts
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Strategy Selection */}
          <div className="space-y-2">
            <Label>Assignment Strategy</Label>
            <Select
              value={strategy}
              onValueChange={(value: AssignmentStrategy['strategy']) => setStrategy(value)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="manual">
                  <div className="flex items-center gap-2">
                    <UserPlus className="h-4 w-4" />
                    Manual Assignment
                  </div>
                </SelectItem>
                <SelectItem value="round_robin">
                  <div className="flex items-center gap-2">
                    <Shuffle className="h-4 w-4" />
                    Round Robin
                  </div>
                </SelectItem>
                <SelectItem value="load_based">
                  <div className="flex items-center gap-2">
                    <BarChart3 className="h-4 w-4" />
                    Load Based
                  </div>
                </SelectItem>
                <SelectItem value="skill_based">
                  <div className="flex items-center gap-2">
                    <Target className="h-4 w-4" />
                    Skill Based
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {getStrategyDescription()}
            </p>
          </div>

          {/* Max per Agent */}
          <div className="space-y-2">
            <Label htmlFor="max-per-agent">Maximum Contacts per Agent</Label>
            <Input
              id="max-per-agent"
              type="number"
              min="1"
              max="1000"
              value={maxPerAgent}
              onChange={(e) => setMaxPerAgent(parseInt(e.target.value) || 50)}
            />
            <p className="text-xs text-muted-foreground">
              Limit the number of contacts assigned to each agent
            </p>
          </div>

          {/* Agent Selection */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Select Agents ({selectedAgents.length} selected)</Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={selectAllAgents}
                >
                  Select All
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={clearSelection}
                >
                  Clear
                </Button>
              </div>
            </div>

            {/* Search and Filter */}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search agents..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8"
                />
              </div>
              <Select value={filterRole} onValueChange={setFilterRole}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Roles</SelectItem>
                  <SelectItem value="agent">Agents</SelectItem>
                  <SelectItem value="team_lead">Team Leads</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Agent List */}
            <div className="border rounded-lg max-h-[300px] overflow-y-auto">
              {filteredAgents.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">
                  <Users className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>No agents found</p>
                </div>
              ) : (
                <div className="divide-y">
                  {filteredAgents.map((agent) => (
                    <div
                      key={agent.id}
                      className="flex items-center justify-between p-3 hover:bg-muted/50"
                    >
                      <div className="flex items-center gap-3">
                        <Checkbox
                          checked={selectedAgents.includes(agent.id)}
                          onCheckedChange={() => toggleAgent(agent.id)}
                        />
                        <div>
                          <p className="font-medium">{agent.full_name}</p>
                          <p className="text-sm text-muted-foreground">{agent.email}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{agent.role}</Badge>
                        {agent.current_workload && (
                          <Badge variant="secondary">
                            {agent.current_workload} active
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Distribution Preview */}
          {distribution && selectedAgents.length > 0 && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                <strong>Distribution Preview:</strong> {distribution.total} contacts will be assigned to {distribution.agents} agents 
                ({distribution.perAgent} contacts per agent).
                {distribution.overflow && (
                  <span className="text-yellow-600">
                    {' '}Some contacts may remain unassigned due to the per-agent limit.
                  </span>
                )}
              </AlertDescription>
            </Alert>
          )}

          {selectedAgents.length === 0 && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Please select at least one agent to assign contacts to.
              </AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button 
            onClick={handleSubmit} 
            disabled={selectedAgents.length === 0 || assignContacts.isPending}
          >
            {assignContacts.isPending ? 'Assigning...' : 'Assign Contacts'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}