/**
 * 3CX XML Template Generator
 * Generates the CRM integration XML template that 3CX uses to communicate with Call-Helm
 * This is THE KEY FILE that defines how 3CX integrates with Call-Helm
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateThreeCXApiKey } from '@/lib/services/threeCX';

export async function GET(request: NextRequest) {
  try {
    const apiKey = request.nextUrl.searchParams.get('apiKey');

    if (!apiKey) {
      return NextResponse.json({ error: 'Missing apiKey parameter' }, { status: 400 });
    }

    // Validate the API key
    const organizationId = await validateThreeCXApiKey(apiKey);
    if (!organizationId) {
      return NextResponse.json({ error: 'Invalid API key' }, { status: 401 });
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://call-helm.com';

    // Generate the XML template
    const xmlTemplate = `<?xml version="1.0" encoding="utf-8"?>
<Crm xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
     xmlns:xsd="http://www.w3.org/2001/XMLSchema"
     Country="US"
     Name="CallHelm"
     Version="1"
     SupportsEmojis="true"
     SupportsTranscription="false">

  <Number Prefix="AsIs" MaxLength="15" />
  <Connection MaxConcurrentRequests="16" />

  <Parameters>
    <Parameter Name="ApiKey" Type="Password" Parent="General Configuration"
               Editor="String" Title="Call-Helm API Key:"
               Default="${apiKey}" />
    <Parameter Name="BaseUrl" Type="String" Parent="General Configuration"
               Editor="String" Title="Call-Helm URL:"
               Default="${baseUrl}" />
    <Parameter Name="ReportCallEnabled" Type="Boolean" Parent=""
               Editor="String" Title="Enable Call Journaling"
               Default="True" />
    <Parameter Name="CallSubject" Type="String" Parent="ReportCallEnabled"
               Editor="String" Title="Call Subject:"
               Default="Call-Helm Call Log" />
    <Parameter Name="CreateContactEnabled" Type="Boolean" Parent="General Configuration"
               Editor="String" Title="Allow contact creation from 3CX"
               Default="True" />
  </Parameters>

  <Authentication Type="No" />

  <Scenarios>
    <!-- Contact Lookup by Phone Number -->
    <Scenario Id="" Type="REST" EntityId="Contacts" EntityOrder="">
      <Request Url="[BaseUrl]/api/3cx/contacts/lookup?number=[Number]"
               RequestType="Get"
               ResponseType="Json">
        <Headers>
          <Value Key="x-api-key" Type="String">[ApiKey]</Value>
        </Headers>
      </Request>
      <Rules>
        <Rule Type="Any">contacts.id</Rule>
      </Rules>
      <Variables>
        <Variable Name="ContactId" Path="contacts.id" />
        <Variable Name="FirstName" Path="contacts.firstName" />
        <Variable Name="LastName" Path="contacts.lastName" />
        <Variable Name="CompanyName" Path="contacts.company" />
        <Variable Name="Email" Path="contacts.email" />
        <Variable Name="PhoneBusiness" Path="contacts.phoneBusiness" />
        <Variable Name="PhoneMobile" Path="contacts.phoneMobile" />
        <Variable Name="PhoneHome" Path="contacts.phoneHome" />
        <Variable Name="ContactUrl" Path="contacts.contactUrl" />
      </Variables>
      <Outputs AllowEmpty="false">
        <Output Type="ContactUrl" Value="[ContactUrl]" />
        <Output Type="FirstName" Value="[FirstName]" />
        <Output Type="LastName" Value="[LastName]" />
        <Output Type="CompanyName" Value="[CompanyName]" />
        <Output Type="Email" Value="[Email]" />
        <Output Type="PhoneBusiness" Value="[PhoneBusiness]" />
        <Output Type="PhoneMobile" Value="[PhoneMobile]" />
        <Output Type="PhoneHome" Value="[PhoneHome]" />
        <Output Type="EntityId" Value="[ContactId]" />
        <Output Type="EntityType" Value="Contacts" />
      </Outputs>
    </Scenario>

    <!-- Search Contacts -->
    <Scenario Id="SearchContacts" Type="REST" EntityId="Contacts" EntityOrder="">
      <Request Url="[BaseUrl]/api/3cx/contacts/search?query=[EscapedSearchText]"
               RequestType="Get"
               ResponseType="Json">
        <Headers>
          <Value Key="x-api-key" Type="String">[ApiKey]</Value>
        </Headers>
      </Request>
      <Rules>
        <Rule Type="Any">contacts.id</Rule>
      </Rules>
      <Variables>
        <Variable Name="ContactId" Path="contacts.id" />
        <Variable Name="FirstName" Path="contacts.firstName" />
        <Variable Name="LastName" Path="contacts.lastName" />
        <Variable Name="CompanyName" Path="contacts.company" />
        <Variable Name="Email" Path="contacts.email" />
        <Variable Name="PhoneBusiness" Path="contacts.phoneBusiness" />
        <Variable Name="PhoneMobile" Path="contacts.phoneMobile" />
        <Variable Name="ContactUrl" Path="contacts.contactUrl" />
      </Variables>
      <Outputs AllowEmpty="false">
        <Output Type="ContactUrl" Value="[ContactUrl]" />
        <Output Type="FirstName" Value="[FirstName]" />
        <Output Type="LastName" Value="[LastName]" />
        <Output Type="CompanyName" Value="[CompanyName]" />
        <Output Type="Email" Value="[Email]" />
        <Output Type="PhoneBusiness" Value="[PhoneBusiness]" />
        <Output Type="PhoneMobile" Value="[PhoneMobile]" />
        <Output Type="EntityId" Value="[ContactId]" />
        <Output Type="EntityType" Value="Contacts" />
      </Outputs>
    </Scenario>

    <!-- Call Journaling -->
    <Scenario Id="ReportCall" Type="REST">
      <Request SkipIf="[ReportCallEnabled]!=True"
               Url="[BaseUrl]/api/3cx/calls/journal"
               RequestType="Post"
               RequestEncoding="Json"
               ResponseType="Json">
        <Headers>
          <Value Key="x-api-key" Type="String">[ApiKey]</Value>
          <Value Key="Content-Type" Type="String">application/json</Value>
        </Headers>
        <PostValues>
          <Value Key="CallType" Type="String">[CallType]</Value>
          <Value Key="Number" Type="String">[Number]</Value>
          <Value Key="CallDirection" Type="String">[CallDirection]</Value>
          <Value Key="Name" Type="String">[Name]</Value>
          <Value Key="EntityId" Type="String">[EntityId]</Value>
          <Value Key="Agent" Type="String">[Agent]</Value>
          <Value Key="AgentEmail" Type="String">[AgentEmail]</Value>
          <Value Key="AgentFirstName" Type="String">[AgentFirstName]</Value>
          <Value Key="AgentLastName" Type="String">[AgentLastName]</Value>
          <Value Key="Duration" Type="String">[Duration]</Value>
          <Value Key="CallStartTimeUTC" Type="String">[[CallStartTimeUTC].ToString("yyyy-MM-ddTHH:mm:ssZ")]</Value>
          <Value Key="CallEndTimeUTC" Type="String">[[CallEndTimeUTC].ToString("yyyy-MM-ddTHH:mm:ssZ")]</Value>
          <Value Key="QueueExtension" Type="String">[QueueExtension]</Value>
        </PostValues>
      </Request>
      <Variables />
      <Outputs AllowEmpty="true" />
    </Scenario>

    <!-- Create Contact -->
    <Scenario Id="CreateContactRecordFromClient" Type="REST">
      <Request SkipIf="[CreateContactEnabled]!=True"
               Url="[BaseUrl]/api/3cx/contacts/create"
               RequestType="Post"
               RequestEncoding="Json"
               ResponseType="Json">
        <Headers>
          <Value Key="x-api-key" Type="String">[ApiKey]</Value>
          <Value Key="Content-Type" Type="String">application/json</Value>
        </Headers>
        <PostValues>
          <Value Key="FirstName" Type="String">[FirstName]</Value>
          <Value Key="LastName" Type="String">[LastName]</Value>
          <Value Key="Number" Type="String">[Number]</Value>
          <Value Key="Email" Type="String">[Email]</Value>
          <Value Key="Company" Type="String">[Company]</Value>
        </PostValues>
      </Request>
      <Rules>
        <Rule Type="Any">id</Rule>
      </Rules>
      <Variables>
        <Variable Name="Id" Path="id" />
        <Variable Name="ContactUrl" Path="contactUrl" />
      </Variables>
      <Outputs AllowEmpty="false">
        <Output Type="ContactUrl" Value="[ContactUrl]" />
        <Output Type="FirstName" Value="[FirstName]" />
        <Output Type="LastName" Value="[LastName]" />
        <Output Type="PhoneMobile" Value="[Number]" />
        <Output Type="Email" Value="[Email]" />
        <Output Type="CompanyName" Value="[Company]" />
        <Output Type="EntityId" Value="[Id]" />
        <Output Type="EntityType" Value="Contacts" />
      </Outputs>
    </Scenario>
  </Scenarios>
</Crm>`;

    return new NextResponse(xmlTemplate, {
      headers: {
        'Content-Type': 'application/xml',
        'Content-Disposition': 'attachment; filename="call-helm-3cx.xml"'
      }
    });

  } catch (error) {
    console.error('Error generating XML template:', error);
    return NextResponse.json({ error: 'Failed to generate template' }, { status: 500 });
  }
}
