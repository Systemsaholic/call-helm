-- Fix check_usage_limit function overload error
-- There were two versions of this function (integer and numeric parameter types)
-- which caused PostgREST to fail with "Could not choose the best candidate function"
--
-- The integer version is more complete (handles more resource types and unlimited plans)
-- so we keep that one and drop the numeric version.

DROP FUNCTION IF EXISTS public.check_usage_limit(uuid, text, numeric);

-- The remaining function signature is:
-- check_usage_limit(p_organization_id uuid, p_resource_type text, p_amount integer DEFAULT 1)
