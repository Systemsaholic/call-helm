'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Bell,
  BellRing,
  Check,
  CheckCheck,
  Phone,
  Users,
  AlertTriangle,
  Info,
  X,
  Settings,
  PhoneCall
} from 'lucide-react'
import { useNotifications, useCallQueueNotifications, type Notification } from '@/lib/hooks/useNotifications'
import { formatDistanceToNow } from 'date-fns'
import { cn } from '@/lib/utils'

export function NotificationCenter() {
  const { notifications, unreadCount, loading, markAsRead, markAllAsRead, deleteNotification } = useNotifications()
  const { callQueue } = useCallQueueNotifications()
  const [open, setOpen] = useState(false)

  const totalUnread = unreadCount + callQueue.filter(call => call.status === 'pending').length

  const getNotificationIcon = (type: Notification['type'], priority: Notification['priority']) => {
    const iconClass = cn(
      'h-4 w-4',
      priority === 'urgent' ? 'text-red-500' :
      priority === 'high' ? 'text-orange-500' :
      priority === 'normal' ? 'text-blue-500' :
      'text-gray-500'
    )

    switch (type) {
      case 'assignment':
        return <Users className={iconClass} />
      case 'call_ready':
        return <Phone className={iconClass} />
      case 'campaign_status':
        return <Settings className={iconClass} />
      case 'usage_alert':
        return <AlertTriangle className={iconClass} />
      case 'system':
      default:
        return <Info className={iconClass} />
    }
  }

  const getPriorityColor = (priority: Notification['priority']) => {
    switch (priority) {
      case 'urgent': return 'border-l-red-500 bg-red-50'
      case 'high': return 'border-l-amber-500 bg-amber-50'
      case 'normal': return 'border-l-primary bg-primary/5'
      case 'low': return 'border-l-gray-500 bg-gray-50'
      default: return 'border-l-gray-300 bg-white'
    }
  }

  const handleNotificationClick = async (notification: Notification) => {
    if (!notification.read) {
      await markAsRead(notification.id)
    }

    // Handle notification actions based on type and data
    if (notification.type === 'assignment' && notification.data?.call_list_id) {
      window.location.href = `/dashboard/call-board?list=${notification.data.call_list_id}`
    } else if (notification.type === 'campaign_status' && notification.data?.call_list_id) {
      window.location.href = `/dashboard/call-lists/${notification.data.call_list_id}`
    }
  }

  const handleCallQueueClick = (callItem: any) => {
    window.location.href = `/dashboard/call-board?list=${callItem.call_list_id}`
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon" className="relative">
          {totalUnread > 0 ? (
            <BellRing className="h-4 w-4" />
          ) : (
            <Bell className="h-4 w-4" />
          )}
          {totalUnread > 0 && (
            <Badge 
              variant="destructive" 
              className="absolute -top-2 -right-2 h-5 w-5 p-0 text-xs flex items-center justify-center"
            >
              {totalUnread > 99 ? '99+' : totalUnread}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      
      <DropdownMenuContent align="end" className="w-96 max-h-[600px] overflow-y-auto">
        <div className="p-4">
          <div className="flex items-center justify-between">
            <DropdownMenuLabel className="p-0 font-semibold">Notifications</DropdownMenuLabel>
            <div className="flex items-center gap-2">
              {totalUnread > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={markAllAsRead}
                  className="h-6 text-xs"
                >
                  <CheckCheck className="h-3 w-3 mr-1" />
                  Mark all read
                </Button>
              )}
            </div>
          </div>
          {totalUnread > 0 && (
            <p className="text-sm text-gray-600 mt-1">
              {totalUnread} unread notification{totalUnread !== 1 ? 's' : ''}
            </p>
          )}
        </div>

        <DropdownMenuSeparator />

        {/* Call Queue Section */}
        {callQueue.length > 0 && (
          <>
            <div className="px-4 py-2">
              <h4 className="font-medium text-sm text-gray-900 flex items-center gap-2">
                <PhoneCall className="h-4 w-4 text-accent" />
                Call Queue ({callQueue.length})
              </h4>
            </div>
            {callQueue.slice(0, 3).map((call) => (
              <DropdownMenuItem
                key={call.id}
                className="p-0"
                onSelect={() => handleCallQueueClick(call)}
              >
                <div className="w-full p-3 border-l-4 border-l-accent bg-accent/10 hover:bg-accent/20 cursor-pointer transition-colors">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <Phone className="h-4 w-4 text-accent" />
                        <span className="font-medium text-sm text-gray-900">
                          Call {call.contact_name}
                        </span>
                        {call.priority > 0 && (
                          <Badge variant="outline" className="text-xs">
                            Priority {call.priority}
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-gray-700 mt-1">
                        {call.contact_phone} • {call.campaign_name}
                      </p>
                      <p className="text-xs text-gray-600 mt-1">
                        Assigned {formatDistanceToNow(new Date(call.assigned_at), { addSuffix: true })}
                      </p>
                    </div>
                  </div>
                </div>
              </DropdownMenuItem>
            ))}
            {callQueue.length > 3 && (
              <DropdownMenuItem onSelect={() => window.location.href = '/dashboard/call-board'}>
                <div className="w-full text-center text-sm text-gray-600 py-2">
                  View all {callQueue.length} calls
                </div>
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
          </>
        )}

        {/* Regular Notifications */}
        {loading ? (
          <div className="px-4 py-8 text-center text-gray-500">
            Loading notifications...
          </div>
        ) : notifications.length === 0 && callQueue.length === 0 ? (
          <div className="px-4 py-8 text-center text-gray-500">
            <Bell className="h-12 w-12 mx-auto mb-3 text-gray-300" />
            <p className="font-medium">No notifications</p>
            <p className="text-sm">You're all caught up!</p>
          </div>
        ) : (
          <div className="max-h-80 overflow-y-auto">
            {notifications.slice(0, 20).map((notification) => (
              <DropdownMenuItem
                key={notification.id}
                className="p-0"
                onSelect={() => handleNotificationClick(notification)}
              >
                <div className={cn(
                  'w-full p-3 border-l-4 hover:bg-gray-50 cursor-pointer transition-colors',
                  notification.read ? 'bg-white border-l-gray-200' : getPriorityColor(notification.priority)
                )}>
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3 flex-1">
                      <div className="mt-0.5">
                        {getNotificationIcon(notification.type, notification.priority)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h4 className="font-medium text-sm text-gray-900 truncate">
                            {notification.title}
                          </h4>
                          {!notification.read && (
                            <div className="h-2 w-2 bg-blue-500 rounded-full flex-shrink-0" />
                          )}
                        </div>
                        <p className="text-sm text-gray-600 mt-1 line-clamp-2">
                          {notification.message}
                        </p>
                        <p className="text-xs text-gray-500 mt-2">
                          {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 ml-2">
                      {!notification.read && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation()
                            markAsRead(notification.id)
                          }}
                          className="h-6 w-6 p-0 text-gray-400 hover:text-gray-600"
                        >
                          <Check className="h-3 w-3" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation()
                          deleteNotification(notification.id)
                        }}
                        className="h-6 w-6 p-0 text-gray-400 hover:text-red-600"
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </div>
              </DropdownMenuItem>
            ))}
          </div>
        )}

        {notifications.length > 20 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => window.location.href = '/dashboard/notifications'}>
              <div className="w-full text-center text-sm text-blue-600 py-2">
                View all notifications
              </div>
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}