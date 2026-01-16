# Development Setup Guide

## Prerequisites
- Node.js 18+
- pnpm
- ngrok account with permanent subdomain
- Telnyx account
- Supabase project

## Quick Start

### 1. Start ngrok Tunnel
In a terminal, start the ngrok tunnel to your permanent subdomain:
```bash
pnpm tunnel
```
This runs: `ngrok http --url=buffalo-massive-violently.ngrok-free.app 3035`

Your app will be accessible at: https://buffalo-massive-violently.ngrok-free.app

### 2. Start Development Server
In another terminal, start the Next.js development server:
```bash
pnpm dev
```
This runs the app on port 3035.

### 3. Update Telnyx Webhooks (if needed)
If webhooks are not working, update them to your permanent URL:
```bash
pnpm webhooks:update
```

## Environment Variables

Your `.env.local` should have these URLs set to your permanent ngrok domain:
```env
NEXT_PUBLIC_APP_URL=https://buffalo-massive-violently.ngrok-free.app
APP_URL=https://buffalo-massive-violently.ngrok-free.app
```

## Permanent ngrok URL Benefits

With your permanent ngrok URL (`buffalo-massive-violently.ngrok-free.app`):
- ✅ No need to update environment variables when restarting ngrok
- ✅ Telnyx webhooks always point to the correct URL
- ✅ Consistent development experience
- ✅ Can bookmark your development URL

## Testing Webhooks

### Voice Call Webhooks
- TwiML: `https://buffalo-massive-violently.ngrok-free.app/api/voice/twiml`
- Status: `https://buffalo-massive-violently.ngrok-free.app/api/voice/status`

### Manual Webhook Update
If you need to manually update webhooks:
```bash
curl http://localhost:3035/api/voice/fix-webhooks
```

## Troubleshooting

### ngrok not starting?
Make sure you're using your permanent URL:
```bash
ngrok http --url=buffalo-massive-violently.ngrok-free.app 3035
```

### Webhooks not working?
1. Check ngrok is running: `pnpm tunnel`
2. Update webhooks: `pnpm webhooks:update`
3. Check Telnyx portal for the correct URLs

### Port conflicts?
If port 3035 is in use:
```bash
lsof -i :3035
kill -9 <PID>
```

## Available Scripts

- `pnpm dev` - Start Next.js dev server on port 3035
- `pnpm tunnel` - Start ngrok with permanent URL
- `pnpm webhooks:update` - Update Telnyx webhooks
- `pnpm build` - Build for production
- `pnpm test` - Run tests

## Telnyx Phone Numbers

Current configured numbers:
- +13433533549 (Primary)
- +13438050405 (Secondary)

Both are configured to use the permanent ngrok URL for webhooks.