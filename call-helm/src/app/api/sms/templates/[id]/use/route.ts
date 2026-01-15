import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * POST /api/sms/templates/[id]/use - Increment usage count and return populated template
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get template
    const { data: template, error: fetchError } = await supabase
      .from('sms_templates')
      .select('*')
      .eq('id', id)
      .single()

    if (fetchError || !template) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 })
    }

    // Increment usage count
    await supabase
      .from('sms_templates')
      .update({ usage_count: (template.usage_count || 0) + 1 })
      .eq('id', id)

    // Get variables from request body for substitution
    const body = await request.json().catch(() => ({}))
    const variables = body.variables || {}

    // Substitute variables in content
    let populatedContent = template.content
    for (const [key, value] of Object.entries(variables)) {
      populatedContent = populatedContent.replace(
        new RegExp(`\\{\\{${key}\\}\\}`, 'g'),
        String(value)
      )
    }

    return NextResponse.json({
      success: true,
      template: {
        ...template,
        populated_content: populatedContent
      }
    })
  } catch (error) {
    console.error('Error using template:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
