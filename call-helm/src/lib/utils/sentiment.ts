// Sentiment utilities for displaying mood icons and colors

export type MoodSentiment = 
  | 'happy' 
  | 'satisfied' 
  | 'neutral' 
  | 'frustrated' 
  | 'angry' 
  | 'sad' 
  | 'confused' 
  | 'excited'

export type SatisfactionLevel = 
  | 'very_satisfied' 
  | 'satisfied' 
  | 'neutral' 
  | 'dissatisfied' 
  | 'very_dissatisfied'

export interface SentimentInfo {
  emoji: string
  color: string
  bgColor: string
  label: string
  description: string
}

export const getSentimentInfo = (sentiment?: string | null): SentimentInfo => {
  switch (sentiment) {
    case 'happy':
      return {
        emoji: '😊',
        color: 'text-green-600',
        bgColor: 'bg-green-100',
        label: 'Happy',
        description: 'Customer is pleased'
      }
    
    case 'satisfied':
      return {
        emoji: '😌',
        color: 'text-emerald-600',
        bgColor: 'bg-emerald-100',
        label: 'Satisfied',
        description: 'Customer is content'
      }
    
    case 'neutral':
      return {
        emoji: '😐',
        color: 'text-gray-600',
        bgColor: 'bg-gray-100',
        label: 'Neutral',
        description: 'No strong emotion'
      }
    
    case 'frustrated':
      return {
        emoji: '😤',
        color: 'text-orange-600',
        bgColor: 'bg-orange-100',
        label: 'Frustrated',
        description: 'Customer is annoyed'
      }
    
    case 'angry':
      return {
        emoji: '😠',
        color: 'text-red-600',
        bgColor: 'bg-red-100',
        label: 'Angry',
        description: 'Customer is upset'
      }
    
    case 'sad':
      return {
        emoji: '😔',
        color: 'text-blue-600',
        bgColor: 'bg-blue-100',
        label: 'Sad',
        description: 'Customer is disappointed'
      }
    
    case 'confused':
      return {
        emoji: '😕',
        color: 'text-purple-600',
        bgColor: 'bg-purple-100',
        label: 'Confused',
        description: 'Customer needs clarification'
      }
    
    case 'excited':
      return {
        emoji: '🤩',
        color: 'text-pink-600',
        bgColor: 'bg-pink-100',
        label: 'Excited',
        description: 'Customer is enthusiastic'
      }
    
    default:
      return {
        emoji: '—',
        color: 'text-gray-400',
        bgColor: 'bg-gray-50',
        label: 'Unknown',
        description: 'Not analyzed'
      }
  }
}

export const getSatisfactionInfo = (level?: string | null) => {
  switch (level) {
    case 'very_satisfied':
      return {
        emoji: '⭐⭐⭐⭐⭐',
        color: 'text-green-600',
        label: 'Very Satisfied'
      }
    case 'satisfied':
      return {
        emoji: '⭐⭐⭐⭐',
        color: 'text-emerald-600',
        label: 'Satisfied'
      }
    case 'neutral':
      return {
        emoji: '⭐⭐⭐',
        color: 'text-gray-600',
        label: 'Neutral'
      }
    case 'dissatisfied':
      return {
        emoji: '⭐⭐',
        color: 'text-orange-600',
        label: 'Dissatisfied'
      }
    case 'very_dissatisfied':
      return {
        emoji: '⭐',
        color: 'text-red-600',
        label: 'Very Dissatisfied'
      }
    default:
      return {
        emoji: '—',
        color: 'text-gray-400',
        label: 'Not Rated'
      }
  }
}

// Helper to determine if sentiment needs attention
export const needsAttention = (sentiment?: string | null): boolean => {
  return sentiment === 'angry' || sentiment === 'frustrated' || sentiment === 'sad'
}

// Helper to get sentiment trend icon
export const getSentimentTrend = (current?: string, previous?: string) => {
  const sentimentScore: Record<string, number> = {
    'excited': 5,
    'happy': 4,
    'satisfied': 3,
    'neutral': 2,
    'confused': 1,
    'frustrated': 0,
    'sad': -1,
    'angry': -2
  }
  
  const currentScore = sentimentScore[current || ''] ?? 2
  const previousScore = sentimentScore[previous || ''] ?? 2
  
  if (currentScore > previousScore) {
    return { icon: '↗️', color: 'text-green-500', label: 'Improving' }
  } else if (currentScore < previousScore) {
    return { icon: '↘️', color: 'text-red-500', label: 'Declining' }
  } else {
    return { icon: '→', color: 'text-gray-500', label: 'Stable' }
  }
}