-- Allow recipients to update the 'is_read' status of messages sent to them
-- This is required for Read Receipts to work (turning ticks green)

CREATE POLICY "Recipients can update read status"
ON public.temporary_messages
FOR UPDATE
USING (auth.uid() = receiver_id)
WITH CHECK (auth.uid() = receiver_id);
