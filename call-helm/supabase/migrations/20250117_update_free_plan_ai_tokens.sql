-- Update free plan to include small AI token allowance
-- This allows free users to try AI features (about 10 scripts per month)

UPDATE subscription_plans
SET features = jsonb_set(
  features,
  '{ai_script_generation}',
  'true'
)
WHERE slug = 'free';

-- Update the free plan's max_llm_tokens to give a small allowance
UPDATE subscription_plans
SET features = jsonb_set(
  features,
  '{max_llm_tokens}',
  '5000'
)
WHERE slug = 'free';

-- Add comment explaining the allowance
COMMENT ON COLUMN subscription_plans.features IS 
'JSON object containing feature flags and limits. Free plan includes 5000 LLM tokens for AI features (approximately 10 script generations per month).';