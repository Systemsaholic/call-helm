'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useSendInvitations, useAgents } from '@/lib/hooks/useAgents'
import { toast } from 'sonner'

export default function TestInvitePage() {
  const { data: agents = [] } = useAgents()
  const sendInvitationsMutation = useSendInvitations()
  const [selectedAgentId, setSelectedAgentId] = useState<string>('')

  const pendingAgents = agents.filter(a => 
    a.status === 'pending_invitation' || a.status === 'invited'
  )

  const handleTestInvite = async () => {
    if (!selectedAgentId) {
      toast.error('Please select an agent')
      return
    }

    console.log('Testing invitation for agent:', selectedAgentId)
    
    try {
      const result = await sendInvitationsMutation.mutateAsync([selectedAgentId])
      console.log('Invitation result:', result)
      toast.success('Invitation sent!')
    } catch (error) {
      console.error('Invitation error:', error)
      toast.error('Failed to send invitation')
    }
  }

  return (
    <div className="px-6 lg:px-8 py-6 max-w-7xl mx-auto">
      <Card>
        <CardHeader>
          <CardTitle>Test Invitation System</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">
              Select Agent to Invite:
            </label>
            <select 
              className="w-full p-2 border rounded"
              value={selectedAgentId}
              onChange={(e) => setSelectedAgentId(e.target.value)}
            >
              <option value="">-- Select an agent --</option>
              {pendingAgents.map(agent => (
                <option key={agent.id} value={agent.id}>
                  {agent.full_name || agent.email} ({agent.status})
                </option>
              ))}
            </select>
          </div>

          <Button 
            onClick={handleTestInvite}
            disabled={!selectedAgentId || sendInvitationsMutation.isPending}
          >
            {sendInvitationsMutation.isPending ? 'Sending...' : 'Send Test Invitation'}
          </Button>

          {pendingAgents.length === 0 && (
            <p className="text-gray-500">
              No agents with pending or invited status found.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}