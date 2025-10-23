/**
 * 3CX Contact Creation API
 * Allows 3CX users to create contacts directly in Call-Helm
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateThreeCXApiKey, logThreeCXEvent } from '@/lib/services/threeCX';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(request: NextRequest) {
  try {
    const apiKey = request.headers.get('x-api-key');
    if (!apiKey) {
      return NextResponse.json({ error: 'Missing API key' }, { status: 401 });
    }

    const organizationId = await validateThreeCXApiKey(apiKey);
    if (!organizationId) {
      return NextResponse.json({ error: 'Invalid API key' }, { status: 401 });
    }

    const body = await request.json();
    const { FirstName, LastName, Number, Email, Company } = body;

    // Validate required fields
    if (!FirstName && !LastName && !Company) {
      return NextResponse.json(
        { error: 'At least one of FirstName, LastName, or Company is required' },
        { status: 400 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: contact, error } = await supabase
      .from('contacts')
      .insert({
        organization_id: organizationId,
        first_name: FirstName || '',
        last_name: LastName || '',
        phone: Number || '',
        email: Email || '',
        company: Company || '',
        source: '3cx_created',
        status: 'active'
      })
      .select('id, first_name, last_name, email, company, phone')
      .single();

    if (error) {
      console.error('Error creating contact:', error);
      return NextResponse.json({ error: 'Failed to create contact' }, { status: 500 });
    }

    await logThreeCXEvent({
      organization_id: organizationId,
      event_type: 'create_contact',
      phone_number: Number,
      contact_id: contact.id,
      raw_data: body
    });

    return NextResponse.json({
      success: true,
      id: contact.id,
      firstName: contact.first_name,
      lastName: contact.last_name,
      email: contact.email,
      company: contact.company,
      phoneMobile: contact.phone,
      contactUrl: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/contacts/${contact.id}`
    });
  } catch (error) {
    console.error('Error in 3CX contact creation:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
