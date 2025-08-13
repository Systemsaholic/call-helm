'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/lib/hooks/useAuth'
import { Button } from '@/components/ui/button'
import { 
  Plus,
  Upload,
  Search,
  MoreVertical,
  Users,
  Phone,
  Calendar,
  PlayCircle,
  PauseCircle,
  CheckCircle2,
  Archive,
  BarChart3,
  Loader2,
  ChevronRight
} from 'lucide-react'
import Link from 'next/link'

interface CallList {
  id: string
  name: string
  description: string
  start_date: string
  end_date: string
  status: 'active' | 'paused' | 'completed' | 'archived'
  assigned_to: string[]
  total_contacts: number
  contacts_called: number
  created_at: string
}

export default function CallListsPage() {
  const { user, supabase } = useAuth()
  const [callLists, setCallLists] = useState<CallList[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedStatus, setSelectedStatus] = useState<string>('all')
  const [showCreateModal, setShowCreateModal] = useState(false)

  useEffect(() => {
    fetchCallLists()
  }, [])

  const fetchCallLists = async () => {
    try {
      const { data: lists, error: listsError } = await supabase
        .from('call_lists')
        .select('*')
        .order('created_at', { ascending: false })

      if (listsError) throw listsError

      // Fetch contact counts for each list
      const listsWithCounts = await Promise.all(
        (lists || []).map(async (list) => {
          const { count: totalContacts } = await supabase
            .from('call_list_contacts')
            .select('*', { count: 'exact', head: true })
            .eq('call_list_id', list.id)

          const { count: contactsCalled } = await supabase
            .from('call_list_contacts')
            .select('*', { count: 'exact', head: true })
            .eq('call_list_id', list.id)
            .neq('status', 'pending')

          return {
            ...list,
            total_contacts: totalContacts || 0,
            contacts_called: contactsCalled || 0
          }
        })
      )

      setCallLists(listsWithCounts)
    } catch (error) {
      console.error('Error fetching call lists:', error)
    } finally {
      setLoading(false)
    }
  }

  const filteredCallLists = callLists.filter(list => {
    const matchesSearch = 
      list.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      list.description?.toLowerCase().includes(searchTerm.toLowerCase())
    
    const matchesStatus = selectedStatus === 'all' || list.status === selectedStatus
    
    return matchesSearch && matchesStatus
  })

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active': return <PlayCircle className="h-4 w-4" />
      case 'paused': return <PauseCircle className="h-4 w-4" />
      case 'completed': return <CheckCircle2 className="h-4 w-4" />
      case 'archived': return <Archive className="h-4 w-4" />
      default: return null
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-100 text-green-800'
      case 'paused': return 'bg-yellow-100 text-yellow-800'
      case 'completed': return 'bg-blue-100 text-blue-800'
      case 'archived': return 'bg-gray-100 text-gray-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const getProgress = (called: number, total: number) => {
    if (total === 0) return 0
    return Math.round((called / total) * 100)
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Call Lists</h1>
        <p className="text-gray-600">Manage your calling campaigns and contact lists</p>
      </div>

      {/* Actions Bar */}
      <div className="bg-white rounded-lg shadow mb-6 p-4">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="flex flex-col sm:flex-row gap-4 flex-1">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
              <input
                type="text"
                placeholder="Search call lists..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              />
            </div>
            
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="paused">Paused</option>
              <option value="completed">Completed</option>
              <option value="archived">Archived</option>
            </select>
          </div>
          
          <div className="flex gap-2">
            <Button
              onClick={() => setShowCreateModal(true)}
              className="bg-primary hover:bg-primary/90"
            >
              <Plus className="h-4 w-4 mr-2" />
              Create List
            </Button>
            <Button
              variant="outline"
            >
              <Upload className="h-4 w-4 mr-2" />
              Import Contacts
            </Button>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Lists</p>
              <p className="text-2xl font-bold text-gray-900">{callLists.length}</p>
            </div>
            <div className="bg-primary/10 p-3 rounded-lg">
              <Phone className="h-6 w-6 text-primary" />
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Active Campaigns</p>
              <p className="text-2xl font-bold text-gray-900">
                {callLists.filter(l => l.status === 'active').length}
              </p>
            </div>
            <div className="bg-green-100 p-3 rounded-lg">
              <PlayCircle className="h-6 w-6 text-green-600" />
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Contacts</p>
              <p className="text-2xl font-bold text-gray-900">
                {callLists.reduce((sum, list) => sum + list.total_contacts, 0)}
              </p>
            </div>
            <div className="bg-blue-100 p-3 rounded-lg">
              <Users className="h-6 w-6 text-blue-600" />
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Contacts Called</p>
              <p className="text-2xl font-bold text-gray-900">
                {callLists.reduce((sum, list) => sum + list.contacts_called, 0)}
              </p>
            </div>
            <div className="bg-accent/10 p-3 rounded-lg">
              <BarChart3 className="h-6 w-6 text-accent" />
            </div>
          </div>
        </div>
      </div>

      {/* Call Lists Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {loading ? (
          <div className="col-span-full flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : filteredCallLists.length === 0 ? (
          <div className="col-span-full text-center py-12">
            <div className="bg-white rounded-lg shadow p-8">
              <Phone className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500 mb-4">No call lists found</p>
              <Button onClick={() => setShowCreateModal(true)}>
                Create your first call list
              </Button>
            </div>
          </div>
        ) : (
          filteredCallLists.map((list) => (
            <div key={list.id} className="bg-white rounded-lg shadow hover:shadow-lg transition-shadow">
              <div className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-gray-900 mb-1">
                      {list.name}
                    </h3>
                    <p className="text-sm text-gray-600 line-clamp-2">
                      {list.description || 'No description'}
                    </p>
                  </div>
                  <button className="text-gray-400 hover:text-gray-600">
                    <MoreVertical className="h-5 w-5" />
                  </button>
                </div>

                <div className="flex items-center gap-2 mb-4">
                  <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(list.status)}`}>
                    {getStatusIcon(list.status)}
                    {list.status}
                  </span>
                  {list.start_date && (
                    <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                      <Calendar className="h-3 w-3" />
                      {new Date(list.start_date).toLocaleDateString()}
                    </span>
                  )}
                </div>

                <div className="space-y-3">
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-600">Progress</span>
                      <span className="font-medium">
                        {list.contacts_called}/{list.total_contacts} contacts
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-primary h-2 rounded-full transition-all"
                        style={{ width: `${getProgress(list.contacts_called, list.total_contacts)}%` }}
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">Assigned agents</span>
                    <span className="font-medium">{list.assigned_to?.length || 0}</span>
                  </div>
                </div>

                <div className="mt-4 pt-4 border-t flex gap-2">
                  <Link href={`/dashboard/call-lists/${list.id}`} className="flex-1">
                    <Button variant="outline" className="w-full" size="sm">
                      View Details
                      <ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                  </Link>
                  {list.status === 'active' && (
                    <Link href={`/dashboard/call-board?list=${list.id}`} className="flex-1">
                      <Button className="w-full" size="sm">
                        Start Calling
                        <Phone className="h-4 w-4 ml-1" />
                      </Button>
                    </Link>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}