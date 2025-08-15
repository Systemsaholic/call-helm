'use client'

import { useAgentStore } from '@/lib/stores/agentStore'
import { useSendInvitations, useDeleteAgents } from '@/lib/hooks/useAgents'
import { Button } from '@/components/ui/button'
import { 
  Send,
  Trash2,
  Building,
  Users,
  X,
  AlertCircle
} from 'lucide-react'
import { useState } from 'react'

export function BulkActionsToolbar() {
  const {
    selectedAgentIds,
    clearSelection,
    setDeleteConfirmOpen,
  } = useAgentStore()
  
  const sendInvitations = useSendInvitations()
  const deleteAgents = useDeleteAgents()
  const [showConfirmDelete, setShowConfirmDelete] = useState(false)

  if (selectedAgentIds.size === 0) return null

  const handleSendInvitations = () => {
    const ids = Array.from(selectedAgentIds)
    sendInvitations.mutate(ids, {
      onSuccess: () => clearSelection()
    })
  }

  const handleDelete = () => {
    setShowConfirmDelete(true)
  }

  const confirmDelete = () => {
    const ids = Array.from(selectedAgentIds)
    deleteAgents.mutate(ids, {
      onSuccess: () => {
        clearSelection()
        setShowConfirmDelete(false)
      }
    })
  }

  return (
    <>
      <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 z-50">
        <div className="bg-white rounded-lg shadow-lg border p-4">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-700">
                {selectedAgentIds.size} selected
              </span>
              <button
                onClick={clearSelection}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            
            <div className="h-6 w-px bg-gray-300" />
            
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={handleSendInvitations}
                disabled={sendInvitations.isPending}
              >
                <Send className="h-4 w-4 mr-2" />
                Send Invites
              </Button>
              
              <Button
                size="sm"
                variant="outline"
              >
                <Building className="h-4 w-4 mr-2" />
                Assign Department
              </Button>
              
              <Button
                size="sm"
                variant="outline"
              >
                <Users className="h-4 w-4 mr-2" />
                Change Role
              </Button>
              
              <Button
                size="sm"
                variant="outline"
                className="text-red-600 hover:text-red-700"
                onClick={handleDelete}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {showConfirmDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 rounded-full bg-red-100 flex items-center justify-center">
                <AlertCircle className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Delete Agents</h3>
                <p className="text-sm text-gray-600">
                  Are you sure you want to delete {selectedAgentIds.size} agent(s)?
                </p>
              </div>
            </div>
            
            <p className="text-sm text-gray-600 mb-6">
              This action cannot be undone. Agents who have already been invited will have their access revoked.
            </p>
            
            <div className="flex gap-3 justify-end">
              <Button
                variant="outline"
                onClick={() => setShowConfirmDelete(false)}
              >
                Cancel
              </Button>
              <Button
                className="bg-red-600 hover:bg-red-700"
                onClick={confirmDelete}
                disabled={deleteAgents.isPending}
              >
                Delete Agents
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}