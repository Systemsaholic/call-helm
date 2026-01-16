'use client'

import { useParams, useRouter } from 'next/navigation'
import { useState, useRef, useEffect } from 'react'
import { useCallList, useUpdateCallList } from '@/lib/hooks/useCallLists'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { ArrowLeft, Save, Code2, ChevronDown, Loader2 } from 'lucide-react'
import { TEMPLATE_VARIABLES, formatVariable } from '@/lib/utils/scriptTemplate'

export default function EditCallListPage() {
  const params = useParams()
  const router = useRouter()
  const callListId = params.id as string

  const { data: callList, isLoading } = useCallList(callListId)
  const updateCallList = useUpdateCallList()

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [campaignType, setCampaignType] = useState('marketing')
  const [scriptTemplate, setScriptTemplate] = useState('')
  const [variablePopoverOpen, setVariablePopoverOpen] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Initialize form when data loads
  useEffect(() => {
    if (callList) {
      setName(callList.name || '')
      setDescription(callList.description || '')
      setCampaignType(callList.campaign_type || 'marketing')
      setScriptTemplate(callList.script_template || '')
    }
  }, [callList])

  const insertVariable = (variableKey: string) => {
    const variable = formatVariable(variableKey)
    const textarea = textareaRef.current

    if (textarea) {
      const start = textarea.selectionStart
      const end = textarea.selectionEnd
      const newValue = scriptTemplate.substring(0, start) + variable + scriptTemplate.substring(end)
      setScriptTemplate(newValue)

      setTimeout(() => {
        textarea.focus()
        textarea.setSelectionRange(start + variable.length, start + variable.length)
      }, 0)
    } else {
      setScriptTemplate(scriptTemplate + variable)
    }

    setVariablePopoverOpen(false)
  }

  const handleSave = async () => {
    await updateCallList.mutateAsync({
      id: callListId,
      updates: {
        name,
        description,
        campaign_type: campaignType,
        script_template: scriptTemplate,
      }
    })
    router.push(`/dashboard/call-lists/${callListId}`)
  }

  if (isLoading) {
    return (
      <div className="px-6 lg:px-8 py-6">
        <div className="animate-pulse">
          <div className="h-8 w-48 bg-gray-200 rounded mb-4" />
          <div className="h-4 w-96 bg-gray-200 rounded" />
        </div>
      </div>
    )
  }

  if (!callList) {
    return (
      <div className="px-6 lg:px-8 py-6">
        <div className="text-center">
          <p className="text-muted-foreground">Call list not found</p>
          <Button onClick={() => router.push('/dashboard/call-lists')} className="mt-4">
            Back to Call Lists
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="px-6 lg:px-8 py-6">
      <div className="space-y-6 max-w-3xl">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push(`/dashboard/call-lists/${callListId}`)}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Edit Call List</h1>
            <p className="text-muted-foreground mt-1">
              Update campaign details and call script
            </p>
          </div>
        </div>

        {/* Basic Details Card */}
        <Card>
          <CardHeader>
            <CardTitle>Campaign Details</CardTitle>
            <CardDescription>Basic information about this call list</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Campaign name"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe the purpose of this campaign"
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="campaignType">Campaign Type</Label>
              <Select value={campaignType} onValueChange={setCampaignType}>
                <SelectTrigger>
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="marketing">Marketing</SelectItem>
                  <SelectItem value="sales">Sales</SelectItem>
                  <SelectItem value="support">Support</SelectItem>
                  <SelectItem value="survey">Survey</SelectItem>
                  <SelectItem value="retention">Retention</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Script Card */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Call Script</CardTitle>
                <CardDescription>
                  The script agents will see during calls. Use variables to personalize.
                </CardDescription>
              </div>
              <Popover open={variablePopoverOpen} onOpenChange={setVariablePopoverOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Code2 className="h-4 w-4 mr-1" />
                    Insert Variable
                    <ChevronDown className="h-3 w-3 ml-1" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-80 p-0" align="end">
                  <div className="p-3 border-b bg-gray-50">
                    <h4 className="font-medium text-sm">Insert Variable</h4>
                    <p className="text-xs text-gray-500 mt-1">
                      Click a variable to insert it at the cursor position
                    </p>
                  </div>
                  <div className="max-h-64 overflow-y-auto p-2">
                    {TEMPLATE_VARIABLES.map((category) => (
                      <div key={category.category} className="mb-3 last:mb-0">
                        <div className="text-xs font-medium text-gray-500 px-2 py-1">
                          {category.category}
                        </div>
                        <div className="space-y-1">
                          {category.variables.map((variable) => (
                            <button
                              key={variable.key}
                              onClick={() => insertVariable(variable.key)}
                              className="w-full text-left px-2 py-1.5 rounded hover:bg-gray-100 transition-colors"
                            >
                              <div className="flex items-center justify-between">
                                <span className="text-sm font-medium">{variable.label}</span>
                                <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded text-gray-600">
                                  {`{{${variable.key}}}`}
                                </code>
                              </div>
                              <p className="text-xs text-gray-500 mt-0.5">
                                {variable.description}
                              </p>
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="p-2 border-t bg-gray-50">
                    <p className="text-xs text-gray-500">
                      Tip: Add fallback with <code className="bg-white px-1 rounded">{'{{var::fallback}}'}</code>
                    </p>
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          </CardHeader>
          <CardContent>
            <Textarea
              ref={textareaRef}
              value={scriptTemplate}
              onChange={(e) => setScriptTemplate(e.target.value)}
              placeholder="Enter your call script here. Use {{contact.name}} for personalization."
              rows={12}
              className="font-mono text-sm"
            />
            <p className="text-xs text-gray-500 mt-2">
              Variables like {`{{contact.name}}`} will be replaced with actual values during calls.
            </p>
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <Button
            variant="outline"
            onClick={() => router.push(`/dashboard/call-lists/${callListId}`)}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={updateCallList.isPending || !name.trim()}
          >
            {updateCallList.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                Save Changes
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
