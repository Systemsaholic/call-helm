'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  useBroadcasts,
  useDeleteBroadcast,
  useSendBroadcast,
  usePauseBroadcast,
  useResumeBroadcast,
  useCancelBroadcast,
  Broadcast,
} from '@/lib/hooks/useBroadcasts'
import { useBilling } from '@/lib/hooks/useBilling'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Plus,
  MoreVertical,
  Play,
  Pause,
  StopCircle,
  Trash2,
  Clock,
  Send,
  CheckCircle,
  XCircle,
  AlertCircle,
  Radio,
  Users,
  MessageSquare,
} from 'lucide-react'
import { format } from 'date-fns'
import { BroadcastWizard } from '@/components/broadcasts/BroadcastWizard'

const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: React.ReactNode }> = {
  draft: { label: 'Draft', variant: 'secondary', icon: <Clock className="h-3 w-3" /> },
  scheduled: { label: 'Scheduled', variant: 'outline', icon: <Clock className="h-3 w-3" /> },
  sending: { label: 'Sending', variant: 'default', icon: <Radio className="h-3 w-3 animate-pulse" /> },
  paused: { label: 'Paused', variant: 'outline', icon: <Pause className="h-3 w-3" /> },
  completed: { label: 'Completed', variant: 'secondary', icon: <CheckCircle className="h-3 w-3" /> },
  cancelled: { label: 'Cancelled', variant: 'destructive', icon: <StopCircle className="h-3 w-3" /> },
  failed: { label: 'Failed', variant: 'destructive', icon: <XCircle className="h-3 w-3" /> },
}

function BroadcastCard({ broadcast, onAction }: { broadcast: Broadcast; onAction: (action: string, id: string) => void }) {
  const status = statusConfig[broadcast.status] || statusConfig.draft
  const progress = broadcast.total_recipients > 0
    ? Math.round(((broadcast.sent_count + broadcast.failed_count + broadcast.opted_out_skipped) / broadcast.total_recipients) * 100)
    : 0

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <CardTitle className="text-lg">{broadcast.name}</CardTitle>
            <CardDescription className="text-xs">
              Created {format(new Date(broadcast.created_at), 'MMM d, yyyy h:mm a')}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={status.variant} className="flex items-center gap-1">
              {status.icon}
              {status.label}
            </Badge>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {broadcast.status === 'draft' && (
                  <DropdownMenuItem onClick={() => onAction('send', broadcast.id)}>
                    <Play className="h-4 w-4 mr-2" />
                    Start Sending
                  </DropdownMenuItem>
                )}
                {broadcast.status === 'scheduled' && (
                  <DropdownMenuItem onClick={() => onAction('send', broadcast.id)}>
                    <Play className="h-4 w-4 mr-2" />
                    Send Now
                  </DropdownMenuItem>
                )}
                {broadcast.status === 'sending' && (
                  <DropdownMenuItem onClick={() => onAction('pause', broadcast.id)}>
                    <Pause className="h-4 w-4 mr-2" />
                    Pause
                  </DropdownMenuItem>
                )}
                {broadcast.status === 'paused' && (
                  <DropdownMenuItem onClick={() => onAction('resume', broadcast.id)}>
                    <Play className="h-4 w-4 mr-2" />
                    Resume
                  </DropdownMenuItem>
                )}
                {['draft', 'scheduled', 'sending', 'paused'].includes(broadcast.status) && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => onAction('cancel', broadcast.id)}
                      className="text-amber-600"
                    >
                      <StopCircle className="h-4 w-4 mr-2" />
                      Cancel
                    </DropdownMenuItem>
                  </>
                )}
                {['draft', 'scheduled', 'cancelled', 'failed'].includes(broadcast.status) && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => onAction('delete', broadcast.id)}
                      className="text-red-600"
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-1">
            <Users className="h-4 w-4" />
            <span>{broadcast.total_recipients} recipients</span>
          </div>
          <div className="flex items-center gap-1">
            <MessageSquare className="h-4 w-4" />
            <span>{broadcast.message_template.substring(0, 50)}...</span>
          </div>
        </div>

        {['sending', 'paused', 'completed'].includes(broadcast.status) && (
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Progress</span>
              <span>{progress}%</span>
            </div>
            <Progress value={progress} className="h-2" />
            <div className="grid grid-cols-4 gap-2 text-xs text-center">
              <div className="space-y-1">
                <div className="font-medium text-green-600">{broadcast.sent_count}</div>
                <div className="text-muted-foreground">Sent</div>
              </div>
              <div className="space-y-1">
                <div className="font-medium text-blue-600">{broadcast.delivered_count}</div>
                <div className="text-muted-foreground">Delivered</div>
              </div>
              <div className="space-y-1">
                <div className="font-medium text-red-600">{broadcast.failed_count}</div>
                <div className="text-muted-foreground">Failed</div>
              </div>
              <div className="space-y-1">
                <div className="font-medium text-gray-600">{broadcast.opted_out_skipped}</div>
                <div className="text-muted-foreground">Skipped</div>
              </div>
            </div>
          </div>
        )}

        {broadcast.scheduled_at && broadcast.status === 'scheduled' && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock className="h-4 w-4" />
            <span>Scheduled for {format(new Date(broadcast.scheduled_at), 'MMM d, yyyy h:mm a')}</span>
          </div>
        )}

        {broadcast.phone_numbers && (
          <div className="text-xs text-muted-foreground">
            From: {broadcast.phone_numbers.friendly_name || broadcast.phone_numbers.number}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function BroadcastListSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {[1, 2, 3].map((i) => (
        <Card key={i}>
          <CardHeader>
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-2 w-full" />
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

export default function BroadcastsPage() {
  const [activeTab, setActiveTab] = useState('all')
  const [showWizard, setShowWizard] = useState(false)
  const [confirmDialog, setConfirmDialog] = useState<{ action: string; id: string } | null>(null)

  const { limits } = useBilling()
  const hasBroadcastAccess = limits?.features?.sms_broadcasts ?? false

  const statusFilter = activeTab === 'all' ? undefined : activeTab
  const { data, isLoading, error } = useBroadcasts({ status: statusFilter })

  const deleteMutation = useDeleteBroadcast()
  const sendMutation = useSendBroadcast()
  const pauseMutation = usePauseBroadcast()
  const resumeMutation = useResumeBroadcast()
  const cancelMutation = useCancelBroadcast()

  const handleAction = (action: string, id: string) => {
    if (['delete', 'cancel'].includes(action)) {
      setConfirmDialog({ action, id })
    } else if (action === 'send') {
      sendMutation.mutate(id)
    } else if (action === 'pause') {
      pauseMutation.mutate(id)
    } else if (action === 'resume') {
      resumeMutation.mutate(id)
    }
  }

  const handleConfirmAction = () => {
    if (!confirmDialog) return

    if (confirmDialog.action === 'delete') {
      deleteMutation.mutate(confirmDialog.id)
    } else if (confirmDialog.action === 'cancel') {
      cancelMutation.mutate(confirmDialog.id)
    }

    setConfirmDialog(null)
  }

  // Feature gating
  if (!hasBroadcastAccess) {
    return (
      <div className="container mx-auto py-8">
        <Card className="max-w-2xl mx-auto">
          <CardHeader className="text-center">
            <AlertCircle className="h-12 w-12 mx-auto text-amber-500 mb-4" />
            <CardTitle>SMS Broadcasts</CardTitle>
            <CardDescription>
              Send bulk SMS messages to multiple recipients with template support and delivery tracking.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <p className="text-muted-foreground">
              SMS Broadcasts are available on Professional and Enterprise plans.
              Upgrade your plan to unlock this feature.
            </p>
            <Button asChild>
              <a href="/dashboard/settings?tab=billing">Upgrade Plan</a>
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="container mx-auto py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">SMS Broadcasts</h1>
          <p className="text-muted-foreground">
            Send bulk SMS messages to multiple recipients
          </p>
        </div>
        <Button onClick={() => setShowWizard(true)}>
          <Plus className="h-4 w-4 mr-2" />
          New Broadcast
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Send className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <div className="text-2xl font-bold">
                  {data?.broadcasts?.filter((b: Broadcast) => b.status === 'sending').length || 0}
                </div>
                <div className="text-sm text-muted-foreground">Active</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-2 bg-green-100 rounded-lg">
                <CheckCircle className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <div className="text-2xl font-bold">
                  {data?.broadcasts?.filter((b: Broadcast) => b.status === 'completed').length || 0}
                </div>
                <div className="text-sm text-muted-foreground">Completed</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-2 bg-gray-100 rounded-lg">
                <Clock className="h-5 w-5 text-gray-600" />
              </div>
              <div>
                <div className="text-2xl font-bold">
                  {data?.broadcasts?.filter((b: Broadcast) => b.status === 'scheduled').length || 0}
                </div>
                <div className="text-sm text-muted-foreground">Scheduled</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-2 bg-purple-100 rounded-lg">
                <Users className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <div className="text-2xl font-bold">
                  {data?.broadcasts?.reduce((sum: number, b: Broadcast) => sum + b.total_recipients, 0) || 0}
                </div>
                <div className="text-sm text-muted-foreground">Total Recipients</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Broadcasts List */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="draft">Drafts</TabsTrigger>
          <TabsTrigger value="scheduled">Scheduled</TabsTrigger>
          <TabsTrigger value="sending">Sending</TabsTrigger>
          <TabsTrigger value="completed">Completed</TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="mt-6">
          {isLoading ? (
            <BroadcastListSkeleton />
          ) : error ? (
            <Card>
              <CardContent className="py-8 text-center">
                <AlertCircle className="h-12 w-12 mx-auto text-red-500 mb-4" />
                <p className="text-muted-foreground">Failed to load broadcasts</p>
              </CardContent>
            </Card>
          ) : data?.broadcasts?.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Send className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-2">No broadcasts yet</h3>
                <p className="text-muted-foreground mb-4">
                  Create your first SMS broadcast to reach multiple recipients at once.
                </p>
                <Button onClick={() => setShowWizard(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Broadcast
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {data?.broadcasts?.map((broadcast: Broadcast) => (
                <BroadcastCard
                  key={broadcast.id}
                  broadcast={broadcast}
                  onAction={handleAction}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Create Broadcast Wizard */}
      {showWizard && (
        <BroadcastWizard
          open={showWizard}
          onClose={() => setShowWizard(false)}
        />
      )}

      {/* Confirm Dialog */}
      <AlertDialog open={!!confirmDialog} onOpenChange={() => setConfirmDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmDialog?.action === 'delete' ? 'Delete Broadcast' : 'Cancel Broadcast'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDialog?.action === 'delete'
                ? 'Are you sure you want to delete this broadcast? This action cannot be undone.'
                : 'Are you sure you want to cancel this broadcast? Any unsent messages will not be delivered.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmAction}
              className={confirmDialog?.action === 'delete' ? 'bg-red-600 hover:bg-red-700' : ''}
            >
              {confirmDialog?.action === 'delete' ? 'Delete' : 'Cancel Broadcast'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
