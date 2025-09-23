# Click-to-Call Implementation Documentation

## Overview
Successfully implemented a complete click-to-call system with real-time status updates using SignalWire webhooks and a floating notification UI.

## Architecture

### Key Components

1. **CallContext (`/src/lib/contexts/CallContext.tsx`)**
   - Global state management for call status
   - Automatic polling of call status every 2 seconds
   - Handles call lifecycle and status updates
   - Provides `useCall()` hook for components

2. **CallStatusNotification (`/src/components/calls/CallStatusNotification.tsx`)**
   - Floating notification component (bottom-right corner)
   - Color-coded status indicators
   - Auto-hides 5 seconds after call completion
   - Shows "End Call" button during active calls

3. **SimpleCallButton (`/src/components/calls/SimpleCallButton.tsx`)**
   - Simplified call button without embedded status
   - Delegates state management to CallContext
   - Prevents multiple simultaneous calls
   - Shows upgrade dialog when minutes are exhausted

4. **SignalWire Webhook Handler (`/src/app/api/voice/status/route.ts`)**
   - Receives real-time status updates from SignalWire
   - Implements status progression validation
   - Prevents status regression (e.g., completed → initiated)
   - Handles multi-leg call tracking (agent and contact legs)

## Call Flow

1. **Initiation**
   - User clicks call button in contacts table
   - API creates call record in database
   - SignalWire initiates call to agent first

2. **Status Progression**
   - `initiated` → Call is being set up
   - `ringing` → Agent's phone is ringing
   - `answered` → Agent answered
   - `contact-connected` → Contact answered, both parties connected
   - `in-progress` → Call is active
   - `completed` → Call ended successfully

3. **Real-time Updates**
   - SignalWire sends webhooks to `/api/voice/status`
   - Status stored in call record metadata
   - UI polls `/api/calls/[callId]/status` every 2 seconds
   - Floating notification shows current status

## Key Features

### Status Progression Validation
- Prevents webhooks from regressing call status
- Terminal states (completed, failed, etc.) cannot be overwritten
- Ensures reliable status flow

### Multi-leg Call Detection
- Tracks both agent and contact call legs
- Shows "Contact answered" when both parties connect
- Properly handles call completion from either side

### UI/UX Improvements
- Floating notification doesn't break table layout
- Auto-hide after call completion
- Color-coded status messages
- Progress indicator during active calls
- Single active call enforcement per user

### Error Handling
- Graceful handling of failed calls
- Billing limit checks before initiating
- Upgrade prompts when minutes exhausted

## Database Schema

### Call Record Structure
```typescript
{
  id: string
  organization_id: string
  contact_id: string
  member_id: string
  status: enum // answered, missed, failed, busy
  start_time: timestamp
  end_time: timestamp
  duration: number // seconds
  metadata: {
    external_id: string // SignalWire call SID
    call_status: string // Real-time status
    initial_status: string
    contact_call_sid?: string // Contact leg SID
    contact_answered_at?: string
    agent_phone: string
    contact_phone: string
  }
}
```

## Configuration Requirements

### Environment Variables
```env
NEXT_PUBLIC_SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
SIGNALWIRE_SPACE_URL=
SIGNALWIRE_PROJECT_ID=
SIGNALWIRE_API_TOKEN=
```

### SignalWire Webhook URLs
- TwiML: `https://your-domain/api/voice/twiml`
- Status Callback: `https://your-domain/api/voice/status`

## Testing

### Manual Testing Steps
1. Click call button on a contact
2. Verify agent phone rings first
3. Answer agent phone - status should update to "You answered"
4. Wait for contact connection - status should show "Contact answered"
5. End call from either side
6. Verify notification disappears after 5 seconds

### Common Issues and Solutions

1. **Status stuck on "Initiating call..."**
   - Fixed by preventing status regression in webhooks
   - Terminal states now properly maintained

2. **UI flashing "Call completed" repeatedly**
   - Fixed by tracking last status to prevent duplicates
   - Using useRef instead of useState for polling interval

3. **Polling continues after call ends**
   - Fixed by checking endTime from database
   - Proper cleanup of polling interval

## Security Considerations

- Webhook endpoint uses service role key to bypass RLS
- Phone number validation and sanitization
- Organization-based access control
- Rate limiting on call initiation

## Performance Optimizations

- Status polling only during active calls
- Efficient database queries with proper indexes
- Minimal re-renders using React.useCallback
- Auto-cleanup of completed call states

## Future Enhancements

- [ ] Call recording playback
- [ ] Call transcription
- [ ] Call analytics dashboard
- [ ] Bulk calling capabilities
- [ ] Call scheduling
- [ ] Voicemail detection
- [ ] Call transfer functionality