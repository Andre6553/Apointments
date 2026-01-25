-- Add accepts_transfers column to profiles
ALTER TABLE profiles 
ADD COLUMN accepts_transfers BOOLEAN DEFAULT true;

-- Update RLS to allow reading this column (already covered by public profiles policy)
