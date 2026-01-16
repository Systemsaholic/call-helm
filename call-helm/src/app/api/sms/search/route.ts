import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { smsLogger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

interface SearchResult {
  messageId: string
  conversationId: string
  messageBody: string
  direction: string
  fromNumber: string
  toNumber: string
  createdAt: string
  contactName: string | null
  contactPhone: string
  rank: number
}

interface SearchResponse {
  success: boolean
  results: SearchResult[]
  query: string
  total: number
  hasMore: boolean
}

/**
 * Search SMS messages using full-text search
 * GET /api/sms/search?q=search+terms&limit=50&offset=0
 */
export async function GET(request: NextRequest): Promise<NextResponse<SearchResponse | { error: string }>> {
  try {
    const supabase = await createServerSupabaseClient()

    // Check authentication
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user's organization
    const { data: member } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', user.id)
      .single()

    if (!member) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
    }

    // Parse query parameters
    const searchParams = request.nextUrl.searchParams
    const query = searchParams.get('q')?.trim()
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100) // Max 100
    const offset = parseInt(searchParams.get('offset') || '0')

    if (!query || query.length < 2) {
      return NextResponse.json({
        error: 'Search query must be at least 2 characters'
      }, { status: 400 })
    }

    // Call the search function
    const { data: results, error } = await supabase
      .rpc('search_sms_messages', {
        p_organization_id: member.organization_id,
        p_query: query,
        p_limit: limit + 1, // Fetch one extra to check if there's more
        p_offset: offset
      })

    if (error) {
      smsLogger.error('Search error', { error })
      return NextResponse.json({ error: 'Search failed' }, { status: 500 })
    }

    // Check if there are more results
    const hasMore = results && results.length > limit
    const trimmedResults = hasMore ? results.slice(0, limit) : (results || [])

    // Format results
    const formattedResults: SearchResult[] = trimmedResults.map((r: Record<string, unknown>) => ({
      messageId: r.message_id,
      conversationId: r.conversation_id,
      messageBody: r.message_body,
      direction: r.direction,
      fromNumber: r.from_number,
      toNumber: r.to_number,
      createdAt: r.created_at,
      contactName: r.contact_name,
      contactPhone: r.contact_phone,
      rank: r.rank
    }))

    return NextResponse.json({
      success: true,
      results: formattedResults,
      query,
      total: formattedResults.length,
      hasMore
    })
  } catch (error) {
    smsLogger.error('Error searching SMS messages', { error })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
