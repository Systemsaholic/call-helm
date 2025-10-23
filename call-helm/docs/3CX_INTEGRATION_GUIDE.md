# 3CX Integration Guide for Call-Helm

## Overview

Call-Helm integrates with 3CX as an external CRM, enabling automatic contact lookup and call journaling directly from your 3CX phone system.

## Features

- **Contact Lookup**: When calls come in, 3CX searches Call-Helm for matching contacts and displays caller information
- **Call Journaling**: Automatically log all calls (inbound, outbound, missed) to Call-Helm
- **Contact Creation**: Create new contacts directly from the 3CX interface
- **Screen Pop**: Automatically display contact information to agents when calls arrive

## Setup Instructions

### Step 1: Generate API Key in Call-Helm

1. Log into Call-Helm as an admin
2. Navigate to Settings → Integrations → 3CX
3. Click "Generate API Key"
4. Save the generated API key (you'll need it for 3CX configuration)

### Step 2: Download XML Template

1. In the same 3CX integration page, click "Download XML Template"
2. Save the `call-helm-3cx.xml` file to your computer

### Step 3: Configure 3CX

1. Log into your 3CX Management Console
2. Go to **Settings → CRM Integration**
3. Click "**+ Add CRM Template**"
4. Upload the `call-helm-3cx.xml` file you downloaded
5. Select "**Call-Helm**" from the CRM dropdown
6. Configure the following settings:
   - **Call-Helm API Key**: (should be pre-filled from the template)
   - **Call-Helm URL**: Verify it points to your Call-Helm instance
   - **Enable Call Journaling**: ✅ Check this to automatically log calls
   - **Allow contact creation**: ✅ Check to enable creating contacts from 3CX

7. Click "**Test**" to verify the connection
8. If successful, click "**Save**"

### Step 4: Map Agent Extensions (Optional)

To attribute calls to specific users in Call-Helm:

1. In Call-Helm, go to Settings → Integrations → 3CX → Agent Mappings
2. Map 3CX extension numbers to Call-Helm users
3. This ensures calls are assigned to the correct agent

## How It Works

### Contact Lookup Flow

```
Incoming Call → 3CX searches Call-Helm by phone number →
Contact found → 3CX displays contact info to agent (screen-pop)
```

### Call Journaling Flow

```
Call ends → 3CX sends call details to Call-Helm →
Call logged with contact, duration, agent, and call type
```

### Call Types Logged

- **Inbound**: Answered incoming calls
- **Outbound**: Answered outgoing calls
- **Missed**: Unanswered incoming calls
- **Notanswered**: Unanswered outgoing calls

## API Endpoints

The 3CX integration uses the following endpoints:

- `GET /api/3cx/contacts/lookup?number={phone}` - Search contacts by phone
- `GET /api/3cx/contacts/search?query={text}` - Free text contact search
- `POST /api/3cx/contacts/create` - Create new contact
- `POST /api/3cx/calls/journal` - Log call details
- `GET /api/3cx/template?apiKey={key}` - Download XML template
- `POST /api/3cx/setup` - Generate API key

All endpoints require the `x-api-key` header for authentication.

## Troubleshooting

### Connection Test Fails

- Verify the Call-Helm URL is accessible from your 3CX server
- Check that the API key is correct
- Ensure Call-Helm is running and accessible

### Calls Not Being Journaled

- Verify "Enable Call Journaling" is checked in 3CX CRM settings
- Check that calls are ending properly (3CX only journals completed calls)
- Review the 3CX call events log in Call-Helm for errors

### Contact Lookup Not Working

- Verify phone numbers in Call-Helm match the format 3CX sends
- Check the Call-Helm database for matching contacts
- Test manually using the 3CX "Search CRM" feature

### Agent Not Assigned to Calls

- Verify agent extension mappings are configured
- Check that the agent email in 3CX matches Call-Helm

## Database Tables

The integration uses these tables:

- `three_cx_integrations` - Organization configuration and API keys
- `three_cx_agent_mappings` - Extension to user mappings
- `three_cx_call_events` - Event log for debugging

## Security

- API keys are stored encrypted in the database
- Each organization has a unique API key
- API keys can be regenerated at any time
- All requests are validated and rate-limited

## Support

For issues or questions:
- Check the Call-Helm documentation
- Review 3CX call events in Call-Helm dashboard
- Contact support with your organization ID and error details
