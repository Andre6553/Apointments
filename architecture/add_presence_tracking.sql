-- Add active_chat_id to profiles to track who the user is currently chatting with
-- If this is NULL, the user is not in a chat.
-- If it contains a UUID, the user is currently looking at the chat with that person.

ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS active_chat_id UUID NULL REFERENCES public.profiles(id);

-- No RLS change needed if profiles is already readable
-- But we might need to ensure users can update their OWN active_chat_id
CREATE POLICY "Users can update their own presence"
ON public.profiles
FOR UPDATE
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);
