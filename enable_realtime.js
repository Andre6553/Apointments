
import { createClient } from '@supabase/supabase-js';
import { fileURLToPath } from 'url';

// Hardcoded creds for immediate fix
const SUPABASE_URL = 'https://wxwparezjiourhlvyalw.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind4d3BhcmV6amlvdXJobHZ5YWx3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTA1NjQyOCwiZXhwIjoyMDg0NjMyNDI4fQ.abW5spumitjnN2JC2IKwL4l7TUGW-05sIe4S6QV9-aI';

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const sql = `
-- Check if table exists in publication, if not add it
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND schemaname = 'public' 
    AND tablename = 'temporary_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.temporary_messages;
  END IF;
END
$$;
`;

async function enableRealtime() {
    console.log('Enabling Realtime for temporary_messages...');
    const { error } = await supabase.rpc('exec_sql', { sql });

    if (error) {
        console.error('❌ Failed:', error);
    } else {
        console.log('✅ Realtime Enabled!');
    }
}

enableRealtime();
