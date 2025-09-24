'use client'

import { useState } from 'react'
import { useConfirmation } from '@/lib/hooks/useConfirmation'
import { ConfirmationDialog } from '@/components/ui/confirmation-dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Plus, FileText, Clock, Globe, Volume2, Edit, Trash, Copy, CheckCircle } from 'lucide-react'
import { useScripts, useCreateScript, useUpdateScript, useDeleteScript } from '@/lib/hooks/useScripts'
import { ScriptGeneratorModal } from './modals/ScriptGeneratorModal'
import { format } from 'date-fns'

interface CallListScriptsProps {
  callListId: string
}

export function CallListScripts({ callListId }: CallListScriptsProps) {
  const [showGenerator, setShowGenerator] = useState(false)
  const [editingScript, setEditingScript] = useState<any>(null)
  const [activeScriptId, setActiveScriptId] = useState<string | null>(null)
  const confirmation = useConfirmation()
  
  const { data: scripts, isLoading } = useScripts(callListId)
  const createScript = useCreateScript()
  const updateScript = useUpdateScript()
  const deleteScript = useDeleteScript()

  const activeScripts = scripts?.filter(s => s.is_active) || []
  const archivedScripts = scripts?.filter(s => !s.is_active) || []

  const handleSetActive = async (scriptId: string) => {
    // Deactivate all other scripts
    for (const script of activeScripts) {
      if (script.id !== scriptId) {
        await updateScript.mutateAsync({
          id: script.id,
          is_active: false
        })
      }
    }
    
    // Activate the selected script
    await updateScript.mutateAsync({
      id: scriptId,
      is_active: true
    })
    
    setActiveScriptId(scriptId)
  }

  const handleDelete = async (scriptId: string) => {
    const script = scripts?.find(s => s.id === scriptId)
    confirmation.showConfirmation({
      title: 'Delete Script',
      description: `Are you sure you want to delete "${script?.name || 'this script'}"? This action cannot be undone.`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      variant: 'destructive',
      onConfirm: async () => {
        await deleteScript.mutateAsync(scriptId)
      }
    })
  }

  const handleDuplicate = async (script: any) => {
    await createScript.mutateAsync({
      ...script,
      name: `${script.name} (Copy)`,
      version: (script.version || 1) + 1,
      id: undefined,
      created_at: undefined,
      updated_at: undefined
    })
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="text-center text-muted-foreground">Loading scripts...</div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header Actions */}
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-semibold">Call Scripts</h3>
          <p className="text-sm text-muted-foreground">
            Manage scripts for this call list campaign
          </p>
        </div>
        <Button onClick={() => setShowGenerator(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Generate New Script
        </Button>
      </div>

      {/* Scripts Tabs */}
      <Tabs defaultValue="active">
        <TabsList>
          <TabsTrigger value="active">
            Active Scripts ({activeScripts.length})
          </TabsTrigger>
          <TabsTrigger value="archived">
            Archived ({archivedScripts.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="space-y-4">
          {activeScripts.length > 0 ? (
            activeScripts.map((script) => (
              <Card key={script.id} className={activeScriptId === script.id ? 'ring-2 ring-primary' : ''}>
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-base">{script.name}</CardTitle>
                        {script.is_active && (
                          <Badge variant="default" className="text-xs">
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Active
                          </Badge>
                        )}
                        <Badge variant="outline" className="text-xs">
                          v{script.version || 1}
                        </Badge>
                      </div>
                      <CardDescription className="flex items-center gap-4 text-xs">
                        {script.language && (
                          <span className="flex items-center gap-1">
                            <Globe className="h-3 w-3" />
                            {script.language}
                          </span>
                        )}
                        {script.tone && (
                          <span className="flex items-center gap-1">
                            <Volume2 className="h-3 w-3" />
                            {script.tone}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {format(new Date(script.created_at), 'MMM d, yyyy')}
                        </span>
                      </CardDescription>
                    </div>
                    
                    <div className="flex gap-1">
                      {!script.is_active && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleSetActive(script.id)}
                        >
                          Set Active
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDuplicate(script)}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setEditingScript(script)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(script.id)}
                      >
                        <Trash className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                
                <CardContent>
                  <div className="space-y-4">
                    {script.key_points && script.key_points.length > 0 && (
                      <div>
                        <p className="text-sm font-medium mb-2">Key Points:</p>
                        <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                          {script.key_points.map((point, idx) => (
                            <li key={idx}>{point}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    
                    <div>
                      <p className="text-sm font-medium mb-2">Script Content:</p>
                      <div className="bg-muted p-4 rounded-lg">
                        <pre className="whitespace-pre-wrap text-sm">{script.content}</pre>
                      </div>
                    </div>
                    
                    {script.context && (
                      <div>
                        <p className="text-sm font-medium mb-1">Additional Context:</p>
                        <p className="text-sm text-muted-foreground">{script.context}</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
          ) : (
            <Card>
              <CardContent className="py-8">
                <div className="text-center">
                  <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                  <p className="text-muted-foreground mb-4">No active scripts yet</p>
                  <Button onClick={() => setShowGenerator(true)}>
                    Generate Your First Script
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="archived" className="space-y-4">
          {archivedScripts.length > 0 ? (
            archivedScripts.map((script) => (
              <Card key={script.id} className="opacity-75">
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle className="text-base">{script.name}</CardTitle>
                      <CardDescription>
                        Archived on {format(new Date(script.updated_at), 'MMM d, yyyy')}
                      </CardDescription>
                    </div>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleSetActive(script.id)}
                      >
                        Restore
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(script.id)}
                      >
                        <Trash className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
              </Card>
            ))
          ) : (
            <Card>
              <CardContent className="py-8">
                <div className="text-center text-muted-foreground">
                  No archived scripts
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Script Generator Modal */}
      <ScriptGeneratorModal
        callListId={callListId}
        open={showGenerator || !!editingScript}
        onOpenChange={(open) => {
          if (!open) {
            setShowGenerator(false)
            setEditingScript(null)
          }
        }}
        editingScript={editingScript}
      />

      {/* Confirmation Dialog */}
      <ConfirmationDialog
        isOpen={confirmation.isOpen}
        onClose={confirmation.hideConfirmation}
        onConfirm={confirmation.handleConfirm}
        title={confirmation.title}
        description={confirmation.description}
        confirmText={confirmation.confirmText}
        cancelText={confirmation.cancelText}
        variant={confirmation.variant}
        isLoading={confirmation.isLoading}
      />
    </div>
  )
}