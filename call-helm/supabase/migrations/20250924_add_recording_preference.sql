-- Add recording preference to user profiles
-- Migration: Add default_record_calls column to user_profiles table

-- Add the column to store user's default recording preference
ALTER TABLE user_profiles 
ADD COLUMN IF NOT EXISTS default_record_calls BOOLEAN DEFAULT FALSE;

-- Add comment to document the column
COMMENT ON COLUMN user_profiles.default_record_calls IS 'User preference for automatically recording all outbound calls';

-- Create index for performance (optional but good practice)
CREATE INDEX IF NOT EXISTS idx_user_profiles_recording_preference 
ON user_profiles(default_record_calls) 
WHERE default_record_calls = true;

-- Update existing users to have recording disabled by default (explicit)
UPDATE user_profiles 
SET default_record_calls = FALSE 
WHERE default_record_calls IS NULL;