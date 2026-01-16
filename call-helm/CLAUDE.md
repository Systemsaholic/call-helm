# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Call Helm is an AI-powered SaaS call center management platform built with Next.js 15, Supabase, and TypeScript. It supports multi-tenant organizations with agent management, call tracking, SMS messaging, real-time analytics, and AI-powered call analysis.

**Supabase Project ID**: `seeaalajmchrtblbhvwq`

## Development Commands

```bash
# Development (runs on port 3035, not default 3000)
pnpm dev                    # Start Next.js dev server
pnpm tunnel                 # Start ngrok tunnel (permanent URL)
pnpm dev:all                # Instructions for running both

# Build & Production
pnpm build                  # Build for production
pnpm start                  # Run production build
pnpm lint                   # Run ESLint

# Testing (Playwright)
pnpm test                   # Run all tests
pnpm test:ui                # Run tests with Playwright UI
pnpm test:headed            # Run tests in headed browser mode
pnpm test:debug             # Debug tests

# Webhooks (configured in Telnyx portal)
# Telnyx webhooks point to: https://buffalo-massive-violently.ngrok-free.app
```

## Architecture

### State Management (Hybrid Approach)
- **Zustand** (`/src/lib/stores/`) - Global UI state (agent selection, SMS drafts, typing indicators)
- **TanStack Query** - Server state with optimistic updates and cache invalidation
- **React Hooks** (`/src/lib/hooks/`) - Custom hooks wrapping queries and mutations

### Real-time Subscriptions
Centralized in `/src/lib/services/realtimeService.ts` - single instance manages all Supabase subscriptions with automatic reconnection and deduplication. Hooks like `useNewMessageSubscription()` and `useCallSubscription()` consume this service.

### Multi-tenancy
All database queries filter by `organization_id`. Row-Level Security (RLS) is enforced on all tables. The middleware (`/src/middleware.ts`) handles auth protection and routing for invited users.

### Key Directories
- `/src/app/api/` - API routes (calls, SMS webhooks, transcription, analysis)
- `/src/lib/services/` - Business logic (billing, Telnyx, 3CX PBX)
- `/src/lib/hooks/` - React Query hooks with mutations
- `/src/lib/stores/` - Zustand stores
- `/src/components/ui/` - shadcn/ui base components
- `/supabase/migrations/` - Database migrations

### External Integrations
- **Telnyx** - Voice calling and SMS
- **AssemblyAI** - Transcription with speaker diarization
- **OpenAI** - Sentiment analysis, keyword extraction, call scoring
- **Stripe** - Subscription billing

## Environment Variables

Required in `.env.local`:
```env
NEXT_PUBLIC_SUPABASE_URL=https://seeaalajmchrtblbhvwq.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
TELNYX_API_KEY=your-telnyx-api-key
TELNYX_PUBLIC_KEY=your-telnyx-public-key
TELNYX_APP_ID=your-telnyx-app-id
OPENAI_API_KEY=your-openai-key
ASSEMBLYAI_API_KEY=your-assemblyai-key
NEXT_PUBLIC_APP_URL=https://your-domain.com
```

## Local Development with ngrok

The app uses a permanent ngrok URL for webhook development:
- URL: `https://buffalo-massive-violently.ngrok-free.app`
- Port: 3035

1. Start ngrok: `pnpm tunnel`
2. Start dev server: `pnpm dev`
3. Telnyx webhooks are configured in the Telnyx portal to point to the ngrok URL

## Database Migrations

Migrations are in `/supabase/migrations/`. Use the Supabase MCP tools to apply migrations:
- `mcp__supabase__apply_migration` - Apply new migrations
- `mcp__supabase__list_migrations` - View existing migrations
- `mcp__supabase__execute_sql` - Run ad-hoc queries

## Testing

Playwright tests authenticate using a saved session in `.auth/user.json`. The setup project creates this session. Tests cover agent management, call lists, SMS, and settings flows.

## Key Patterns

### API Routes
All routes validate with Zod, authenticate via Supabase service role, and track usage for billing.

### Forms
React Hook Form + Zod schemas (in `/src/lib/validations/`).

### UI Components
shadcn/ui components in `/src/components/ui/` with Radix UI primitives. Tailwind CSS 4 for styling.

### Optimistic Updates
SMS and agent mutations use TanStack Query's optimistic update pattern with automatic rollback on failure.
