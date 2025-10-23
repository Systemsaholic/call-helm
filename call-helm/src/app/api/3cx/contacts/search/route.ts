/**
 * 3CX Contact Search API
 * Allows 3CX to search for contacts using free text
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateThreeCXApiKey, logThreeCXEvent } from '@/lib/services/threeCX';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function GET(request: NextRequest) {
  try {
    const apiKey = request.headers.get('x-api-key');
    if (!apiKey) {
      return NextResponse.json({ error: 'Missing API key', contacts: [] }, { status: 401 });
    }

    const organizationId = await validateThreeCXApiKey(apiKey);
    if (!organizationId) {
      return NextResponse.json({ error: 'Invalid API key', contacts: [] }, { status: 401 });
    }

    const query = request.nextUrl.searchParams.get('query');
    if (!query || query.length < 2) {
      return NextResponse.json({ error: 'Query too short', contacts: [] }, { status: 400 });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('=== 3CX Contact Search Request ===');
    console.log('Search query:', query);

    // Full-text search across multiple fields including phone_number
    const { data: contacts, error } = await supabase
      .from('contacts')
      .select('id, first_name, last_name, email, company, phone_number')
      .eq('organization_id', organizationId)
      .or(`first_name.ilike.%${query}%,last_name.ilike.%${query}%,email.ilike.%${query}%,company.ilike.%${query}%,phone_number.ilike.%${query}%`)
      .limit(20);

    if (error) {
      console.error('Error searching contacts:', error);
      return NextResponse.json({ error: 'Database error', contacts: [] }, { status: 500 });
    }

    console.log('Search results:', contacts?.length || 0, 'contacts found');

    await logThreeCXEvent({
      organization_id: organizationId,
      event_type: 'search',
      raw_data: { query, results: contacts?.length || 0 }
    });

    const formattedContacts = contacts?.map(contact => ({
      id: contact.id,
      firstName: contact.first_name || '',
      lastName: contact.last_name || '',
      company: contact.company || '',
      email: contact.email || '',
      phoneBusiness: contact.phone_number || '',
      phoneMobile: contact.phone_number || '',
      contactUrl: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/contacts/${contact.id}`
    })) || [];

    return NextResponse.json({ success: true, contacts: formattedContacts });
  } catch (error) {
    console.error('Error in 3CX contact search:', error);
    return NextResponse.json({ error: 'Internal server error', contacts: [] }, { status: 500 });
  }
}
