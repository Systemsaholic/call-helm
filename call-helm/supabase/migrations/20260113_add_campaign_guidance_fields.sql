-- Add campaign guidance fields for agent call panel
-- These fields help agents during calls and enable AI evaluation of call quality

-- Keywords: Important terms/phrases agents should mention during calls
-- Examples: product names, value propositions, compliance phrases, company name
ALTER TABLE call_lists ADD COLUMN IF NOT EXISTS keywords TEXT[] DEFAULT '{}';

-- Call Goals: Specific objectives for this campaign
-- Examples: "Book appointment", "Qualify lead", "Close sale", "Gather feedback"
ALTER TABLE call_lists ADD COLUMN IF NOT EXISTS call_goals TEXT[] DEFAULT '{}';

-- Script: The call script content (if script_template doesn't exist as TEXT)
-- Note: script_template already exists, so we'll use that

-- Add comment for documentation
COMMENT ON COLUMN call_lists.keywords IS 'Important keywords/phrases agents should mention during calls';
COMMENT ON COLUMN call_lists.call_goals IS 'Specific objectives/goals for calls in this campaign';
COMMENT ON COLUMN call_lists.script_template IS 'Call script content for agents to follow';
