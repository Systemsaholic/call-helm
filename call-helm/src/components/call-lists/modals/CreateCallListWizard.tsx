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
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { 
  Upload, 
  FileSpreadsheet, 
  Users,
  ChevronRight, 
  ChevronLeft,
  Tag,
  FileText,
  Sparkles,
  CheckCircle,
  AlertCircle,
  X
} from 'lucide-react'
import { useCreateCallList, type CallListInput } from '@/lib/hooks/useCallLists'
import { useContacts, useImportContacts, type ContactInput } from '@/lib/hooks/useContacts'
import { CSVUploader } from '../CSVUploader'
import { ContactSelector } from '../ContactSelector'
import { TagManager } from '../TagManager'
import { ScriptGenerator } from '../ScriptGenerator'

interface CreateCallListWizardProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

type WizardStep = 'method' | 'contacts' | 'details' | 'tags' | 'script' | 'review'

export function CreateCallListWizard({ open, onOpenChange }: CreateCallListWizardProps) {
  const createCallList = useCreateCallList()
  const importContacts = useImportContacts()
  const { data: existingContacts } = useContacts()
  
  const [currentStep, setCurrentStep] = useState<WizardStep>('method')
  const [method, setMethod] = useState<'upload' | 'select' | null>(null)
  const [uploadedContacts, setUploadedContacts] = useState<any[]>([])
  const [importedContactIds, setImportedContactIds] = useState<string[]>([])
  const [selectedContactIds, setSelectedContactIds] = useState<string[]>([])
  const [tags, setTags] = useState<string[]>([])
  const [generatedScript, setGeneratedScript] = useState<string>('')
  const [isImporting, setIsImporting] = useState(false)
  
  const [formData, setFormData] = useState<Partial<CallListInput> & { 
    name: string 
    distribution_strategy: 'manual' | 'round_robin' | 'load_based' | 'skill_based'
  }>({
    name: '',
    description: '',
    campaign_type: 'marketing',
    priority: 2,
    status: 'draft',
    distribution_strategy: 'round_robin',
    max_attempts_per_contact: 3,
    daily_start_time: '09:00',
    daily_end_time: '17:00',
    timezone: 'America/Los_Angeles',
    active_days: [1, 2, 3, 4, 5],
  })

  const steps: { id: WizardStep; label: string; icon: React.ReactNode }[] = [
    { id: 'method', label: 'Choose Method', icon: <Users className="h-4 w-4" /> },
    { id: 'contacts', label: 'Add Contacts', icon: <FileSpreadsheet className="h-4 w-4" /> },
    { id: 'details', label: 'List Details', icon: <FileText className="h-4 w-4" /> },
    { id: 'tags', label: 'Add Tags', icon: <Tag className="h-4 w-4" /> },
    { id: 'script', label: 'Generate Script', icon: <Sparkles className="h-4 w-4" /> },
    { id: 'review', label: 'Review & Create', icon: <CheckCircle className="h-4 w-4" /> },
  ]

  const currentStepIndex = steps.findIndex(s => s.id === currentStep)
  const progress = ((currentStepIndex + 1) / steps.length) * 100

  const handleNext = () => {
    const stepOrder: WizardStep[] = ['method', 'contacts', 'details', 'tags', 'script', 'review']
    const currentIndex = stepOrder.indexOf(currentStep)
    if (currentIndex < stepOrder.length - 1) {
      setCurrentStep(stepOrder[currentIndex + 1])
    }
  }

  const handleBack = () => {
    const stepOrder: WizardStep[] = ['method', 'contacts', 'details', 'tags', 'script', 'review']
    const currentIndex = stepOrder.indexOf(currentStep)
    if (currentIndex > 0) {
      setCurrentStep(stepOrder[currentIndex - 1])
    }
  }

  const handleCreate = async () => {
    try {
      setIsImporting(true)
      
      let contactIds: string[] = []
      
      // If uploading from CSV, first import the contacts to database
      if (method === 'upload' && uploadedContacts.length > 0) {
        // Convert uploaded contacts to ContactInput format
        const contactsToImport: ContactInput[] = uploadedContacts.map(contact => ({
          full_name: contact.name || 'Unknown',
          phone_number: contact.phone || '',
          email: contact.email,
          company: contact.company,
          notes: contact.notes,
          tags: contact.tags || [],
        }))
        
        // Import contacts to database
        const importedContacts = await importContacts.mutateAsync(contactsToImport)
        contactIds = importedContacts.map(c => c.id)
        setImportedContactIds(contactIds)
      } else if (method === 'select') {
        contactIds = selectedContactIds
      }

      // Create call list with real contact IDs
      await createCallList.mutateAsync(
        {
          ...formData,
          tags,
          script_template: generatedScript,
          contact_ids: contactIds,
        },
        {
          onSuccess: () => {
            onOpenChange(false)
            // Reset state
            setCurrentStep('method')
            setMethod(null)
            setUploadedContacts([])
            setImportedContactIds([])
            setSelectedContactIds([])
            setTags([])
            setGeneratedScript('')
            setIsImporting(false)
            setFormData({
              name: '',
              description: '',
              campaign_type: 'marketing',
              priority: 2,
              status: 'draft',
              distribution_strategy: 'round_robin',
              max_attempts_per_contact: 3,
              daily_start_time: '09:00',
              daily_end_time: '17:00',
              timezone: 'America/Los_Angeles',
              active_days: [1, 2, 3, 4, 5],
            })
          },
        }
      )
    } catch (error) {
      console.error('Failed to create call list:', error)
      setIsImporting(false)
    }
  }

  const renderStepContent = () => {
    switch (currentStep) {
      case 'method':
        return (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Choose how you want to add contacts to your call list
            </p>
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={() => setMethod('upload')}
                className={`p-6 border-2 rounded-lg transition-all ${
                  method === 'upload'
                    ? 'border-primary bg-primary/5'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <Upload className="h-8 w-8 mb-3 mx-auto text-primary" />
                <h3 className="font-medium mb-1">Upload CSV</h3>
                <p className="text-xs text-gray-600">
                  Import contacts from a CSV file
                </p>
              </button>
              
              <button
                onClick={() => setMethod('select')}
                className={`p-6 border-2 rounded-lg transition-all ${
                  method === 'select'
                    ? 'border-primary bg-primary/5'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <Users className="h-8 w-8 mb-3 mx-auto text-primary" />
                <h3 className="font-medium mb-1">Select Contacts</h3>
                <p className="text-xs text-gray-600">
                  Choose from existing contacts
                </p>
              </button>
            </div>
          </div>
        )

      case 'contacts':
        return (
          <div className="space-y-4">
            {method === 'upload' ? (
              <CSVUploader
                onUploadComplete={(contacts) => setUploadedContacts(contacts)}
                uploadedContacts={uploadedContacts}
              />
            ) : (
              <ContactSelector
                contacts={existingContacts || []}
                selectedIds={selectedContactIds}
                onSelectionChange={setSelectedContactIds}
              />
            )}
          </div>
        )

      case 'details':
        return (
          <div className="space-y-4">
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
                <Label htmlFor="type">Campaign Type</Label>
                <Select
                  value={formData.campaign_type}
                  onValueChange={(value) => setFormData({ ...formData, campaign_type: value })}
                >
                  <SelectTrigger id="type">
                    <SelectValue placeholder="Select campaign type" />
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
                  onValueChange={(value) => setFormData({ ...formData, priority: Number(value) })}
                >
                  <SelectTrigger id="priority">
                    <SelectValue placeholder="Select priority" />
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
                <Label htmlFor="distribution">Distribution Strategy</Label>
                <Select
                  value={formData.distribution_strategy}
                  onValueChange={(value) => setFormData({ ...formData, distribution_strategy: value as 'manual' | 'round_robin' | 'load_based' | 'skill_based' })}
                >
                  <SelectTrigger id="distribution">
                    <SelectValue placeholder="Select distribution strategy" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manual">Manual Assignment</SelectItem>
                    <SelectItem value="round_robin">Round Robin</SelectItem>
                    <SelectItem value="load_based">Load Based</SelectItem>
                    <SelectItem value="skill_based">Skill Based</SelectItem>
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
          </div>
        )

      case 'tags':
        return (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Add tags to categorize and organize your call list
            </p>
            <TagManager
              tags={tags}
              onTagsChange={setTags}
              campaignType={formData.campaign_type}
            />
          </div>
        )

      case 'script':
        return (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Generate a sample script for your agents based on the campaign details
            </p>
            <ScriptGenerator
              campaignType={formData.campaign_type || 'other'}
              campaignName={formData.name}
              description={formData.description}
              tags={tags}
              onScriptGenerated={setGeneratedScript}
              script={generatedScript}
            />
          </div>
        )

      case 'review':
        const totalContacts = method === 'upload' 
          ? uploadedContacts.length 
          : selectedContactIds.length

        return (
          <div className="space-y-4">
            <div className="bg-gray-50 rounded-lg p-4 space-y-3">
              <h3 className="font-medium text-gray-900">Review Your Call List</h3>
              
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Name:</span>
                  <span className="font-medium">{formData.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Type:</span>
                  <span className="font-medium capitalize">{formData.campaign_type}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Contacts:</span>
                  <span className="font-medium">{totalContacts} contacts</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Distribution:</span>
                  <span className="font-medium capitalize">
                    {formData.distribution_strategy.replace('_', ' ')}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Priority:</span>
                  <Badge variant="outline">
                    P{formData.priority}
                  </Badge>
                </div>
              </div>

              {tags.length > 0 && (
                <div className="pt-2 border-t">
                  <span className="text-sm text-gray-600 block mb-2">Tags:</span>
                  <div className="flex flex-wrap gap-1">
                    {tags.map((tag) => (
                      <Badge key={tag} variant="secondary" className="text-xs">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {generatedScript && (
                <div className="pt-2 border-t">
                  <span className="text-sm text-gray-600 block mb-2">Script:</span>
                  <div className="bg-white p-2 rounded border text-xs text-gray-700 max-h-32 overflow-y-auto">
                    {generatedScript.substring(0, 200)}...
                  </div>
                </div>
              )}
            </div>

            {totalContacts === 0 && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-yellow-600 mt-0.5" />
                <div className="text-sm text-yellow-800">
                  No contacts selected. Please go back and add contacts to your call list.
                </div>
              </div>
            )}
          </div>
        )

      default:
        return null
    }
  }

  const canProceed = () => {
    switch (currentStep) {
      case 'method':
        return method !== null
      case 'contacts':
        return method === 'upload' 
          ? uploadedContacts.length > 0
          : selectedContactIds.length > 0
      case 'details':
        return formData.name.trim() !== ''
      case 'review':
        const hasContacts = method === 'upload' 
          ? uploadedContacts.length > 0
          : selectedContactIds.length > 0
        return hasContacts && formData.name.trim() !== ''
      default:
        return true
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] p-0">
        <DialogHeader className="px-6 py-4 border-b">
          <DialogTitle>Create Call List</DialogTitle>
          <DialogDescription>
            Set up a new call list with contacts, tags, and scripts
          </DialogDescription>
        </DialogHeader>

        {/* Progress Bar */}
        <div className="px-6 py-3 border-b bg-gray-50">
          <Progress value={progress} className="h-2 mb-3" />
          <div className="flex justify-between text-xs">
            {steps.map((step, index) => (
              <div
                key={step.id}
                className={`flex items-center gap-1 ${
                  index <= currentStepIndex
                    ? 'text-primary font-medium'
                    : 'text-gray-400'
                }`}
              >
                {step.icon}
                <span className="hidden sm:inline">{step.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="px-6 py-4 min-h-[300px] max-h-[calc(90vh-250px)] overflow-y-auto">
          {renderStepContent()}
        </div>

        {/* Footer */}
        <DialogFooter className="px-6 py-4 border-t">
          <div className="flex justify-between w-full">
            <Button
              type="button"
              variant="outline"
              onClick={currentStep === 'method' ? () => onOpenChange(false) : handleBack}
            >
              {currentStep === 'method' ? 'Cancel' : (
                <>
                  <ChevronLeft className="h-4 w-4 mr-2" />
                  Back
                </>
              )}
            </Button>

            {currentStep === 'review' ? (
              <Button
                onClick={handleCreate}
                disabled={!canProceed() || createCallList.isPending || isImporting}
              >
                {isImporting ? 'Importing Contacts...' : createCallList.isPending ? 'Creating...' : 'Create Call List'}
              </Button>
            ) : (
              <Button
                onClick={handleNext}
                disabled={!canProceed()}
              >
                Next
                <ChevronRight className="h-4 w-4 ml-2" />
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}