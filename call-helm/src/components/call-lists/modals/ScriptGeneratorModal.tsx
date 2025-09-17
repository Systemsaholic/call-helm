'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Sparkles, X, Plus, Loader2 } from 'lucide-react'
import { useCreateScript, useUpdateScript, useGenerateScript } from '@/lib/hooks/useScripts'
import { toast } from 'sonner'

interface ScriptGeneratorModalProps {
  callListId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  editingScript?: any
}

export function ScriptGeneratorModal({ 
  callListId, 
  open, 
  onOpenChange,
  editingScript 
}: ScriptGeneratorModalProps) {
  const [scriptName, setScriptName] = useState('')
  const [keyPoints, setKeyPoints] = useState<string[]>([''])
  const [tone, setTone] = useState('professional')
  const [language, setLanguage] = useState('en')
  const [context, setContext] = useState('')
  const [generatedContent, setGeneratedContent] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [includeScenarios, setIncludeScenarios] = useState(true)
  
  const createScript = useCreateScript()
  const updateScript = useUpdateScript()
  const generateScript = useGenerateScript()

  useEffect(() => {
    if (editingScript) {
      setScriptName(editingScript.name || '')
      setKeyPoints(editingScript.key_points || [''])
      setTone(editingScript.tone || 'professional')
      setLanguage(editingScript.language || 'en')
      setContext(editingScript.context || '')
      setGeneratedContent(editingScript.content || '')
    } else {
      // Reset form when not editing
      setScriptName('')
      setKeyPoints([''])
      setTone('professional')
      setLanguage('en')
      setContext('')
      setGeneratedContent('')
    }
  }, [editingScript, open])

  const handleAddKeyPoint = () => {
    setKeyPoints([...keyPoints, ''])
  }

  const handleRemoveKeyPoint = (index: number) => {
    setKeyPoints(keyPoints.filter((_, i) => i !== index))
  }

  const handleKeyPointChange = (index: number, value: string) => {
    const updated = [...keyPoints]
    updated[index] = value
    setKeyPoints(updated)
  }

  const handleGenerate = async () => {
    const filteredKeyPoints = keyPoints.filter(kp => kp.trim() !== '')
    
    if (filteredKeyPoints.length === 0) {
      toast.error('Please add at least one key point')
      return
    }

    setIsGenerating(true)
    try {
      const result = await generateScript.mutateAsync({
        keyPoints: filteredKeyPoints,
        tone,
        language,
        context,
        includeScenarios
      })
      
      setGeneratedContent(result.content)
      toast.success('Script generated successfully!')
    } catch (error) {
      console.error('Generation error:', error)
      toast.error('Failed to generate script')
    } finally {
      setIsGenerating(false)
    }
  }

  const handleSave = async () => {
    if (!scriptName.trim()) {
      toast.error('Please enter a script name')
      return
    }
    
    if (!generatedContent.trim()) {
      toast.error('Please generate or enter script content')
      return
    }

    const scriptData = {
      call_list_id: callListId,
      name: scriptName,
      content: generatedContent,
      key_points: keyPoints.filter(kp => kp.trim() !== ''),
      tone,
      language,
      context,
      is_active: !editingScript // New scripts are active by default
    }

    try {
      if (editingScript) {
        await updateScript.mutateAsync({
          id: editingScript.id,
          ...scriptData
        })
        toast.success('Script updated successfully!')
      } else {
        await createScript.mutateAsync(scriptData)
        toast.success('Script created successfully!')
      }
      onOpenChange(false)
    } catch (error) {
      console.error('Save error:', error)
      toast.error('Failed to save script')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {editingScript ? 'Edit Script' : 'Generate AI Script'}
          </DialogTitle>
          <DialogDescription>
            Create a customized script for your call list campaign using AI
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Script Name */}
          <div className="space-y-2">
            <Label htmlFor="scriptName">Script Name</Label>
            <Input
              id="scriptName"
              placeholder="e.g., Product Launch Outreach Script"
              value={scriptName}
              onChange={(e) => setScriptName(e.target.value)}
            />
          </div>

          {/* Key Points */}
          <div className="space-y-2">
            <Label>Key Points to Include</Label>
            <div className="space-y-2">
              {keyPoints.map((point, index) => (
                <div key={index} className="flex gap-2">
                  <Input
                    placeholder="Enter a key point..."
                    value={point}
                    onChange={(e) => handleKeyPointChange(index, e.target.value)}
                  />
                  {keyPoints.length > 1 && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemoveKeyPoint(index)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleAddKeyPoint}
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Key Point
            </Button>
          </div>

          {/* Tone and Language */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="tone">Tone</Label>
              <Select value={tone} onValueChange={setTone}>
                <SelectTrigger id="tone">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="professional">Professional</SelectItem>
                  <SelectItem value="friendly">Friendly</SelectItem>
                  <SelectItem value="casual">Casual</SelectItem>
                  <SelectItem value="formal">Formal</SelectItem>
                  <SelectItem value="enthusiastic">Enthusiastic</SelectItem>
                  <SelectItem value="empathetic">Empathetic</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="language">Language</Label>
              <Select value={language} onValueChange={setLanguage}>
                <SelectTrigger id="language">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="en">English</SelectItem>
                  <SelectItem value="es">Spanish</SelectItem>
                  <SelectItem value="fr">French</SelectItem>
                  <SelectItem value="de">German</SelectItem>
                  <SelectItem value="it">Italian</SelectItem>
                  <SelectItem value="pt">Portuguese</SelectItem>
                  <SelectItem value="zh">Chinese</SelectItem>
                  <SelectItem value="ja">Japanese</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Scenario Branching Toggle */}
          <div className="flex items-start space-x-3 p-4 bg-gray-50 rounded-lg">
            <Checkbox
              id="include-scenarios-modal"
              checked={includeScenarios}
              onCheckedChange={(checked) => setIncludeScenarios(checked as boolean)}
            />
            <div className="flex-1">
              <Label
                htmlFor="include-scenarios-modal"
                className="text-sm font-medium cursor-pointer"
              >
                Include scenario branches
              </Label>
              <p className="text-xs text-gray-600 mt-1">
                Generate multiple response paths for different customer reactions
              </p>
            </div>
          </div>

          {/* Additional Context */}
          <div className="space-y-2">
            <Label htmlFor="context">Call Purpose & Context</Label>
            <Textarea
              id="context"
              placeholder="What is the purpose of this call? (e.g., 'Book Caribbean vacation during special sale', 'Schedule product demo', 'Follow up on quote request')"
              value={context}
              onChange={(e) => setContext(e.target.value)}
              rows={3}
            />
            <p className="text-xs text-muted-foreground">
              Be specific about what you want to achieve with this call
            </p>
          </div>

          {/* Generate Button */}
          <div className="flex justify-center">
            <Button
              onClick={handleGenerate}
              disabled={isGenerating || keyPoints.filter(kp => kp.trim()).length === 0}
              className="w-full sm:w-auto"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Generating Script...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Generate Script
                </>
              )}
            </Button>
          </div>

          {/* Generated Content */}
          {generatedContent && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Generated Script</Label>
                <Badge variant="outline">AI Generated</Badge>
              </div>
              <Textarea
                value={generatedContent}
                onChange={(e) => setGeneratedContent(e.target.value)}
                rows={10}
                placeholder="Your generated script will appear here..."
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                You can edit the generated script before saving
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button 
            onClick={handleSave}
            disabled={!scriptName.trim() || !generatedContent.trim()}
          >
            {editingScript ? 'Update Script' : 'Save Script'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}