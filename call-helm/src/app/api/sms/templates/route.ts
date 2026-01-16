import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { smsLogger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

interface SMSTemplate {
  id: string
  organization_id: string
  name: string
  content: string
  category: string
  variables: string[]
  is_shared: boolean
  created_by: string
  usage_count: number
  created_at: string
  updated_at: string
}

/**
 * GET /api/sms/templates - List all templates
 * POST /api/sms/templates - Create a new template
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: member } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', user.id)
      .single()

    if (!member) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
    }

    const searchParams = request.nextUrl.searchParams
    const category = searchParams.get('category')

    let query = supabase
      .from('sms_templates')
      .select('*')
      .eq('organization_id', member.organization_id)
      .order('usage_count', { ascending: false })

    if (category) {
      query = query.eq('category', category)
    }

    const { data, error } = await query

    if (error) throw error

    return NextResponse.json({ success: true, templates: data || [] })
  } catch (error) {
    smsLogger.error('Error fetching templates', { error })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: member } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', user.id)
      .single()

    if (!member) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
    }

    const body = await request.json()
    const { name, content, category, variables, is_shared } = body

    if (!name || !content) {
      return NextResponse.json({ error: 'Name and content are required' }, { status: 400 })
    }

    // Extract variables from content (format: {{variableName}})
    const extractedVars = content.match(/\{\{(\w+)\}\}/g)?.map((v: string) => v.slice(2, -2)) || []
    const allVariables = [...new Set([...(variables || []), ...extractedVars])]

    const { data, error } = await supabase
      .from('sms_templates')
      .insert({
        organization_id: member.organization_id,
        name,
        content,
        category: category || 'general',
        variables: allVariables,
        is_shared: is_shared !== false,
        created_by: user.id
      })
      .select()
      .single()

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'Template with this name already exists' }, { status: 400 })
      }
      throw error
    }

    return NextResponse.json({ success: true, template: data })
  } catch (error) {
    smsLogger.error('Error creating template', { error })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
