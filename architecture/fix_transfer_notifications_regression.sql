
-- 1. Fix RLS policies for notifications
-- Drop the restrictive policy that might have been reapplied
DROP POLICY IF EXISTS "Users can manage their own notifications" ON notifications;
DROP POLICY IF EXISTS "Users can view own notifications" ON notifications;
DROP POLICY IF EXISTS "Users can update own notifications" ON notifications;
DROP POLICY IF EXISTS "Users can delete own notifications" ON notifications;
DROP POLICY IF EXISTS "Users can insert notifications" ON notifications;

-- Policy (SELECT): Users can view only their own notifications
CREATE POLICY "Users can view own notifications" ON notifications
FOR SELECT USING (auth.uid() = user_id);

-- Policy (UPDATE): Users can update only their own notifications (e.g., mark as read)
CREATE POLICY "Users can update own notifications" ON notifications
FOR UPDATE USING (auth.uid() = user_id);

-- Policy (DELETE): Users can delete only their own notifications
CREATE POLICY "Users can delete own notifications" ON notifications
FOR DELETE USING (auth.uid() = user_id);

-- Policy (INSERT): Any authenticated user can create a notification for another user
-- This is critical for the "Transfer" feature where Provider A notifies Provider B
CREATE POLICY "Users can insert notifications" ON notifications
FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- 2. Ensure the table is in the realtime publication
-- This ensures the UI updates instantly when a new row is inserted
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
-- If it's already there, this might error, so we can wrap it or just ignore if it fails
