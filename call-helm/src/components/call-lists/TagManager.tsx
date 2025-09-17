'use client'

import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Plus, X, Tag } from 'lucide-react'

interface TagManagerProps {
  tags: string[]
  onTagsChange: (tags: string[]) => void
  campaignType?: string
}

const suggestedTags: Record<string, string[]> = {
  marketing: ['lead', 'prospect', 'cold-call', 'follow-up', 'nurture', 'qualified'],
  sales: ['hot-lead', 'decision-maker', 'opportunity', 'demo', 'closing', 'negotiation'],
  support: ['issue', 'complaint', 'feedback', 'resolution', 'escalation', 'satisfaction'],
  survey: ['research', 'feedback', 'nps', 'satisfaction', 'market-research', 'user-study'],
  other: ['priority', 'vip', 'new', 'returning', 'inactive', 'at-risk']
}

export function TagManager({ tags, onTagsChange, campaignType = 'other' }: TagManagerProps) {
  const [inputValue, setInputValue] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(true)

  const suggestions = suggestedTags[campaignType] || suggestedTags.other
  const availableSuggestions = suggestions.filter(s => !tags.includes(s))

  const handleAddTag = (tag: string) => {
    const normalizedTag = tag.trim().toLowerCase().replace(/\s+/g, '-')
    if (normalizedTag && !tags.includes(normalizedTag)) {
      onTagsChange([...tags, normalizedTag])
    }
    setInputValue('')
  }

  const handleRemoveTag = (tagToRemove: string) => {
    onTagsChange(tags.filter(tag => tag !== tagToRemove))
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && inputValue.trim()) {
      e.preventDefault()
      handleAddTag(inputValue)
    } else if (e.key === 'Backspace' && !inputValue && tags.length > 0) {
      // Remove last tag when backspace is pressed with empty input
      handleRemoveTag(tags[tags.length - 1])
    }
  }

  return (
    <div className="space-y-4">
      {/* Input Section */}
      <div>
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <Tag className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <Input
              placeholder="Add a tag (press Enter)"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              className="pl-10"
            />
          </div>
          <Button
            type="button"
            onClick={() => handleAddTag(inputValue)}
            disabled={!inputValue.trim()}
            size="sm"
          >
            <Plus className="h-4 w-4" />
            Add
          </Button>
        </div>
        <p className="text-xs text-gray-500 mt-1">
          Tags help categorize and filter your call lists
        </p>
      </div>

      {/* Current Tags */}
      {tags.length > 0 && (
        <div>
          <p className="text-sm font-medium text-gray-700 mb-2">Current Tags</p>
          <div className="flex flex-wrap gap-2">
            {tags.map(tag => (
              <Badge
                key={tag}
                variant="default"
                className="pl-2 pr-1 py-1 flex items-center gap-1"
              >
                <span>{tag}</span>
                <button
                  onClick={() => handleRemoveTag(tag)}
                  className="ml-1 hover:bg-white/20 rounded p-0.5"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Suggested Tags */}
      {showSuggestions && availableSuggestions.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium text-gray-700">
              Suggested Tags for {campaignType.charAt(0).toUpperCase() + campaignType.slice(1)}
            </p>
            <button
              onClick={() => setShowSuggestions(false)}
              className="text-xs text-gray-500 hover:text-gray-700"
            >
              Hide suggestions
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {availableSuggestions.map(suggestion => (
              <Badge
                key={suggestion}
                variant="outline"
                className="cursor-pointer hover:bg-gray-100"
                onClick={() => handleAddTag(suggestion)}
              >
                <Plus className="h-3 w-3 mr-1" />
                {suggestion}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {!showSuggestions && (
        <button
          onClick={() => setShowSuggestions(true)}
          className="text-sm text-primary hover:underline"
        >
          Show suggested tags
        </button>
      )}

      {/* Tag Guidelines */}
      <div className="bg-gray-50 rounded-lg p-3">
        <h4 className="text-xs font-medium text-gray-700 mb-1">Tag Guidelines</h4>
        <ul className="text-xs text-gray-600 space-y-0.5">
          <li>• Use lowercase letters and hyphens</li>
          <li>• Keep tags short and descriptive</li>
          <li>• Use consistent naming conventions</li>
          <li>• Tags are searchable and filterable</li>
        </ul>
      </div>
    </div>
  )
}