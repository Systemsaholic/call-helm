'use client'

import { useState, useRef } from 'react'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Sparkles,
  RefreshCw,
  Copy,
  Check,
  Edit2,
  Save,
  X,
  Plus,
  Trash2,
  Loader2,
  AlertCircle,
  Lock,
  ChevronDown,
  Code2
} from 'lucide-react'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { TEMPLATE_VARIABLES, formatVariable } from '@/lib/utils/scriptTemplate'

interface ScriptGeneratorProps {
  campaignType: string
  campaignName: string
  description?: string
  tags: string[]
  onScriptGenerated: (script: string) => void
  script: string
}

// Templates removed - we only use AI generation now
// If you need templates, they should be stored in the database as examples

export function ScriptGenerator({ 
  campaignType, 
  campaignName,
  description,
  tags,
  onScriptGenerated,
  script
}: ScriptGeneratorProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editedScript, setEditedScript] = useState(script)
  const [copied, setCopied] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [showUpgradeMessage, setShowUpgradeMessage] = useState(false)
  const [variablePopoverOpen, setVariablePopoverOpen] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Insert a variable at the cursor position in the textarea
  const insertVariable = (variableKey: string) => {
    const variable = formatVariable(variableKey)
    const textarea = textareaRef.current

    if (textarea) {
      const start = textarea.selectionStart
      const end = textarea.selectionEnd
      const newValue = editedScript.substring(0, start) + variable + editedScript.substring(end)
      setEditedScript(newValue)

      // Set cursor position after the inserted variable
      setTimeout(() => {
        textarea.focus()
        textarea.setSelectionRange(start + variable.length, start + variable.length)
      }, 0)
    } else {
      // If no textarea ref, just append to end
      setEditedScript(editedScript + variable)
    }

    setVariablePopoverOpen(false)
  }
  
  // New state for script generation inputs
  const [callDescription, setCallDescription] = useState('')
  const [keyPoints, setKeyPoints] = useState<string[]>([''])
  const [showInputs, setShowInputs] = useState(!script)
  const [includeScenarios, setIncludeScenarios] = useState(true) // Default to true for better scripts

  const addKeyPoint = () => {
    setKeyPoints([...keyPoints, ''])
  }

  const removeKeyPoint = (index: number) => {
    if (keyPoints.length > 1) {
      setKeyPoints(keyPoints.filter((_, i) => i !== index))
    }
  }

  const updateKeyPoint = (index: number, value: string) => {
    const updated = [...keyPoints]
    updated[index] = value
    setKeyPoints(updated)
  }

  const generateScript = async () => {
    setIsGenerating(true)
    
    // Prepare key points for the AI
    const validKeyPoints = keyPoints.filter(point => point.trim() !== '')
    
    // Determine tone based on campaign type and tags
    let tone = 'professional'
    if (tags.includes('vip') || tags.includes('priority')) {
      tone = 'formal'
    } else if (campaignType === 'support') {
      tone = 'empathetic'
    } else if (campaignType === 'marketing') {
      tone = 'friendly'
    }

    // Create a comprehensive prompt for the AI
    const prompt = `Create a professional call script with the following requirements:

${validKeyPoints.length > 0 ? `Key Points to Include:
${validKeyPoints.map((point, index) => `${index + 1}. ${point}`).join('\n')}

` : ''}Tone: ${tone}
Language: en
${includeScenarios ? 'Include Scenario Branches: Yes' : 'Include Scenario Branches: No'}

Additional Context: ${callDescription || description || `${campaignType} campaign for ${campaignName}`}`

    let response: Response | undefined
    
    try {
      // Call the AI API endpoint
      response = await fetch('/api/ai/generate-script', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt,
          tone,
          maxLength: includeScenarios ? 500 : 300, // Allow more tokens for scenarios
          campaignType,
          includeScenarios,
        }),
      })

      if (!response.ok) {
        if (response.status === 402) {
          setShowUpgradeMessage(true)
          setShowInputs(true)
          return
        }
        throw new Error('Failed to generate script')
      }

      const result = await response.json()
      
      // Add any special tags or headers
      let finalScript = result.script
      
      if (tags.includes('vip') || tags.includes('priority')) {
        finalScript = 'VIP Customer Alert: Provide premium service\n\n' + finalScript
      }
      
      if (callDescription) {
        finalScript = `Call Purpose: ${callDescription}\n\n${finalScript}`
      }
      
      // Add key points reminder at the bottom if they exist
      if (validKeyPoints.length > 0) {
        const keyPointsReminder = '\n\nKEY POINTS TO COVER:\n' + 
          validKeyPoints.map((point, index) => `${index + 1}. ${point}`).join('\n')
        finalScript = finalScript + keyPointsReminder
        
        // Also store key points as metadata for later AI analysis
        const scriptMetadata = {
          script: finalScript,
          keyPoints: validKeyPoints,
          tone,
          campaignType,
          includeScenarios,
          generatedAt: new Date().toISOString()
        }
        
        // Store in localStorage or pass to parent component
        localStorage.setItem('lastGeneratedScript', JSON.stringify(scriptMetadata))
      }
      
      onScriptGenerated(finalScript)
      setEditedScript(finalScript)
      setShowInputs(false)
    } catch (error: any) {
      console.error('AI generation failed:', error)
      
      // Check if it's a payment/quota issue
      if (error.message?.includes('402') || error.message?.includes('Payment')) {
        setShowUpgradeMessage(true)
      } else {
        // Show error message to user for other errors
        let errorMessage = 'Failed to generate script. '
        
        if (error.message?.includes('network')) {
          errorMessage += 'Network error. Please check your connection and try again.'
        } else {
          errorMessage += 'Please try again in a few moments.'
        }
        
        alert(errorMessage)
      }
      
      // Keep the form open so user can try again
      setShowInputs(true)
    } finally {
      setIsGenerating(false)
    }
  }

  const handleSaveEdit = () => {
    onScriptGenerated(editedScript)
    setIsEditing(false)
  }

  const handleCancelEdit = () => {
    setEditedScript(script)
    setIsEditing(false)
  }

  const copyToClipboard = () => {
    navigator.clipboard.writeText(script)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (showInputs) {
    return (
      <div className="space-y-6">
        {/* Upgrade Message */}
        {showUpgradeMessage && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-6">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0">
                <Lock className="h-6 w-6 text-amber-600" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-amber-900 mb-2">
                  AI Script Generation Requires Upgrade
                </h3>
                <p className="text-sm text-amber-800 mb-4">
                  AI-powered script generation is a premium feature available on Professional and Enterprise plans.
                  Upgrade your plan to access unlimited AI script generation and other advanced features.
                </p>
                <div className="flex gap-3">
                  <Button
                    onClick={() => window.location.href = '/dashboard/settings?tab=billing'}
                    className="bg-amber-600 hover:bg-amber-700"
                  >
                    Upgrade Plan
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setShowUpgradeMessage(false)}
                  >
                    Continue Without AI
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="border rounded-lg p-6">
          <div className="mb-6">
            <Sparkles className="h-8 w-8 text-blue-600 mb-3" />
            <h3 className="font-semibold text-gray-900 mb-2">
              Generate Call Script
            </h3>
            <p className="text-sm text-gray-600">
              Provide details about your call to generate a customized script
            </p>
          </div>

          <div className="space-y-4">
            {/* Call Description */}
            <div>
              <Label htmlFor="call-description" className="text-sm font-medium">
                Call Purpose - What is this call about? *
              </Label>
              <Textarea
                id="call-description"
                value={callDescription}
                onChange={(e) => setCallDescription(e.target.value)}
                placeholder="e.g., 'Propose to book their next vacation during this Caribbean Sale', 'Schedule a demo for our inventory management software', 'Follow up on their interest in our premium package'"
                className="mt-1"
                rows={3}
              />
              <p className="text-xs text-gray-500 mt-1">
                Be specific - this will be the main focus of your script
              </p>
            </div>

            {/* Key Points */}
            <div>
              <Label className="text-sm font-medium">
                Key points that MUST be covered
              </Label>
              <div className="mt-2 space-y-2">
                {keyPoints.map((point, index) => (
                  <div key={index} className="flex gap-2">
                    <Input
                      value={point}
                      onChange={(e) => updateKeyPoint(index, e.target.value)}
                      placeholder={`Key point ${index + 1}...`}
                      className="flex-1"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => removeKeyPoint(index)}
                      disabled={keyPoints.length === 1}
                      className="px-3"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={addKeyPoint}
                className="mt-2"
              >
                <Plus className="h-4 w-4 mr-1" />
                Add Key Point
              </Button>
              <p className="text-xs text-gray-500 mt-1">
                Important topics or information that must be discussed during the call
              </p>
            </div>

            {/* Scenario Branching Toggle */}
            <div className="flex items-start space-x-3 p-4 bg-gray-50 rounded-lg">
              <Checkbox
                id="include-scenarios"
                checked={includeScenarios}
                onCheckedChange={(checked) => setIncludeScenarios(checked as boolean)}
              />
              <div className="flex-1">
                <Label
                  htmlFor="include-scenarios"
                  className="text-sm font-medium cursor-pointer"
                >
                  Include scenario branches
                </Label>
                <p className="text-xs text-gray-600 mt-1">
                  Generate multiple response paths for different customer reactions (e.g., objections, questions, interest levels)
                </p>
              </div>
            </div>
          </div>

          <div className="mt-6 flex gap-3">
            <Button 
              onClick={generateScript}
              disabled={!callDescription.trim() || isGenerating}
              className="flex-1"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Generating AI Script...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Generate Script
                </>
              )}
            </Button>
            {script && (
              <Button 
                variant="outline"
                onClick={() => setShowInputs(false)}
              >
                Cancel
              </Button>
            )}
          </div>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="text-sm text-blue-900">
            <strong>Script will be customized for:</strong>
            <br />
            • Campaign Type: <Badge variant="secondary" className="mx-1">{campaignType}</Badge>
            {tags.length > 0 && (
              <>
                <br />
                • Tags: {tags.slice(0, 3).map(tag => (
                  <Badge key={tag} variant="outline" className="mx-1">
                    {tag}
                  </Badge>
                ))}
                {tags.length > 3 && <span className="text-xs"> and {tags.length - 3} more</span>}
              </>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Script Display/Edit Area */}
      <div className="border rounded-lg">
        <div className="bg-gray-50 px-4 py-2 border-b flex items-center justify-between">
          <span className="text-sm font-medium text-gray-700">
            Generated Script
          </span>
          <div className="flex items-center gap-2">
            {!isEditing ? (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsEditing(true)}
                >
                  <Edit2 className="h-4 w-4 mr-1" />
                  Edit
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={copyToClipboard}
                >
                  {copied ? (
                    <>
                      <Check className="h-4 w-4 mr-1 text-green-600" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4 mr-1" />
                      Copy
                    </>
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowInputs(true)}
                >
                  <RefreshCw className="h-4 w-4 mr-1" />
                  Regenerate
                </Button>
              </>
            ) : (
              <>
                <Popover open={variablePopoverOpen} onOpenChange={setVariablePopoverOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm">
                      <Code2 className="h-4 w-4 mr-1" />
                      Insert Variable
                      <ChevronDown className="h-3 w-3 ml-1" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-80 p-0" align="start">
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
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleSaveEdit}
                >
                  <Save className="h-4 w-4 mr-1" />
                  Save
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleCancelEdit}
                >
                  <X className="h-4 w-4 mr-1" />
                  Cancel
                </Button>
              </>
            )}
          </div>
        </div>
        
        <div className="p-4">
          {isEditing ? (
            <Textarea
              ref={textareaRef}
              value={editedScript}
              onChange={(e) => setEditedScript(e.target.value)}
              className="min-h-[300px] font-mono text-sm"
              placeholder="Edit your call script..."
            />
          ) : (
            <div className="whitespace-pre-wrap font-mono text-sm text-gray-700 min-h-[300px]">
              {script}
            </div>
          )}
        </div>
      </div>

      {/* Script Variables Info */}
      <div className="bg-gray-50 rounded-lg p-3">
        <h4 className="text-xs font-medium text-gray-700 mb-2">Script Variables</h4>
        <p className="text-xs text-gray-600 mb-2">
          Variables will be replaced with actual values during calls. Use the Insert Variable button while editing to add them.
        </p>
        <div className="flex flex-wrap gap-2">
          {[
            '{{contact.name}}',
            '{{contact.first_name}}',
            '{{agent.name}}',
            '{{organization.name}}',
            '{{date.today}}'
          ].map(variable => (
            <code key={variable} className="bg-white px-2 py-1 rounded text-xs">
              {variable}
            </code>
          ))}
        </div>
        <p className="text-xs text-gray-500 mt-2">
          Add fallbacks: <code className="bg-white px-1 rounded">{'{{contact.first_name::friend}}'}</code> uses "friend" if name is unknown
        </p>
      </div>
    </div>
  )
}