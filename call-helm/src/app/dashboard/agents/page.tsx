'use client'

import { useAgentStore } from '@/lib/stores/agentStore'
import { useAgents } from '@/lib/hooks/useAgents'
import { AgentsTable } from '@/components/agents/AgentsTable'
import { BulkActionsToolbar } from '@/components/agents/BulkActionsToolbar'
import { AddAgentModal } from '@/components/agents/modals/AddAgentModal'
import { ImportAgentsModal } from '@/components/agents/modals/ImportAgentsModal'
import { AgentDetailsModal } from '@/components/agents/modals/AgentDetailsModal'
import { Button } from '@/components/ui/button'
import { 
  UserPlus, 
  Upload, 
  Search, 
  Mail,
  Shield,
  CheckCircle,
  XCircle,
  Loader2
} from 'lucide-react'


export default function AgentsPage() {
  const {
    searchTerm,
    setSearchTerm,
    statusFilter,
    setStatusFilter,
    departmentFilter,
    setDepartmentFilter,
    setAddModalOpen,
    setImportModalOpen,
    selectedAgentIds,
  } = useAgentStore()

  const { data: agents = [], isLoading } = useAgents({
    searchTerm,
    status: statusFilter,
    department: departmentFilter,
  })

  // Count statistics
  const stats = {
    total: agents.length,
    active: agents.filter((a) => a.status === 'active').length,
    pending: agents.filter((a) => a.status === 'pending_invitation').length,
    invited: agents.filter((a) => a.status === 'invited').length,
    teamLeads: agents.filter((a) => a.role === 'team_lead').length,
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Agent Management</h1>
        <p className="text-gray-600">Manage your team members and their permissions</p>
      </div>

      {/* Actions Bar */}
      <div className="bg-white rounded-lg shadow mb-6 p-4">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
            <input
              type="text"
              placeholder="Search agents by name, email, or department..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            />
          </div>
          
          <div className="flex gap-2">
            <Button
              onClick={() => setAddModalOpen(true)}
              className="bg-primary hover:bg-primary/90"
            >
              <UserPlus className="h-4 w-4 mr-2" />
              Add Agent
            </Button>
            <Button
              onClick={() => setImportModalOpen(true)}
              variant="outline"
            >
              <Upload className="h-4 w-4 mr-2" />
              Import CSV
            </Button>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Agents</p>
              <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
            </div>
            <div className="bg-primary/10 p-3 rounded-lg">
              <UserPlus className="h-6 w-6 text-primary" />
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Active</p>
              <p className="text-2xl font-bold text-gray-900">{stats.active}</p>
            </div>
            <div className="bg-green-100 p-3 rounded-lg">
              <CheckCircle className="h-6 w-6 text-green-600" />
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Pending Invite</p>
              <p className="text-2xl font-bold text-gray-900">{stats.pending}</p>
            </div>
            <div className="bg-yellow-100 p-3 rounded-lg">
              <Mail className="h-6 w-6 text-yellow-600" />
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Team Leads</p>
              <p className="text-2xl font-bold text-gray-900">{stats.teamLeads}</p>
            </div>
            <div className="bg-blue-100 p-3 rounded-lg">
              <Shield className="h-6 w-6 text-blue-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Agents Table */}
      <AgentsTable agents={agents} loading={isLoading} />

      {/* Bulk Actions Toolbar */}
      <BulkActionsToolbar />

      {/* Modals */}
      <AddAgentModal />
      <ImportAgentsModal />
      <AgentDetailsModal />
    </div>
  )
}