'use client'

import { useState } from 'react'
import { 
  Brain, TrendingUp, TrendingDown, AlertCircle, CheckCircle, 
  User, Users, Target, MessageSquare, BarChart3, Shield,
  Star, ThumbsUp, ThumbsDown, Clock, Zap, Flag,
  ChevronRight, ChevronDown, Info, Award, AlertTriangle
} from 'lucide-react'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'

interface EnhancedAnalysisViewProps {
  analysis: any
  transcription?: string
}

export function EnhancedAnalysisView({ analysis, transcription }: EnhancedAnalysisViewProps) {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['overview']))
  
  const toggleSection = (section: string) => {
    const newExpanded = new Set(expandedSections)
    if (newExpanded.has(section)) {
      newExpanded.delete(section)
    } else {
      newExpanded.add(section)
    }
    setExpandedSections(newExpanded)
  }
  
  if (!analysis) {
    return (
      <div className="text-center py-8 text-gray-500">
        <Brain className="h-12 w-12 mx-auto mb-3 text-gray-300" />
        <p>No analysis available</p>
      </div>
    )
  }
  
  // Calculate overall health score
  const healthScore = Math.round(
    ((analysis.conversation_quality?.overall_quality_score || 5) * 10 +
     (10 - (analysis.customer_experience?.churn_risk === 'high' ? 10 : 
            analysis.customer_experience?.churn_risk === 'medium' ? 5 : 0)) * 10 +
     (analysis.agent_performance?.question_handling || 5) * 10 +
     (analysis.sentiment_analysis?.customer_sentiment_score || 0) * 50 + 50) / 4
  )
  
  const getHealthColor = (score: number) => {
    if (score >= 80) return 'text-green-600 bg-green-50'
    if (score >= 60) return 'text-yellow-600 bg-yellow-50'
    return 'text-red-600 bg-red-50'
  }
  
  return (
    <div className="space-y-6">
      {/* Executive Summary Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5" />
            Executive Summary
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-600 mb-4">
            {analysis.executive_summary || 'No summary available'}
          </p>
          
          {/* Overall Health Score */}
          <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg">
            <div className="flex-1">
              <p className="text-xs text-gray-500 mb-1">Overall Call Health</p>
              <Progress value={healthScore} className="h-2" />
            </div>
            <div className={cn("px-3 py-1 rounded-full font-semibold", getHealthColor(healthScore))}>
              {healthScore}%
            </div>
          </div>
        </CardContent>
      </Card>
      
      {/* Analysis Tabs */}
      <Tabs defaultValue="metrics" className="w-full">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="metrics">Metrics</TabsTrigger>
          <TabsTrigger value="sentiment">Sentiment</TabsTrigger>
          <TabsTrigger value="quality">Quality</TabsTrigger>
          <TabsTrigger value="intelligence">Intelligence</TabsTrigger>
          <TabsTrigger value="actions">Actions</TabsTrigger>
        </TabsList>
        
        {/* Metrics Tab */}
        <TabsContent value="metrics" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Call Metrics</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-3">
                  <div>
                    <p className="text-xs text-gray-500">Talk Ratio</p>
                    <div className="flex items-center gap-2 mt-1">
                      <div className="flex-1 bg-gray-200 rounded-full h-2 overflow-hidden">
                        <div 
                          className="h-full bg-blue-500"
                          style={{ width: `${analysis.call_metrics?.talk_ratio?.agent || 50}%` }}
                        />
                      </div>
                      <span className="text-xs">
                        {analysis.call_metrics?.talk_ratio?.agent || 50}% Agent
                      </span>
                    </div>
                  </div>
                  
                  <div>
                    <p className="text-xs text-gray-500">Avg Response Time</p>
                    <p className="text-lg font-semibold">
                      {analysis.call_metrics?.average_response_time || 0}s
                    </p>
                  </div>
                  
                  <div>
                    <p className="text-xs text-gray-500">Interruptions</p>
                    <p className="text-lg font-semibold">
                      {analysis.call_metrics?.interruptions || 0}
                    </p>
                  </div>
                </div>
                
                <div className="space-y-3">
                  <div>
                    <p className="text-xs text-gray-500">Words per Minute</p>
                    <div className="space-y-1">
                      <div className="flex justify-between">
                        <span className="text-xs">Agent</span>
                        <span className="text-sm font-medium">
                          {analysis.call_metrics?.words_per_minute?.agent || 0}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-xs">Customer</span>
                        <span className="text-sm font-medium">
                          {analysis.call_metrics?.words_per_minute?.customer || 0}
                        </span>
                      </div>
                    </div>
                  </div>
                  
                  <div>
                    <p className="text-xs text-gray-500">Longest Pause</p>
                    <p className="text-lg font-semibold">
                      {analysis.call_metrics?.longest_pause || 0}s
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
          
          {/* Topics and Entities */}
          {analysis.topics_and_entities && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Topics & Entities</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Main Topics */}
                {analysis.topics_and_entities.main_topics?.length > 0 && (
                  <div>
                    <p className="text-xs text-gray-500 mb-2">Main Topics</p>
                    <div className="flex flex-wrap gap-2">
                      {analysis.topics_and_entities.main_topics.map((topic: any, idx: number) => (
                        <Badge key={idx} variant="secondary">
                          {topic.topic}
                          <span className="ml-1 text-xs opacity-60">
                            {Math.round(topic.confidence * 100)}%
                          </span>
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
                
                {/* Keywords */}
                {analysis.topics_and_entities.keywords?.length > 0 && (
                  <div>
                    <p className="text-xs text-gray-500 mb-2">Key Terms</p>
                    <div className="flex flex-wrap gap-2">
                      {analysis.topics_and_entities.keywords.slice(0, 8).map((kw: any, idx: number) => (
                        <Badge key={idx} variant="outline" className="text-xs">
                          {kw.word}
                          {kw.frequency > 1 && (
                            <span className="ml-1 opacity-60">×{kw.frequency}</span>
                          )}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
                
                {/* Entities */}
                {analysis.topics_and_entities.entities_mentioned && (
                  <div className="grid grid-cols-2 gap-4 text-xs">
                    {analysis.topics_and_entities.entities_mentioned.people?.length > 0 && (
                      <div>
                        <p className="text-gray-500 mb-1">People</p>
                        <p className="font-medium">{analysis.topics_and_entities.entities_mentioned.people.join(', ')}</p>
                      </div>
                    )}
                    {analysis.topics_and_entities.entities_mentioned.organizations?.length > 0 && (
                      <div>
                        <p className="text-gray-500 mb-1">Organizations</p>
                        <p className="font-medium">{analysis.topics_and_entities.entities_mentioned.organizations.join(', ')}</p>
                      </div>
                    )}
                    {analysis.topics_and_entities.entities_mentioned.products?.length > 0 && (
                      <div>
                        <p className="text-gray-500 mb-1">Products</p>
                        <p className="font-medium">{analysis.topics_and_entities.entities_mentioned.products.join(', ')}</p>
                      </div>
                    )}
                    {analysis.topics_and_entities.entities_mentioned.money_amounts?.length > 0 && (
                      <div>
                        <p className="text-gray-500 mb-1">Money</p>
                        <p className="font-medium">{analysis.topics_and_entities.entities_mentioned.money_amounts.join(', ')}</p>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>
        
        {/* Sentiment Tab */}
        <TabsContent value="sentiment" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Sentiment Analysis</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {/* Overall Sentiment */}
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div>
                    <p className="text-xs text-gray-500">Overall Sentiment</p>
                    <p className="font-semibold capitalize">
                      {analysis.sentiment_analysis?.overall_sentiment || 'neutral'}
                    </p>
                  </div>
                  <div className="text-3xl">
                    {analysis.sentiment_analysis?.overall_sentiment === 'positive' ? '😊' :
                     analysis.sentiment_analysis?.overall_sentiment === 'negative' ? '😔' :
                     analysis.sentiment_analysis?.overall_sentiment === 'mixed' ? '😐' : '😶'}
                  </div>
                </div>
                
                {/* Sentiment Scores */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-gray-500 mb-2">Customer Sentiment</p>
                    <div className="flex items-center gap-2">
                      <Progress 
                        value={(analysis.sentiment_analysis?.customer_sentiment_score || 0) * 50 + 50} 
                        className="h-2"
                      />
                      <span className="text-sm font-medium">
                        {analysis.sentiment_analysis?.customer_sentiment_score || 0}
                      </span>
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-2">Agent Sentiment</p>
                    <div className="flex items-center gap-2">
                      <Progress 
                        value={(analysis.sentiment_analysis?.agent_sentiment_score || 0) * 50 + 50} 
                        className="h-2"
                      />
                      <span className="text-sm font-medium">
                        {analysis.sentiment_analysis?.agent_sentiment_score || 0}
                      </span>
                    </div>
                  </div>
                </div>
                
                {/* Emotional Peaks */}
                {analysis.sentiment_analysis?.emotional_peaks?.length > 0 && (
                  <div>
                    <p className="text-xs text-gray-500 mb-2">Emotional Peaks</p>
                    <div className="space-y-2">
                      {analysis.sentiment_analysis.emotional_peaks.map((peak: any, idx: number) => (
                        <div key={idx} className="flex items-start gap-2 text-xs">
                          <Badge variant={peak.emotion === 'positive' ? 'default' : 'destructive'}>
                            {peak.emotion}
                          </Badge>
                          <p className="flex-1 text-gray-600">{peak.text}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
          
          {/* Customer Experience */}
          {analysis.customer_experience && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Customer Experience</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500">Satisfaction Predicted</span>
                    <Badge variant={
                      analysis.customer_experience.satisfaction_predicted?.includes('satisfied') ? 'default' : 
                      analysis.customer_experience.satisfaction_predicted === 'neutral' ? 'secondary' : 'destructive'
                    }>
                      {analysis.customer_experience.satisfaction_predicted}
                    </Badge>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500">Effort Score</span>
                    <span className="text-sm font-medium capitalize">
                      {analysis.customer_experience.effort_score}
                    </span>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500">Churn Risk</span>
                    <Badge variant={
                      analysis.customer_experience.churn_risk === 'low' ? 'default' :
                      analysis.customer_experience.churn_risk === 'medium' ? 'secondary' : 'destructive'
                    }>
                      {analysis.customer_experience.churn_risk}
                    </Badge>
                  </div>
                  
                  {analysis.customer_experience.pain_points?.length > 0 && (
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Pain Points</p>
                      <ul className="space-y-1">
                        {analysis.customer_experience.pain_points.map((point: string, idx: number) => (
                          <li key={idx} className="text-xs text-gray-600 flex items-start">
                            <AlertCircle className="h-3 w-3 mr-1 text-orange-500 mt-0.5" />
                            {point}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
        
        {/* Quality Tab */}
        <TabsContent value="quality" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Conversation Quality</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {['clarity', 'professionalism', 'empathy', 'resolution_effectiveness', 'overall_quality'].map(metric => {
                  const score = analysis.conversation_quality?.[`${metric}_score`] || 0
                  return (
                    <div key={metric} className="flex items-center justify-between">
                      <span className="text-xs text-gray-500 capitalize">
                        {metric.replace(/_/g, ' ')}
                      </span>
                      <div className="flex items-center gap-2">
                        <Progress value={score * 10} className="w-24 h-2" />
                        <span className="text-sm font-medium w-8">{score}/10</span>
                      </div>
                    </div>
                  )
                })}
              </div>
              
              {/* Quality Issues & Highlights */}
              <div className="grid grid-cols-2 gap-4 mt-4">
                {analysis.conversation_quality?.quality_issues?.length > 0 && (
                  <div>
                    <p className="text-xs text-gray-500 mb-2 flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" />
                      Issues
                    </p>
                    <ul className="space-y-1">
                      {analysis.conversation_quality.quality_issues.map((issue: string, idx: number) => (
                        <li key={idx} className="text-xs text-gray-600">• {issue}</li>
                      ))}
                    </ul>
                  </div>
                )}
                
                {analysis.conversation_quality?.quality_highlights?.length > 0 && (
                  <div>
                    <p className="text-xs text-gray-500 mb-2 flex items-center gap-1">
                      <Star className="h-3 w-3" />
                      Highlights
                    </p>
                    <ul className="space-y-1">
                      {analysis.conversation_quality.quality_highlights.map((highlight: string, idx: number) => (
                        <li key={idx} className="text-xs text-gray-600">• {highlight}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
          
          {/* Agent Performance */}
          {analysis.agent_performance && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Agent Performance</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-gray-500">Greeting</p>
                      <Badge variant={
                        analysis.agent_performance.greeting_quality === 'excellent' ? 'default' :
                        analysis.agent_performance.greeting_quality === 'good' ? 'secondary' : 'destructive'
                      }>
                        {analysis.agent_performance.greeting_quality}
                      </Badge>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Closing</p>
                      <Badge variant={
                        analysis.agent_performance.closing_quality === 'excellent' ? 'default' :
                        analysis.agent_performance.closing_quality === 'good' ? 'secondary' : 'destructive'
                      }>
                        {analysis.agent_performance.closing_quality}
                      </Badge>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-gray-500">Question Handling</p>
                      <div className="flex items-center gap-2">
                        <Progress value={analysis.agent_performance.question_handling * 10} className="h-2" />
                        <span className="text-sm">{analysis.agent_performance.question_handling}/10</span>
                      </div>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Product Knowledge</p>
                      <div className="flex items-center gap-2">
                        <Progress value={analysis.agent_performance.product_knowledge * 10} className="h-2" />
                        <span className="text-sm">{analysis.agent_performance.product_knowledge}/10</span>
                      </div>
                    </div>
                  </div>
                  
                  {analysis.agent_performance.coaching_opportunities?.length > 0 && (
                    <div>
                      <p className="text-xs text-gray-500 mb-2">Coaching Opportunities</p>
                      <ul className="space-y-1">
                        {analysis.agent_performance.coaching_opportunities.map((opp: string, idx: number) => (
                          <li key={idx} className="text-xs text-gray-600 flex items-start">
                            <Info className="h-3 w-3 mr-1 text-blue-500 mt-0.5" />
                            {opp}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
        
        {/* Business Intelligence Tab */}
        <TabsContent value="intelligence" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Business Intelligence</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-gray-500">Intent</p>
                    <p className="text-sm font-medium">{analysis.business_intelligence?.intent_detected}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Outcome</p>
                    <Badge variant={
                      analysis.business_intelligence?.outcome === 'successful' ? 'default' :
                      analysis.business_intelligence?.outcome === 'unsuccessful' ? 'destructive' : 'secondary'
                    }>
                      {analysis.business_intelligence?.outcome}
                    </Badge>
                  </div>
                </div>
                
                {analysis.business_intelligence?.opportunities_identified?.length > 0 && (
                  <div>
                    <p className="text-xs text-gray-500 mb-2">Opportunities</p>
                    <ul className="space-y-1">
                      {analysis.business_intelligence.opportunities_identified.map((opp: string, idx: number) => (
                        <li key={idx} className="text-xs text-gray-600 flex items-start">
                          <Zap className="h-3 w-3 mr-1 text-green-500 mt-0.5" />
                          {opp}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                
                {analysis.business_intelligence?.risks_identified?.length > 0 && (
                  <div>
                    <p className="text-xs text-gray-500 mb-2">Risks</p>
                    <ul className="space-y-1">
                      {analysis.business_intelligence.risks_identified.map((risk: string, idx: number) => (
                        <li key={idx} className="text-xs text-gray-600 flex items-start">
                          <AlertTriangle className="h-3 w-3 mr-1 text-red-500 mt-0.5" />
                          {risk}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                
                {analysis.business_intelligence?.competitor_mentions?.length > 0 && (
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Competitors Mentioned</p>
                    <div className="flex flex-wrap gap-1">
                      {analysis.business_intelligence.competitor_mentions.map((comp: string, idx: number) => (
                        <Badge key={idx} variant="outline" className="text-xs">
                          {comp}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
          
          {/* Compliance */}
          {analysis.compliance && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <Shield className="h-4 w-4" />
                  Compliance & Safety
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500">Script Adherence</span>
                    <div className="flex items-center gap-2">
                      <Progress value={analysis.compliance.script_adherence} className="w-20 h-2" />
                      <span className="text-sm">{analysis.compliance.script_adherence}%</span>
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500">PII Detected</span>
                    <Badge variant={analysis.compliance.pii_detected ? 'destructive' : 'default'}>
                      {analysis.compliance.pii_detected ? 'Yes' : 'No'}
                    </Badge>
                  </div>
                  
                  {analysis.compliance.sensitive_topics?.length > 0 && (
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Sensitive Topics</p>
                      <div className="flex flex-wrap gap-1">
                        {analysis.compliance.sensitive_topics.map((topic: string, idx: number) => (
                          <Badge key={idx} variant="destructive" className="text-xs">
                            {topic}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
        
        {/* Actions Tab */}
        <TabsContent value="actions" className="space-y-4">
          {/* Action Items */}
          {analysis.action_items && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Action Items</CardTitle>
              </CardHeader>
              <CardContent>
                {analysis.action_items.follow_up_required && (
                  <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                    <p className="text-sm font-medium text-yellow-800 flex items-center gap-2">
                      <Flag className="h-4 w-4" />
                      Follow-up Required
                      {analysis.action_items.follow_up_date && (
                        <span className="text-xs">- {analysis.action_items.follow_up_date}</span>
                      )}
                    </p>
                  </div>
                )}
                
                {analysis.action_items.agent_tasks?.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs text-gray-500 font-medium">Agent Tasks</p>
                    {analysis.action_items.agent_tasks.map((task: any, idx: number) => (
                      <div key={idx} className="flex items-start gap-2">
                        <CheckCircle className="h-4 w-4 text-gray-400 mt-0.5" />
                        <div className="flex-1">
                          <p className="text-sm">{task.task}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge 
                              variant={task.priority === 'high' ? 'destructive' : 
                                      task.priority === 'medium' ? 'secondary' : 'outline'}
                              className="text-xs"
                            >
                              {task.priority}
                            </Badge>
                            {task.deadline && (
                              <span className="text-xs text-gray-500">Due: {task.deadline}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                
                {analysis.action_items.customer_commitments?.length > 0 && (
                  <div className="space-y-2 mt-4">
                    <p className="text-xs text-gray-500 font-medium">Customer Commitments</p>
                    {analysis.action_items.customer_commitments.map((commit: string, idx: number) => (
                      <div key={idx} className="flex items-start gap-2">
                        <Users className="h-4 w-4 text-gray-400 mt-0.5" />
                        <p className="text-sm">{commit}</p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
          
          {/* AI Recommendations */}
          {analysis.ai_recommendations?.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <Zap className="h-4 w-4" />
                  AI Recommendations
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {analysis.ai_recommendations.map((rec: string, idx: number) => (
                    <li key={idx} className="flex items-start gap-2">
                      <ChevronRight className="h-4 w-4 text-blue-500 mt-0.5" />
                      <p className="text-sm text-gray-600">{rec}</p>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
          
          {/* Coaching Notes */}
          {analysis.coaching_notes && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <Award className="h-4 w-4" />
                  Coaching Notes
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-600">{analysis.coaching_notes}</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}