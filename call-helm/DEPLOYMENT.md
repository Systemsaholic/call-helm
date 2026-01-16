# Call Helm - Production Deployment Checklist

## ✅ Completed Pre-Launch Tasks

### 1. **Critical Issues Resolved**
- ✅ Removed DEBUG logs from production (now only show in development)
- ✅ Fixed TODO items in SMS routes:
  - Template usage count tracking implemented
  - Unread message count increment fixed
- ✅ Environment variable validation system created
- ✅ Health check endpoint added at `/api/health`
- ✅ Production build verified

### 2. **New Features Added**

#### Environment Validation (`src/lib/utils/env-validation.ts`)
- Validates all required environment variables at startup
- Provides clear error messages for missing variables
- Logs warnings for optional variables

#### Health Check Endpoint (`/api/health`)
- Returns system status and dependency health
- Checks:
  - Environment variables
  - Database connection (Supabase)
  - Telnyx configuration
  - OpenAI API configuration
  - AssemblyAI configuration
- Returns 200 if healthy, 503 if unhealthy

#### Server Instrumentation (`instrumentation.ts`)
- Runs environment validation on server startup
- Provides clear logging of system status
- Catches configuration issues before they cause runtime errors

## 🚀 Deployment Steps

### 1. **Pre-Deployment Testing**

```bash
# 1. Run all tests
pnpm test

# 2. Build production locally
pnpm build

# 3. Test production build locally
pnpm start

# 4. Test health endpoint
curl http://localhost:3035/api/health
```

### 2. **Environment Variables Setup**

Required variables for Vercel/production:

```env
# Supabase (Critical)
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Telnyx (Critical)
TELNYX_API_KEY=your_api_key
TELNYX_PUBLIC_KEY=your_public_key
TELNYX_APP_ID=your_app_id

# AI Services (Critical)
OPENAI_API_KEY=your_openai_key
ASSEMBLYAI_API_KEY=your_assemblyai_key

# Application
NEXT_PUBLIC_APP_URL=https://your-domain.com

# Optional
# (Telnyx handles 10DLC via portal configuration)
```

### 3. **Vercel Deployment**

```bash
# 1. Deploy to staging first
vercel

# 2. Test staging environment
curl https://your-staging-url.vercel.app/api/health

# 3. Deploy to production
vercel --prod

# 4. Verify production health
curl https://your-domain.com/api/health
```

### 4. **Post-Deployment Verification**

- [ ] Health check endpoint returns healthy status
- [ ] All environment variables validated
- [ ] Database connection working
- [ ] Telnyx webhooks configured correctly
- [ ] SMS sending/receiving functional
- [ ] Call recording and transcription working
- [ ] AI analysis features operational

## 📋 Remaining Tasks (Optional but Recommended)

### Security Hardening
- [ ] Add rate limiting to API endpoints
- [ ] Implement CSRF protection
- [ ] Review and audit all RLS policies
- [ ] Add request validation/sanitization

### Monitoring & Observability
- [ ] Set up error tracking (Sentry recommended)
- [ ] Enable Vercel Analytics
- [ ] Configure uptime monitoring
- [ ] Set up cost/usage alerts

### Performance
- [ ] Add caching headers for static assets
- [ ] Optimize database queries
- [ ] Consider CDN for call recordings
- [ ] Load testing for concurrent operations

### Documentation
- [ ] API documentation for webhooks
- [ ] User guide/help center
- [ ] Admin documentation
- [ ] Incident response playbook

### Compliance & Legal
- [ ] Terms of Service
- [ ] Privacy Policy
- [ ] Cookie consent
- [ ] GDPR compliance documentation

## 🔍 Monitoring Checklist

### First 24 Hours
- [ ] Monitor error rates via health endpoint
- [ ] Check webhook delivery success rates
- [ ] Monitor database performance
- [ ] Track API response times
- [ ] Review Telnyx usage/costs

### Ongoing
- [ ] Weekly health check reviews
- [ ] Monthly cost analysis
- [ ] Quarterly security audits
- [ ] Regular backup verification

## 🆘 Rollback Plan

If issues arise in production:

```bash
# 1. Rollback to previous deployment
vercel rollback

# 2. Check health status
curl https://your-domain.com/api/health

# 3. Review logs
vercel logs

# 4. Identify and fix issues
# 5. Re-deploy when ready
```

## 📊 Success Metrics

Track these metrics post-launch:
- API response times < 200ms (p95)
- Error rate < 1%
- Webhook delivery success > 99%
- Database query performance < 100ms (p95)
- User onboarding completion rate
- Feature adoption rates

## 🎯 Next Steps After Launch

1. **Week 1**: Monitor closely, fix any critical issues
2. **Week 2**: Gather user feedback, optimize performance
3. **Month 1**: Implement monitoring/alerting improvements
4. **Month 2**: Add security hardening features
5. **Month 3**: Scale optimization based on usage patterns

---

## Support & Maintenance

- Health Check: `GET /api/health`
- Environment validation runs automatically on startup
- All production errors should be logged (add Sentry for tracking)
- Database migrations: Use Supabase dashboard or CLI

---

**Last Updated**: January 2025
**Version**: 0.1.0
