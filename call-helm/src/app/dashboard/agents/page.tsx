'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/lib/hooks/useAuth'
import { Button } from '@/components/ui/button'
import { 
  UserPlus, 
  Upload, 
  Search, 
  MoreVertical, 
  Mail,
  Phone,
  Shield,
  Edit,
  Trash2,
  CheckCircle,
  XCircle,
  Loader2
} from 'lucide-react'

interface Agent {
  id: string
  user_id: string
  email: string
  full_name: string
  role: string
  extension: string
  department: string
  is_active: boolean
  created_at: string
  profile?: {
    phone?: string
    avatar_url?: string
  }
}

export default function AgentsPage() {
  const { user, supabase } = useAuth()
  const [agents, setAgents] = useState<Agent[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [showAddModal, setShowAddModal] = useState(false)
  const [showInviteModal, setShowInviteModal] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)

  useEffect(() => {
    fetchAgents()
  }, [])

  const fetchAgents = async () => {
    try {
      const { data: orgMembers, error } = await supabase
        .from('organization_members')
        .select(`
          *,
          profiles:user_id (
            email,
            full_name,
            phone,
            avatar_url
          )
        `)
        .order('created_at', { ascending: false })

      if (error) throw error

      const formattedAgents = orgMembers?.map(member => ({
        id: member.id,
        user_id: member.user_id,
        email: member.profiles?.email || '',
        full_name: member.profiles?.full_name || '',
        role: member.role,
        extension: member.extension || '',
        department: member.department || '',
        is_active: member.is_active,
        created_at: member.created_at,
        profile: member.profiles
      })) || []

      setAgents(formattedAgents)
    } catch (error) {
      console.error('Error fetching agents:', error)
    } finally {
      setLoading(false)
    }
  }

  const filteredAgents = agents.filter(agent =>
    agent.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    agent.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    agent.department?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'org_admin': return 'bg-purple-100 text-purple-800'
      case 'team_lead': return 'bg-blue-100 text-blue-800'
      case 'billing_admin': return 'bg-yellow-100 text-yellow-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'org_admin': return <Shield className="h-3 w-3" />
      default: return null
    }
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
              onClick={() => setShowInviteModal(true)}
              className="bg-primary hover:bg-primary/90"
            >
              <Mail className="h-4 w-4 mr-2" />
              Invite Agent
            </Button>
            <Button
              onClick={() => setShowAddModal(true)}
              variant="outline"
            >
              <UserPlus className="h-4 w-4 mr-2" />
              Add Manually
            </Button>
            <Button
              onClick={() => setShowImportModal(true)}
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
              <p className="text-2xl font-bold text-gray-900">{agents.length}</p>
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
              <p className="text-2xl font-bold text-gray-900">
                {agents.filter(a => a.is_active).length}
              </p>
            </div>
            <div className="bg-green-100 p-3 rounded-lg">
              <CheckCircle className="h-6 w-6 text-green-600" />
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Team Leads</p>
              <p className="text-2xl font-bold text-gray-900">
                {agents.filter(a => a.role === 'team_lead').length}
              </p>
            </div>
            <div className="bg-blue-100 p-3 rounded-lg">
              <Shield className="h-6 w-6 text-blue-600" />
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Inactive</p>
              <p className="text-2xl font-bold text-gray-900">
                {agents.filter(a => !a.is_active).length}
              </p>
            </div>
            <div className="bg-gray-100 p-3 rounded-lg">
              <XCircle className="h-6 w-6 text-gray-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Agents Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Agent
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Contact
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Department
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Role
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center">
                    <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
                  </td>
                </tr>
              ) : filteredAgents.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                    No agents found
                  </td>
                </tr>
              ) : (
                filteredAgents.map((agent) => (
                  <tr key={agent.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="h-10 w-10 flex-shrink-0">
                          {agent.profile?.avatar_url ? (
                            <img
                              className="h-10 w-10 rounded-full"
                              src={agent.profile.avatar_url}
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
                          <div className="text-sm text-gray-500">
                            Ext: {agent.extension || 'N/A'}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{agent.email}</div>
                      {agent.profile?.phone && (
                        <div className="text-sm text-gray-500 flex items-center mt-1">
                          <Phone className="h-3 w-3 mr-1" />
                          {agent.profile.phone}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {agent.department || 'Not assigned'}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${getRoleBadgeColor(agent.role)}`}>
                        {getRoleIcon(agent.role)}
                        {agent.role.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {agent.is_active ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                          Inactive
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <button className="text-gray-400 hover:text-gray-600">
                        <MoreVertical className="h-5 w-5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}