-- Drop the restrictive policy
DROP POLICY IF EXISTS "Users can manage their own notifications" ON notifications;

-- Allow users to view/edit/delete ONLY their own notifications
CREATE POLICY "Users can view own notifications" ON notifications
FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update own notifications" ON notifications
FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own notifications" ON notifications
FOR DELETE USING (auth.uid() = user_id);

-- Allow ANY authenticated user to insert notifications (to send requests to others)
CREATE POLICY "Users can insert notifications" ON notifications
FOR INSERT WITH CHECK (auth.role() = 'authenticated');
