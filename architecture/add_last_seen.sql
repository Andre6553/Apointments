-- Add last_seen to profiles for heartbeat tracking
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS last_seen TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Policy: Users update their own last_seen (already covered by "Users can update respective profile" usually, but let's be safe)
-- Existing profile policies likely cover this.
