# Call Helm - AI-Powered Call Center Management

A modern SaaS platform for managing call centers with AI-powered insights and automation. Built with Next.js 15, Supabase, and TypeScript.

## Features

- 🎯 **Multi-tenant Architecture** - Support multiple organizations with data isolation
- 👥 **Agent Management** - Track agents, roles, and performance
- 📞 **Call Tracking** - Record, transcribe, and analyze calls
- 🤖 **AI Analysis** - Sentiment analysis, keyword extraction, and call scoring
- 📊 **Real-time Analytics** - Dashboard with live metrics
- 💳 **Subscription Billing** - Stripe integration for tiered pricing
- 🔒 **Enterprise Security** - Row Level Security with Supabase

## Tech Stack

- **Frontend**: Next.js 15, TypeScript, Tailwind CSS
- **Backend**: Supabase (PostgreSQL, Auth, Storage, Edge Functions)
- **State Management**: Zustand, TanStack Query
- **UI Components**: Custom components inspired by Jobber design
- **AI Integration**: OpenAI API for call analysis
- **Future**: SignalWire for native calling

## Getting Started

### Prerequisites

- Node.js 18+
- pnpm (recommended)
- Supabase account

### Installation

1. Clone the repository:
```bash
git clone [repository-url]
cd call-helm
```

2. Install dependencies:
```bash
pnpm install
```

3. Set up environment variables:
```bash
cp .env.local.example .env.local
```

Edit `.env.local` with your Supabase credentials:
```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

4. Set up the database:
   - Go to your Supabase dashboard
   - Navigate to SQL Editor
   - Run the schema from `supabase/schema.sql`

5. Start the development server:
```bash
pnpm dev
```

The app will be available at http://localhost:3000

## Database Schema

The application uses a comprehensive PostgreSQL schema with:
- Organizations and multi-tenancy
- User profiles and team members
- Calls and recordings
- Contacts and campaigns
- AI analysis results
- Activity logging

See `supabase/schema.sql` for the complete schema.

## Project Structure

```
src/
├── app/                  # Next.js app router pages
│   ├── auth/            # Authentication pages
│   ├── dashboard/       # Main application
│   └── (marketing)/     # Public pages
├── components/          # React components
│   ├── ui/             # Base UI components
│   └── features/       # Feature-specific components
├── lib/                # Utilities and configurations
│   ├── supabase/       # Supabase clients
│   ├── hooks/          # Custom React hooks
│   └── utils/          # Helper functions
└── store/              # Zustand stores
```

## Supabase Setup Instructions

1. **Create a Supabase Project**:
   - Go to [supabase.com](https://supabase.com)
   - Create a new project
   - Note your project URL and anon key

2. **Run the Database Schema**:
   - Go to SQL Editor in your Supabase dashboard
   - Copy the contents of `supabase/schema.sql`
   - Run the SQL to create all tables and policies

3. **Configure Authentication**:
   - Enable Email authentication
   - (Optional) Enable Google and GitHub OAuth
   - Set up email templates

4. **Create Storage Buckets**:
   - Create a bucket named `call-recordings`
   - Set appropriate RLS policies

## Development

```bash
# Start development server
pnpm dev

# Build for production
pnpm build

# Run production build
pnpm start
```

## Deployment

### Vercel Deployment

1. Push to GitHub
2. Connect repository to Vercel
3. Add environment variables in Vercel dashboard
4. Deploy

### Environment Variables

Required for production:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_APP_URL`

Optional:
- `OPENAI_API_KEY` - For AI analysis
- `STRIPE_SECRET_KEY` - For billing
- `SIGNALWIRE_*` - For calling features

## License

[Your License]
