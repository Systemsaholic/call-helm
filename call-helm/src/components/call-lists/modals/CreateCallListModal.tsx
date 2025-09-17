'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Calendar } from '@/components/ui/calendar'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { CalendarIcon } from 'lucide-react'
import { format } from 'date-fns'
import { cn } from '@/lib/utils'
import { useCreateCallList, type CallListInput } from '@/lib/hooks/useCallLists'

interface CreateCallListModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CreateCallListModal({ open, onOpenChange }: CreateCallListModalProps) {
  const createCallList = useCreateCallList()
  const [startDate, setStartDate] = useState<Date>()
  const [endDate, setEndDate] = useState<Date>()
  
  const [formData, setFormData] = useState<Partial<CallListInput> & { 
    name: string 
    distribution_strategy: 'manual' | 'round_robin' | 'load_based' | 'skill_based'
  }>({
    name: '',
    description: '',
    campaign_type: 'marketing',
    priority: 2, // 1=low, 2=medium, 3=high, 4=urgent
    status: 'draft',
    distribution_strategy: 'manual',
    max_attempts_per_contact: 3,
    daily_start_time: '09:00',
    daily_end_time: '17:00',
    timezone: 'America/Los_Angeles',
    active_days: [1, 2, 3, 4, 5], // Monday to Friday
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    
    createCallList.mutate(
      {
        ...formData,
        start_date: startDate?.toISOString(),
        end_date: endDate?.toISOString(),
      },
      {
        onSuccess: () => {
          onOpenChange(false)
          // Reset form
          setFormData({
            name: '',
            description: '',
            campaign_type: 'marketing',
            priority: 2,
            status: 'draft',
            distribution_strategy: 'manual',
            max_attempts_per_contact: 3,
            daily_start_time: '09:00',
            daily_end_time: '17:00',
            timezone: 'America/Los_Angeles',
            active_days: [1, 2, 3, 4, 5],
          })
          setStartDate(undefined)
          setEndDate(undefined)
        },
      }
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Call List</DialogTitle>
          <DialogDescription>
            Create a new call list to organize your contacts for campaigns
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Q4 Sales Campaign"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="type">Type</Label>
              <Select
                value={formData.campaign_type}
                onValueChange={(value: 'marketing' | 'sales' | 'support' | 'survey' | 'other') => 
                  setFormData({ ...formData, campaign_type: value })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="marketing">Marketing</SelectItem>
                  <SelectItem value="sales">Sales</SelectItem>
                  <SelectItem value="support">Support</SelectItem>
                  <SelectItem value="survey">Survey</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="priority">Priority</Label>
              <Select
                value={String(formData.priority)}
                onValueChange={(value) => 
                  setFormData({ ...formData, priority: Number(value) })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Low</SelectItem>
                  <SelectItem value="2">Medium</SelectItem>
                  <SelectItem value="3">High</SelectItem>
                  <SelectItem value="4">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select
                value={formData.status}
                onValueChange={(value: 'draft' | 'active' | 'paused') => 
                  setFormData({ ...formData, status: value })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="paused">Paused</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Describe the purpose and goals of this call list..."
              rows={3}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Start Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !startDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {startDate ? format(startDate, "PPP") : <span>Pick a date</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={startDate}
                    onSelect={setStartDate}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <Label>End Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !endDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {endDate ? format(endDate, "PPP") : <span>Pick a date</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={endDate}
                    onSelect={setEndDate}
                    disabled={(date) => startDate ? date < startDate : false}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          <div className="space-y-4 border-t pt-4">
            <h3 className="font-medium">Distribution Settings</h3>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="distribution_strategy">Distribution Strategy</Label>
                <Select
                  value={formData.distribution_strategy}
                  onValueChange={(value: 'manual' | 'round_robin' | 'load_based' | 'skill_based') => 
                    setFormData({ ...formData, distribution_strategy: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manual">Manual Assignment</SelectItem>
                    <SelectItem value="round_robin">Round Robin</SelectItem>
                    <SelectItem value="load_based">Load Based</SelectItem>
                    <SelectItem value="skill_based">Skill Based</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="max_attempts">Max Attempts</Label>
                <Input
                  id="max_attempts"
                  type="number"
                  min="1"
                  max="10"
                  value={formData.max_attempts_per_contact}
                  onChange={(e) => setFormData({ ...formData, max_attempts_per_contact: parseInt(e.target.value) })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="start_hour">Call Start Time</Label>
                <Input
                  id="start_hour"
                  type="time"
                  value={formData.daily_start_time || '09:00'}
                  onChange={(e) => setFormData({ 
                    ...formData, 
                    daily_start_time: e.target.value
                  })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="end_hour">Call End Time</Label>
                <Input
                  id="end_hour"
                  type="time"
                  value={formData.daily_end_time || '17:00'}
                  onChange={(e) => setFormData({ 
                    ...formData, 
                    daily_end_time: e.target.value
                  })}
                />
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="allow_weekends"
                checked={formData.active_days?.includes(6) || false}
                onChange={(e) => setFormData({ 
                  ...formData, 
                  active_days: e.target.checked 
                    ? [1, 2, 3, 4, 5, 6, 7] // All days
                    : [1, 2, 3, 4, 5] // Weekdays only
                })}
                className="rounded border-gray-300"
              />
              <Label htmlFor="allow_weekends">Allow weekend calls</Label>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createCallList.isPending}>
              {createCallList.isPending ? 'Creating...' : 'Create Call List'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}