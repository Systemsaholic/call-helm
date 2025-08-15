import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'

export interface Agent {
  id: string
  organization_id: string
  user_id: string | null
  email: string
  full_name: string
  phone?: string
  role: string
  extension?: string
  department?: string
  department_id?: string
  status: 'pending_invitation' | 'invited' | 'active' | 'inactive' | 'suspended'
  is_active: boolean
  invited_at?: string
  joined_at?: string
  created_at: string
  updated_at: string
  avatar_url?: string
  bio?: string
}

interface AgentUIState {
  // Selection state
  selectedAgentIds: Set<string>
  isAllSelected: boolean
  
  // Modal states
  isAddModalOpen: boolean
  isImportModalOpen: boolean
  isDetailsModalOpen: boolean
  isBulkInviteModalOpen: boolean
  isDeleteConfirmOpen: boolean
  
  // Current agent for details/edit
  currentAgentId: string | null
  selectedAgentId: string | null
  
  // Filters and search
  searchTerm: string
  statusFilter: 'all' | Agent['status']
  departmentFilter: string | 'all'
  
  // Sorting
  sortBy: 'name' | 'email' | 'department' | 'role' | 'status' | 'created_at'
  sortOrder: 'asc' | 'desc'
  
  // Actions
  setSelectedAgentIds: (ids: Set<string>) => void
  toggleAgentSelection: (id: string) => void
  selectAllAgents: (agentIds: string[]) => void
  clearSelection: () => void
  
  setAddModalOpen: (open: boolean) => void
  setImportModalOpen: (open: boolean) => void
  setDetailsModalOpen: (open: boolean, agentId?: string) => void
  setSelectedAgentId: (agentId: string | null) => void
  setBulkInviteModalOpen: (open: boolean) => void
  setDeleteConfirmOpen: (open: boolean) => void
  
  setSearchTerm: (term: string) => void
  setStatusFilter: (status: 'all' | Agent['status']) => void
  setDepartmentFilter: (department: string | 'all') => void
  
  setSorting: (sortBy: AgentUIState['sortBy'], sortOrder?: AgentUIState['sortOrder']) => void
}

export const useAgentStore = create<AgentUIState>()(
  immer((set) => ({
    // Initial state
    selectedAgentIds: new Set(),
    isAllSelected: false,
    
    isAddModalOpen: false,
    isImportModalOpen: false,
    isDetailsModalOpen: false,
    isBulkInviteModalOpen: false,
    isDeleteConfirmOpen: false,
    
    currentAgentId: null,
    selectedAgentId: null,
    
    searchTerm: '',
    statusFilter: 'all',
    departmentFilter: 'all',
    
    sortBy: 'created_at',
    sortOrder: 'desc',
    
    // Actions
    setSelectedAgentIds: (ids) =>
      set((state) => {
        state.selectedAgentIds = ids
        state.isAllSelected = false
      }),
    
    toggleAgentSelection: (id) =>
      set((state) => {
        if (state.selectedAgentIds.has(id)) {
          state.selectedAgentIds.delete(id)
        } else {
          state.selectedAgentIds.add(id)
        }
        state.isAllSelected = false
      }),
    
    selectAllAgents: (agentIds) =>
      set((state) => {
        state.selectedAgentIds = new Set(agentIds)
        state.isAllSelected = true
      }),
    
    clearSelection: () =>
      set((state) => {
        state.selectedAgentIds.clear()
        state.isAllSelected = false
      }),
    
    setAddModalOpen: (open) =>
      set((state) => {
        state.isAddModalOpen = open
      }),
    
    setImportModalOpen: (open) =>
      set((state) => {
        state.isImportModalOpen = open
      }),
    
    setDetailsModalOpen: (open, agentId) =>
      set((state) => {
        state.isDetailsModalOpen = open
        state.currentAgentId = agentId || null
      }),
    
    setSelectedAgentId: (agentId) =>
      set((state) => {
        state.selectedAgentId = agentId
        if (agentId) {
          state.currentAgentId = agentId
          state.isDetailsModalOpen = true
        }
      }),
    
    setBulkInviteModalOpen: (open) =>
      set((state) => {
        state.isBulkInviteModalOpen = open
      }),
    
    setDeleteConfirmOpen: (open) =>
      set((state) => {
        state.isDeleteConfirmOpen = open
      }),
    
    setSearchTerm: (term) =>
      set((state) => {
        state.searchTerm = term
      }),
    
    setStatusFilter: (status) =>
      set((state) => {
        state.statusFilter = status
      }),
    
    setDepartmentFilter: (department) =>
      set((state) => {
        state.departmentFilter = department
      }),
    
    setSorting: (sortBy, sortOrder) =>
      set((state) => {
        if (state.sortBy === sortBy && !sortOrder) {
          // Toggle order if same column clicked
          state.sortOrder = state.sortOrder === 'asc' ? 'desc' : 'asc'
        } else {
          state.sortBy = sortBy
          state.sortOrder = sortOrder || 'asc'
        }
      }),
  }))
)