import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import OpenAI from 'openai'

export const dynamic = 'force-dynamic'

// Lazy initialization to avoid build-time errors
function getOpenAI() {
  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
  })
}

/**
 * POST /api/sms/suggestions - Get AI-powered reply suggestions
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { conversation_id, message_count = 5 } = body

    if (!conversation_id) {
      return NextResponse.json({ error: 'conversation_id required' }, { status: 400 })
    }

    // Get recent messages for context
    const { data: messages, error } = await supabase
      .from('sms_messages')
      .select('direction, message_body, created_at')
      .eq('conversation_id', conversation_id)
      .order('created_at', { ascending: false })
      .limit(message_count)

    if (error) throw error

    // Get contact info
    const { data: conversation } = await supabase
      .from('sms_conversations')
      .select(`
        phone_number,
        contact:contacts(first_name, last_name, company)
      `)
      .eq('id', conversation_id)
      .single()

    // Handle nested join - contact may be array or object
    const contactData = conversation?.contact
    const contact = Array.isArray(contactData) ? contactData[0] : contactData
    const contactName = contact
      ? `${contact.first_name || ''} ${contact.last_name || ''}`.trim()
      : 'the customer'

    // Build conversation context
    const conversationHistory = (messages || [])
      .reverse()
      .map(m => `${m.direction === 'inbound' ? 'Customer' : 'Agent'}: ${m.message_body}`)
      .join('\n')

    // Generate suggestions using OpenAI
    const openai = getOpenAI()
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are an AI assistant helping customer service agents respond to SMS messages.
Generate 3 brief, professional reply suggestions based on the conversation context.
Each suggestion should be:
- Concise (under 160 characters ideally)
- Professional and friendly
- Appropriate for SMS format
- Directly addressing the customer's most recent message

Return ONLY a JSON array of 3 strings, no other text.`
        },
        {
          role: 'user',
          content: `Customer name: ${contactName}
Company: ${contact?.company || 'Unknown'}

Recent conversation:
${conversationHistory || 'No previous messages'}

Generate 3 reply suggestions for the agent to respond to the most recent customer message.`
        }
      ],
      temperature: 0.7,
      max_tokens: 500
    })

    const content = response.choices[0]?.message?.content || '[]'

    // Parse suggestions
    let suggestions: string[] = []
    try {
      suggestions = JSON.parse(content)
      if (!Array.isArray(suggestions)) {
        suggestions = [content]
      }
    } catch {
      // Try to extract suggestions from text
      suggestions = content
        .split('\n')
        .filter(line => line.trim())
        .slice(0, 3)
    }

    return NextResponse.json({
      success: true,
      suggestions: suggestions.slice(0, 3)
    })
  } catch (error) {
    console.error('Error generating suggestions:', error)
    return NextResponse.json({ error: 'Failed to generate suggestions' }, { status: 500 })
  }
}
