-- Add buffer settings to profiles table
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS buffer_minutes INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS enable_buffer BOOLEAN DEFAULT FALSE;
