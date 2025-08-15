'use client'

import { useMemo } from 'react'
import { useAgentStore, type Agent } from '@/lib/stores/agentStore'
import { 
  UserPlus, 
  Mail,
  Phone,
  Shield,
  MoreVertical,
  CheckCircle,
  XCircle,
  Edit,
  Trash2,
  Send,
  UserCheck,
  Clock,
  Ban
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { format } from 'date-fns'

interface AgentsTableProps {
  agents: Agent[]
  loading?: boolean
}

export function AgentsTable({ agents, loading }: AgentsTableProps) {
  const {
    selectedAgentIds,
    isAllSelected,
    toggleAgentSelection,
    selectAllAgents,
    clearSelection,
    setDetailsModalOpen,
    sortBy,
    sortOrder,
    setSorting,
  } = useAgentStore()

  // Sort agents
  const sortedAgents = useMemo(() => {
    const sorted = [...agents].sort((a, b) => {
      let aVal: any = a[sortBy as keyof Agent]
      let bVal: any = b[sortBy as keyof Agent]

      if (sortBy === 'created_at') {
        aVal = new Date(aVal).getTime()
        bVal = new Date(bVal).getTime()
      }

      if (typeof aVal === 'string') {
        aVal = aVal.toLowerCase()
        bVal = bVal.toLowerCase()
      }

      if (sortOrder === 'asc') {
        return aVal > bVal ? 1 : -1
      } else {
        return aVal < bVal ? 1 : -1
      }
    })
    return sorted
  }, [agents, sortBy, sortOrder])

  const handleSelectAll = () => {
    if (isAllSelected || selectedAgentIds.size > 0) {
      clearSelection()
    } else {
      selectAllAgents(agents.map(a => a.id))
    }
  }

  const getRoleBadge = (role: string) => {
    const badges: Record<string, { color: string; icon?: React.ReactNode }> = {
      org_admin: { color: 'bg-purple-100 text-purple-800', icon: <Shield className="h-3 w-3" /> },
      team_lead: { color: 'bg-blue-100 text-blue-800' },
      billing_admin: { color: 'bg-yellow-100 text-yellow-800' },
      agent: { color: 'bg-gray-100 text-gray-800' },
    }
    return badges[role] || badges.agent
  }

  const getStatusBadge = (status: Agent['status']) => {
    const badges: Record<Agent['status'], { color: string; icon: React.ReactNode; label: string }> = {
      pending_invitation: { 
        color: 'bg-gray-100 text-gray-800', 
        icon: <Clock className="h-3 w-3" />,
        label: 'Pending'
      },
      invited: { 
        color: 'bg-yellow-100 text-yellow-800', 
        icon: <Mail className="h-3 w-3" />,
        label: 'Invited'
      },
      active: { 
        color: 'bg-green-100 text-green-800', 
        icon: <CheckCircle className="h-3 w-3" />,
        label: 'Active'
      },
      inactive: { 
        color: 'bg-red-100 text-red-800', 
        icon: <XCircle className="h-3 w-3" />,
        label: 'Inactive'
      },
      suspended: { 
        color: 'bg-orange-100 text-orange-800', 
        icon: <Ban className="h-3 w-3" />,
        label: 'Suspended'
      },
    }
    return badges[status]
  }

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow">
        <div className="p-8 text-center">
          <div className="animate-pulse">
            <div className="h-4 bg-gray-200 rounded w-1/4 mx-auto mb-4"></div>
            <div className="h-4 bg-gray-200 rounded w-1/3 mx-auto"></div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left">
                <input
                  type="checkbox"
                  checked={isAllSelected || (selectedAgentIds.size > 0 && selectedAgentIds.size === agents.length)}
                  ref={(el) => {
                    if (el) {
                      el.indeterminate = !isAllSelected && selectedAgentIds.size > 0 && selectedAgentIds.size < agents.length
                    }
                  }}
                  onChange={handleSelectAll}
                  className="h-4 w-4 text-primary rounded border-gray-300 focus:ring-primary"
                />
              </th>
              <th 
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                onClick={() => setSorting('full_name')}
              >
                Agent
              </th>
              <th 
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                onClick={() => setSorting('email')}
              >
                Contact
              </th>
              <th 
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                onClick={() => setSorting('department')}
              >
                Department
              </th>
              <th 
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                onClick={() => setSorting('role')}
              >
                Role
              </th>
              <th 
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                onClick={() => setSorting('status')}
              >
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {sortedAgents.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                  No agents found
                </td>
              </tr>
            ) : (
              sortedAgents.map((agent) => {
                const roleBadge = getRoleBadge(agent.role)
                const statusBadge = getStatusBadge(agent.status)
                
                return (
                  <tr 
                    key={agent.id} 
                    className={`hover:bg-gray-50 ${selectedAgentIds.has(agent.id) ? 'bg-blue-50' : ''}`}
                  >
                    <td className="px-6 py-4">
                      <input
                        type="checkbox"
                        checked={selectedAgentIds.has(agent.id)}
                        onChange={() => toggleAgentSelection(agent.id)}
                        className="h-4 w-4 text-primary rounded border-gray-300 focus:ring-primary"
                      />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="h-10 w-10 flex-shrink-0">
                          {agent.avatar_url ? (
                            <img
                              className="h-10 w-10 rounded-full"
                              src={agent.avatar_url}
                              alt={agent.full_name}
                            />
                          ) : (
                            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                              <span className="text-primary font-medium">
                                {agent.full_name?.charAt(0) || agent.email?.charAt(0)}
                              </span>
                            </div>
                          )}
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-medium text-gray-900">
                            {agent.full_name || 'Unknown'}
                          </div>
                          {agent.extension && (
                            <div className="text-sm text-gray-500">
                              Ext: {agent.extension}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{agent.email}</div>
                      {agent.phone && (
                        <div className="text-sm text-gray-500 flex items-center mt-1">
                          <Phone className="h-3 w-3 mr-1" />
                          {agent.phone}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {agent.department || 'Not assigned'}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${roleBadge.color}`}>
                        {roleBadge.icon}
                        {agent.role.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${statusBadge.color}`}>
                        {statusBadge.icon}
                        {statusBadge.label}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <div className="flex items-center gap-2">
                        {agent.status === 'pending_invitation' && (
                          <button
                            className="text-primary hover:text-primary/80"
                            title="Send Invitation"
                          >
                            <Send className="h-4 w-4" />
                          </button>
                        )}
                        <button
                          onClick={() => setDetailsModalOpen(true, agent.id)}
                          className="text-gray-600 hover:text-gray-900"
                          title="View Details"
                        >
                          <Edit className="h-4 w-4" />
                        </button>
                        <button
                          className="text-red-600 hover:text-red-900"
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}