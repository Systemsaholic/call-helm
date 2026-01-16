-- Add unique constraint on phone_numbers.number to prevent same number being assigned to multiple orgs
-- First, we need to ensure there are no duplicates (should be clean now after manual cleanup)

-- Add unique constraint
ALTER TABLE phone_numbers
ADD CONSTRAINT phone_numbers_number_unique UNIQUE (number);

-- Add comment explaining the constraint
COMMENT ON CONSTRAINT phone_numbers_number_unique ON phone_numbers IS
'Ensures each phone number can only be assigned to one organization at a time';
