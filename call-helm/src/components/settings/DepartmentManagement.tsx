'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/lib/hooks/useAuth'
import { Button } from '@/components/ui/button'
import { ConfirmationDialog } from '@/components/ui/confirmation-dialog'
import { useConfirmation } from '@/lib/hooks/useConfirmation'
import { 
  Plus, 
  Edit2, 
  Trash2, 
  Save, 
  X,
  Building,
  Users,
  Loader2
} from 'lucide-react'
import { toast } from 'sonner'

interface Department {
  id: string
  name: string
  description: string | null
  manager_id: string | null
  organization_id: string
  created_at: string
  updated_at: string
}

export function DepartmentManagement() {
  const { supabase, user } = useAuth()
  const queryClient = useQueryClient()
  const confirmation = useConfirmation()
  
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [editingDepartment, setEditingDepartment] = useState<Department | null>(null)
  const [formData, setFormData] = useState({
    name: '',
    description: ''
  })

  // Fetch departments
  const { data: departments = [], isLoading } = useQuery({
    queryKey: ['departments'],
    queryFn: async () => {
      // Get user's organization
      const { data: member } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user?.id)
        .single()

      if (!member) throw new Error('No organization found')

      const { data, error } = await supabase
        .from('departments')
        .select('*')
        .eq('organization_id', member.organization_id)
        .order('name')

      if (error) throw error
      return data as Department[]
    },
    enabled: !!user
  })

  // Create department mutation
  const createDepartment = useMutation({
    mutationFn: async (data: { name: string; description: string }) => {
      // Get user's organization
      const { data: member } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user?.id)
        .single()

      if (!member) throw new Error('No organization found')

      const { error } = await supabase
        .from('departments')
        .insert({
          organization_id: member.organization_id,
          name: data.name,
          description: data.description || null
        })

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['departments'] })
      toast.success('Department created successfully')
      setIsAddModalOpen(false)
      setFormData({ name: '', description: '' })
    },
    onError: (error) => {
      toast.error('Failed to create department')
      console.error('Create department error:', error)
    }
  })

  // Update department mutation
  const updateDepartment = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: { name: string; description: string } }) => {
      const { error } = await supabase
        .from('departments')
        .update({
          name: data.name,
          description: data.description || null
        })
        .eq('id', id)

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['departments'] })
      toast.success('Department updated successfully')
      setEditingDepartment(null)
      setFormData({ name: '', description: '' })
    },
    onError: (error) => {
      toast.error('Failed to update department')
      console.error('Update department error:', error)
    }
  })

  // Delete department mutation
  const deleteDepartment = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('departments')
        .delete()
        .eq('id', id)

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['departments'] })
      toast.success('Department deleted successfully')
    },
    onError: (error) => {
      toast.error('Failed to delete department')
      console.error('Delete department error:', error)
    }
  })

  const handleAddDepartment = () => {
    setFormData({ name: '', description: '' })
    setIsAddModalOpen(true)
  }

  const handleEditDepartment = (dept: Department) => {
    setFormData({ name: dept.name, description: dept.description || '' })
    setEditingDepartment(dept)
  }

  const handleDeleteDepartment = (dept: Department) => {
    confirmation.showConfirmation({
      title: 'Delete Department',
      description: `Are you sure you want to delete "${dept.name}"? This action cannot be undone.`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      variant: 'destructive',
      onConfirm: async () => {
        await deleteDepartment.mutateAsync(dept.id)
      }
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!formData.name.trim()) {
      toast.error('Department name is required')
      return
    }

    if (editingDepartment) {
      await updateDepartment.mutateAsync({
        id: editingDepartment.id,
        data: formData
      })
    } else {
      await createDepartment.mutateAsync(formData)
    }
  }

  const handleCancel = () => {
    setIsAddModalOpen(false)
    setEditingDepartment(null)
    setFormData({ name: '', description: '' })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Departments</h3>
          <p className="text-sm text-gray-500 mt-1">
            Manage organizational departments for agent assignment
          </p>
        </div>
        <Button
          onClick={handleAddDepartment}
          size="sm"
          className="bg-primary hover:bg-primary/90"
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Department
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
        </div>
      ) : departments.length === 0 ? (
        <div className="bg-gray-50 rounded-lg p-8 text-center">
          <Building className="h-12 w-12 mx-auto text-gray-400 mb-3" />
          <p className="text-gray-600">No departments yet</p>
          <p className="text-sm text-gray-500 mt-1">
            Create your first department to organize your agents
          </p>
          <Button
            onClick={handleAddDepartment}
            size="sm"
            className="mt-4"
          >
            <Plus className="h-4 w-4 mr-2" />
            Create Department
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {departments.map((dept) => (
            <div
              key={dept.id}
              className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-sm transition-shadow"
            >
              {editingDepartment?.id === dept.id ? (
                <form onSubmit={handleSubmit} className="space-y-3">
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="Department name"
                    autoFocus
                  />
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="Description (optional)"
                    rows={2}
                  />
                  <div className="flex gap-2">
                    <Button
                      type="submit"
                      size="sm"
                      disabled={updateDepartment.isPending}
                    >
                      {updateDepartment.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Save className="h-4 w-4 mr-2" />
                      )}
                      Save
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={handleCancel}
                      disabled={updateDepartment.isPending}
                    >
                      Cancel
                    </Button>
                  </div>
                </form>
              ) : (
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h4 className="font-medium text-gray-900">{dept.name}</h4>
                    {dept.description && (
                      <p className="text-sm text-gray-500 mt-1">{dept.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 ml-4">
                    <button
                      onClick={() => handleEditDepartment(dept)}
                      className="text-gray-600 hover:text-gray-900"
                      title="Edit"
                    >
                      <Edit2 className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteDepartment(dept)}
                      className="text-red-600 hover:text-red-900"
                      title="Delete"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add Department Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg w-full max-w-md">
            <div className="border-b px-6 py-4 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-gray-900">Add Department</h2>
              <button
                onClick={handleCancel}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Department Name *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="e.g., Sales, Support, Marketing"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="Brief description of the department..."
                  rows={3}
                />
              </div>

              <div className="flex gap-3 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={handleCancel}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className="flex-1"
                  disabled={createDepartment.isPending}
                >
                  {createDepartment.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    'Create Department'
                  )}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirmation Dialog */}
      <ConfirmationDialog
        isOpen={confirmation.isOpen}
        onClose={confirmation.hideConfirmation}
        onConfirm={confirmation.handleConfirm}
        title={confirmation.title}
        description={confirmation.description}
        confirmText={confirmation.confirmText}
        cancelText={confirmation.cancelText}
        variant={confirmation.variant}
        isLoading={confirmation.isLoading}
      />
    </div>
  )
}