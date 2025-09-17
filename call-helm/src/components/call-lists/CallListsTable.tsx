'use client'

import { useState } from 'react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Progress } from '@/components/ui/progress'
import {
  MoreHorizontal,
  Search,
  Plus,
  Play,
  Pause,
  Archive,
  Users,
  Phone,
  Target,
  Calendar,
  Edit,
  Eye,
  UserPlus,
  BarChart,
} from 'lucide-react'
import { useCallLists, useArchiveCallList, type CallList } from '@/lib/hooks/useCallLists'
import { CreateCallListWizard } from './modals/CreateCallListWizard'
import { ViewCallListModal } from './modals/ViewCallListModal'
import { AssignContactsModal } from './modals/AssignContactsModal'
import { format } from 'date-fns'
import { useRouter } from 'next/navigation'

export function CallListsTable() {
  const router = useRouter()
  const [filters, setFilters] = useState<{ status?: string; searchTerm?: string }>({})
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [viewingCallList, setViewingCallList] = useState<CallList | null>(null)
  const [assigningCallList, setAssigningCallList] = useState<CallList | null>(null)

  const { data: callLists, isLoading } = useCallLists(filters)
  const archiveCallList = useArchiveCallList()

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'draft':
        return 'bg-gray-100 text-gray-800'
      case 'active':
        return 'bg-green-100 text-green-800'
      case 'paused':
        return 'bg-yellow-100 text-yellow-800'
      case 'completed':
        return 'bg-blue-100 text-blue-800'
      case 'archived':
        return 'bg-gray-100 text-gray-600'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  const getStrategyIcon = (strategy: string) => {
    switch (strategy) {
      case 'manual':
        return <Users className="h-3 w-3" />
      case 'round_robin':
        return '🔄'
      case 'load_based':
        return '⚖️'
      case 'skill_based':
        return '🎯'
      default:
        return null
    }
  }

  const calculateProgress = (list: CallList) => {
    if (!list.total_contacts || list.total_contacts === 0) return 0
    return Math.round((list.completed_contacts || 0) / list.total_contacts * 100)
  }

  return (
    <div className="space-y-4">
      {/* Filters and Actions */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1 flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <Input
              placeholder="Search call lists..."
              value={filters.searchTerm || ''}
              onChange={(e) => setFilters({ ...filters, searchTerm: e.target.value })}
              className="pl-10"
            />
          </div>
          <Select
            value={filters.status || 'all'}
            onValueChange={(value) => setFilters({ ...filters, status: value === 'all' ? undefined : value })}
          >
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="All Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="paused">Paused</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Button onClick={() => setShowCreateModal(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Create Call List
        </Button>
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Strategy</TableHead>
              <TableHead>Contacts</TableHead>
              <TableHead>Progress</TableHead>
              <TableHead>Schedule</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                  Loading call lists...
                </TableCell>
              </TableRow>
            ) : callLists && callLists.length > 0 ? (
              callLists.map((list) => (
                <TableRow 
                  key={list.id} 
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => router.push(`/dashboard/call-lists/${list.id}`)}
                >
                  <TableCell className="font-medium">
                    <div>
                      <div className="font-semibold">{list.name}</div>
                      {list.description && (
                        <div className="text-xs text-muted-foreground line-clamp-1">
                          {list.description}
                        </div>
                      )}
                      {list.campaign_type && (
                        <Badge variant="outline" className="text-xs mt-1">
                          {list.campaign_type}
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge className={getStatusColor(list.status)}>
                      {list.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1 text-sm">
                      {getStrategyIcon(list.distribution_strategy)}
                      <span className="capitalize">
                        {list.distribution_strategy.replace('_', ' ')}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-sm">
                        <Users className="h-3 w-3 text-muted-foreground" />
                        <span>{list.total_contacts || 0} total</span>
                      </div>
                      {list.assigned_contacts && list.assigned_contacts > 0 && (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <UserPlus className="h-3 w-3" />
                          <span>{list.assigned_contacts} assigned</span>
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="space-y-1">
                      <Progress value={calculateProgress(list)} className="h-2" />
                      <div className="text-xs text-muted-foreground">
                        {list.completed_contacts || 0} / {list.total_contacts || 0} completed
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">
                      {list.start_date && list.end_date ? (
                        <div className="space-y-1">
                          <div className="flex items-center gap-1">
                            <Calendar className="h-3 w-3 text-muted-foreground" />
                            <span className="text-xs">
                              {format(new Date(list.start_date), 'MMM d')} - 
                              {format(new Date(list.end_date), 'MMM d')}
                            </span>
                          </div>
                          {list.daily_start_time && list.daily_end_time && (
                            <div className="text-xs text-muted-foreground">
                              {list.daily_start_time} - {list.daily_end_time}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {list.priority > 0 ? (
                      <Badge variant="outline">
                        P{list.priority}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" className="h-8 w-8 p-0">
                          <span className="sr-only">Open menu</span>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuLabel>Actions</DropdownMenuLabel>
                        <DropdownMenuItem onClick={(e) => {
                          e.stopPropagation()
                          setViewingCallList(list)
                        }}>
                          <Eye className="mr-2 h-4 w-4" />
                          View Details
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={(e) => {
                          e.stopPropagation()
                          router.push(`/dashboard/call-lists/${list.id}/edit`)
                        }}>
                          <Edit className="mr-2 h-4 w-4" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={(e) => {
                          e.stopPropagation()
                          setAssigningCallList(list)
                        }}>
                          <UserPlus className="mr-2 h-4 w-4" />
                          Assign Contacts
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={(e) => {
                          e.stopPropagation()
                          router.push(`/dashboard/call-lists/${list.id}/analytics`)
                        }}>
                          <BarChart className="mr-2 h-4 w-4" />
                          Analytics
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        {list.status === 'active' ? (
                          <DropdownMenuItem onClick={(e) => {
                            e.stopPropagation()
                            // Pause call list
                          }}>
                            <Pause className="mr-2 h-4 w-4" />
                            Pause
                          </DropdownMenuItem>
                        ) : list.status === 'paused' || list.status === 'draft' ? (
                          <DropdownMenuItem onClick={(e) => {
                            e.stopPropagation()
                            // Activate call list
                          }}>
                            <Play className="mr-2 h-4 w-4" />
                            Activate
                          </DropdownMenuItem>
                        ) : null}
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation()
                            if (confirm('Are you sure you want to archive this call list?')) {
                              archiveCallList.mutate(list.id)
                            }
                          }}
                        >
                          <Archive className="mr-2 h-4 w-4" />
                          Archive
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                  No call lists found
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Modals */}
      <CreateCallListWizard
        open={showCreateModal}
        onOpenChange={setShowCreateModal}
      />

      {viewingCallList && (
        <ViewCallListModal
          callList={viewingCallList}
          open={!!viewingCallList}
          onOpenChange={(open) => !open && setViewingCallList(null)}
        />
      )}

      {assigningCallList && (
        <AssignContactsModal
          callList={assigningCallList}
          open={!!assigningCallList}
          onOpenChange={(open) => !open && setAssigningCallList(null)}
        />
      )}
    </div>
  )
}