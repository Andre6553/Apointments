import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://wxwparezjiourhlvyalw.supabase.co';
const serviceRoleKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind4d3BhcmV6amlvdXJobHZ5YWx3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTA1NjQyOCwiZXhwIjoyMDg0NjMyNDI4fQ.abW5spumitjnN2JC2IKwL4l7TUGW-05sIe4S6QV9-aI';

const supabase = createClient(supabaseUrl, serviceRoleKey);

const sql = `
-- 1. Drop potentially conflicting policies
DROP POLICY IF EXISTS "Users can manage their own notifications" ON notifications;
DROP POLICY IF EXISTS "Users can view own notifications" ON notifications;
DROP POLICY IF EXISTS "Users can update own notifications" ON notifications;
DROP POLICY IF EXISTS "Users can delete own notifications" ON notifications;
DROP POLICY IF EXISTS "Users can insert notifications" ON notifications;

-- 2. Re-create granular policies
-- VIEW: Own only
CREATE POLICY "Users can view own notifications" ON notifications
FOR SELECT USING (auth.uid() = user_id);

-- UPDATE: Own only
CREATE POLICY "Users can update own notifications" ON notifications
FOR UPDATE USING (auth.uid() = user_id);

-- DELETE: Own only
CREATE POLICY "Users can delete own notifications" ON notifications
FOR DELETE USING (auth.uid() = user_id);

-- INSERT: Authenticated users can insert for ANYONE (needed for cross-user notifications)
CREATE POLICY "Users can insert notifications" ON notifications
FOR INSERT WITH CHECK (auth.role() = 'authenticated');
`;

async function applyFix() {
    console.log('🚀 Applying RLS Policy Fix...');
    const { error } = await supabase.rpc('exec_sql', { sql });

    if (error) {
        console.error('❌ Failed:', error);
    } else {
        console.log('✅ RLS Policies successfully reset and applied.');
    }
}

applyFix();
