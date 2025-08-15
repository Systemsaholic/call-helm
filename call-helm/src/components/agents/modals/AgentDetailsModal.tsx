'use client'

import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { updateAgentSchema, type UpdateAgentInput } from '@/lib/validations/agent.schema'
import { useAgent, useUpdateAgent, useSendInvitations, useDepartments } from '@/lib/hooks/useAgents'
import { useAgentStore } from '@/lib/stores/agentStore'
import { Button } from '@/components/ui/button'
import { 
  X, 
  User, 
  Mail, 
  Phone, 
  Shield,
  Building,
  Calendar,
  Clock,
  Send,
  Edit2,
  Save,
  XCircle,
  CheckCircle,
  Loader2,
  AlertCircle
} from 'lucide-react'
import { format } from 'date-fns'

export function AgentDetailsModal() {
  const { isDetailsModalOpen, currentAgentId, setDetailsModalOpen } = useAgentStore()
  const { data: agent, isLoading } = useAgent(currentAgentId || '')
  const { data: departments } = useDepartments()
  const updateAgent = useUpdateAgent()
  const sendInvitations = useSendInvitations()
  const [isEditing, setIsEditing] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<UpdateAgentInput>({
    resolver: zodResolver(updateAgentSchema),
  })

  // Reset form when agent data changes
  useEffect(() => {
    if (agent) {
      reset({
        full_name: agent.full_name,
        email: agent.email,
        phone: agent.phone || undefined,
        role: agent.role,
        department_id: agent.department_id || undefined,
        extension: agent.extension || undefined,
        bio: agent.bio || undefined,
      })
    }
  }, [agent, reset])

  if (!isDetailsModalOpen || !currentAgentId || !agent) return null

  const handleClose = () => {
    setDetailsModalOpen(false)
    setIsEditing(false)
  }

  const onSubmit = async (data: UpdateAgentInput) => {
    await updateAgent.mutateAsync({
      id: agent.id,
      updates: data,
    })
    setIsEditing(false)
  }

  const handleSendInvitation = async () => {
    await sendInvitations.mutateAsync([agent.id])
  }

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      pending_invitation: { color: 'bg-yellow-100 text-yellow-800', icon: Clock },
      invited: { color: 'bg-blue-100 text-blue-800', icon: Mail },
      active: { color: 'bg-green-100 text-green-800', icon: CheckCircle },
      inactive: { color: 'bg-gray-100 text-gray-800', icon: XCircle },
      suspended: { color: 'bg-red-100 text-red-800', icon: AlertCircle },
    }
    
    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.inactive
    const Icon = config.icon
    
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${config.color}`}>
        <Icon className="h-3 w-3" />
        {status.replace('_', ' ')}
      </span>
    )
  }

  const getRoleBadge = (role: string) => {
    const roleConfig = {
      agent: 'bg-gray-100 text-gray-800',
      team_lead: 'bg-blue-100 text-blue-800',
      billing_admin: 'bg-purple-100 text-purple-800',
      org_admin: 'bg-indigo-100 text-indigo-800',
    }
    
    const color = roleConfig[role as keyof typeof roleConfig] || roleConfig.agent
    
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${color}`}>
        <Shield className="h-3 w-3" />
        {role.replace('_', ' ')}
      </span>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg w-full max-w-2xl max-h-[90vh] overflow-hidden">
        <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-900">Agent Details</h2>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {isLoading ? (
          <div className="p-6 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
          </div>
        ) : (
          <div className="p-6 overflow-y-auto max-h-[calc(90vh-140px)]">
            {/* Status and Actions */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                {getStatusBadge(agent.status)}
                {getRoleBadge(agent.role)}
              </div>
              <div className="flex items-center gap-2">
                {agent.status === 'pending_invitation' && (
                  <Button
                    size="sm"
                    onClick={handleSendInvitation}
                    disabled={sendInvitations.isPending}
                  >
                    <Send className="h-4 w-4 mr-2" />
                    Send Invitation
                  </Button>
                )}
                {!isEditing ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setIsEditing(true)}
                  >
                    <Edit2 className="h-4 w-4 mr-2" />
                    Edit
                  </Button>
                ) : (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setIsEditing(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleSubmit(onSubmit)}
                      disabled={isSubmitting || updateAgent.isPending}
                    >
                      {(isSubmitting || updateAgent.isPending) ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        <>
                          <Save className="h-4 w-4 mr-2" />
                          Save
                        </>
                      )}
                    </Button>
                  </>
                )}
              </div>
            </div>

            <form className="space-y-6">
              {/* Personal Information */}
              <div>
                <h3 className="text-sm font-medium text-gray-900 mb-3">Personal Information</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Full Name
                    </label>
                    {isEditing ? (
                      <>
                        <input
                          {...register('full_name')}
                          type="text"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                        {errors.full_name && (
                          <p className="mt-1 text-xs text-red-600">{errors.full_name.message}</p>
                        )}
                      </>
                    ) : (
                      <p className="text-gray-900">{agent.full_name}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Email Address
                    </label>
                    {isEditing ? (
                      <>
                        <input
                          {...register('email')}
                          type="email"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                        {errors.email && (
                          <p className="mt-1 text-xs text-red-600">{errors.email.message}</p>
                        )}
                      </>
                    ) : (
                      <p className="text-gray-900">{agent.email}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Phone Number
                    </label>
                    {isEditing ? (
                      <>
                        <input
                          {...register('phone')}
                          type="tel"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                          placeholder="+1 (555) 000-0000"
                        />
                        {errors.phone && (
                          <p className="mt-1 text-xs text-red-600">{errors.phone.message}</p>
                        )}
                      </>
                    ) : (
                      <p className="text-gray-900">{agent.phone || '-'}</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Organization Information */}
              <div>
                <h3 className="text-sm font-medium text-gray-900 mb-3">Organization Information</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Role
                    </label>
                    {isEditing ? (
                      <select
                        {...register('role')}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                      >
                        <option value="agent">Agent</option>
                        <option value="team_lead">Team Lead</option>
                        <option value="billing_admin">Billing Admin</option>
                        <option value="org_admin">Organization Admin</option>
                      </select>
                    ) : (
                      <p className="text-gray-900 capitalize">{agent.role.replace('_', ' ')}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Department
                    </label>
                    {isEditing ? (
                      <select
                        {...register('department_id')}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                      >
                        <option value="">No department</option>
                        {departments?.map((dept) => (
                          <option key={dept.id} value={dept.id}>
                            {dept.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <p className="text-gray-900">
                        {departments?.find(d => d.id === agent.department_id)?.name || '-'}
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Extension
                    </label>
                    {isEditing ? (
                      <>
                        <input
                          {...register('extension')}
                          type="text"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                          placeholder="1234"
                        />
                        {errors.extension && (
                          <p className="mt-1 text-xs text-red-600">{errors.extension.message}</p>
                        )}
                      </>
                    ) : (
                      <p className="text-gray-900">{agent.extension || '-'}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Bio
                    </label>
                    {isEditing ? (
                      <>
                        <textarea
                          {...register('bio')}
                          rows={3}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                          placeholder="Brief description..."
                        />
                        {errors.bio && (
                          <p className="mt-1 text-xs text-red-600">{errors.bio.message}</p>
                        )}
                      </>
                    ) : (
                      <p className="text-gray-900">{agent.bio || '-'}</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Activity Information */}
              <div>
                <h3 className="text-sm font-medium text-gray-900 mb-3">Activity Information</h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Created</span>
                    <span className="text-sm text-gray-900">
                      {format(new Date(agent.created_at), 'MMM d, yyyy h:mm a')}
                    </span>
                  </div>
                  
                  {agent.invitation_sent_at && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Invitation Sent</span>
                      <span className="text-sm text-gray-900">
                        {format(new Date(agent.invitation_sent_at), 'MMM d, yyyy h:mm a')}
                      </span>
                    </div>
                  )}
                  
                  {agent.invitation_accepted_at && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Invitation Accepted</span>
                      <span className="text-sm text-gray-900">
                        {format(new Date(agent.invitation_accepted_at), 'MMM d, yyyy h:mm a')}
                      </span>
                    </div>
                  )}
                  
                  {agent.last_login_at && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Last Login</span>
                      <span className="text-sm text-gray-900">
                        {format(new Date(agent.last_login_at), 'MMM d, yyyy h:mm a')}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  )
}