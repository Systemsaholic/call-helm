/**
 * 3CX Contact Lookup API
 * Allows 3CX to search for contacts by phone number
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateThreeCXApiKey, logThreeCXEvent, normalizePhoneNumber } from '@/lib/services/threeCX';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function GET(request: NextRequest) {
  try {
    // DEBUG: Log the incoming request
    console.log('=== 3CX Contact Lookup Request ===');
    console.log('Full URL:', request.url);
    console.log('Search params:', Object.fromEntries(request.nextUrl.searchParams.entries()));

    // Get API key from header
    const apiKey = request.headers.get('x-api-key');
    if (!apiKey) {
      console.log('ERROR: Missing API key');
      return NextResponse.json(
        { error: 'Missing API key', contacts: [] },
        { status: 401 }
      );
    }

    // Validate API key and get organization
    const organizationId = await validateThreeCXApiKey(apiKey);
    if (!organizationId) {
      console.log('ERROR: Invalid API key');
      return NextResponse.json(
        { error: 'Invalid API key', contacts: [] },
        { status: 401 }
      );
    }

    console.log('Organization ID:', organizationId);

    // Get phone number from query
    const number = request.nextUrl.searchParams.get('number');
    console.log('Phone number received:', number);

    if (!number) {
      console.log('ERROR: Missing phone number parameter');
      return NextResponse.json(
        { error: 'Missing phone number', contacts: [] },
        { status: 400 }
      );
    }

    // Normalize the phone number for better matching
    const normalizedNumber = normalizePhoneNumber(number);
    console.log('Normalized number:', normalizedNumber);

    // Search for contacts
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Build the query - search by phone number
    const { data: contacts, error } = await supabase
      .from('contacts')
      .select('id, first_name, last_name, email, company, phone_number')
      .eq('organization_id', organizationId)
      .or(`phone_number.eq.${number},phone_number.eq.${normalizedNumber}`)
      .limit(10);

    if (error) {
      console.error('Error searching contacts:', error);
      return NextResponse.json(
        { error: 'Database error', contacts: [] },
        { status: 500 }
      );
    }

    // Log the lookup event
    await logThreeCXEvent({
      organization_id: organizationId,
      event_type: 'lookup',
      phone_number: number,
      contact_id: contacts?.[0]?.id,
      raw_data: { number, normalized: normalizedNumber, results: contacts?.length || 0 }
    });

    // Format results for 3CX
    // contactUrl points to Active Call Panel for CTI screen pop integration
    const formattedContacts = contacts?.map(contact => ({
      id: contact.id,
      firstName: contact.first_name || '',
      lastName: contact.last_name || '',
      company: contact.company || '',
      email: contact.email || '',
      phoneBusiness: contact.phone_number || '',
      phoneMobile: contact.phone_number || '',
      phoneHome: '',
      // Use Active Call Panel URL for screen pop - allows agents to add notes/sentiment during call
      contactUrl: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/active-call/${encodeURIComponent(contact.phone_number || number)}`
    })) || [];

    return NextResponse.json({
      success: true,
      contacts: formattedContacts
    });

  } catch (error) {
    console.error('Error in 3CX contact lookup:', error);
    return NextResponse.json(
      { error: 'Internal server error', contacts: [] },
      { status: 500 }
    );
  }
}
