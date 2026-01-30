-- Add is_read column to temporary_messages
ALTER TABLE public.temporary_messages 
ADD COLUMN IF NOT EXISTS is_read BOOLEAN DEFAULT FALSE;

-- Update RLS policies to allow updating 'is_read'
-- Currently we have "Users can view their own messages" for SELECT
-- and "Users can insert..." for INSERT.
-- We need an UPDATE policy.

CREATE POLICY "Users can update read status of messages received"
    ON public.temporary_messages
    FOR UPDATE
    USING (auth.uid() = receiver_id)
    WITH CHECK (auth.uid() = receiver_id);
