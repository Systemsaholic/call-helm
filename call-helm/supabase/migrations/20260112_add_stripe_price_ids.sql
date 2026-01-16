-- Migration: Add Stripe Price ID columns to subscription_plans
-- Description: Stores Stripe Price IDs for single source of truth pricing
-- The actual prices will be fetched from Stripe API, these are just the references

-- Add Stripe Price ID columns if they don't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'subscription_plans' AND column_name = 'stripe_price_id_monthly'
  ) THEN
    ALTER TABLE subscription_plans ADD COLUMN stripe_price_id_monthly TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'subscription_plans' AND column_name = 'stripe_price_id_yearly'
  ) THEN
    ALTER TABLE subscription_plans ADD COLUMN stripe_price_id_yearly TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'subscription_plans' AND column_name = 'stripe_product_id'
  ) THEN
    ALTER TABLE subscription_plans ADD COLUMN stripe_product_id TEXT;
  END IF;
END $$;

-- Add comments for documentation
COMMENT ON COLUMN subscription_plans.stripe_price_id_monthly IS 'Stripe Price ID for monthly billing. Actual price fetched from Stripe API.';
COMMENT ON COLUMN subscription_plans.stripe_price_id_yearly IS 'Stripe Price ID for yearly billing. Actual price fetched from Stripe API.';
COMMENT ON COLUMN subscription_plans.stripe_product_id IS 'Stripe Product ID this plan maps to.';

-- Note: After running this migration, update the price IDs with your actual Stripe Price IDs:
-- UPDATE subscription_plans SET
--   stripe_price_id_monthly = 'price_xxx',
--   stripe_price_id_yearly = 'price_yyy',
--   stripe_product_id = 'prod_zzz'
-- WHERE slug = 'starter';
