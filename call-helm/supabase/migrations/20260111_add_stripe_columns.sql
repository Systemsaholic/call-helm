-- Add Stripe-related columns to organizations table
-- These columns store the Stripe customer and subscription IDs for billing integration

-- Add stripe_customer_id column
ALTER TABLE public.organizations
ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT UNIQUE;

-- Add stripe_subscription_id column
ALTER TABLE public.organizations
ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT UNIQUE;

-- Create index on stripe_customer_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_organizations_stripe_customer_id
ON public.organizations(stripe_customer_id)
WHERE stripe_customer_id IS NOT NULL;

-- Create index on stripe_subscription_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_organizations_stripe_subscription_id
ON public.organizations(stripe_subscription_id)
WHERE stripe_subscription_id IS NOT NULL;

-- Add comment explaining the columns
COMMENT ON COLUMN public.organizations.stripe_customer_id IS 'Stripe Customer ID for billing';
COMMENT ON COLUMN public.organizations.stripe_subscription_id IS 'Stripe Subscription ID for the current subscription';
