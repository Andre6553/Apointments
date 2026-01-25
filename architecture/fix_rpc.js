import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://wxwparezjiourhlvyalw.supabase.co';
const serviceRoleKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind4d3BhcmV6amlvdXJobHZ5YWx3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTA1NjQyOCwiZXhwIjoyMDg0NjMyNDI4fQ.abW5spumitjnN2JC2IKwL4l7TUGW-05sIe4S6QV9-aI';

const supabase = createClient(supabaseUrl, serviceRoleKey);

const sqlToRun = `
    DROP FUNCTION IF EXISTS exec_sql(text);
    
    CREATE OR REPLACE FUNCTION exec_sql(sql text)
    RETURNS void
    LANGUAGE plpgsql
    SECURITY DEFINER
    AS $$
    BEGIN
      EXECUTE sql;
    END;
    $$;
`;

async function fixRpc() {
    console.log('🔧 Attempting to standardize exec_sql function...');
    // Try using the 'sql_query' parameter name which currently exists
    const { error } = await supabase.rpc('exec_sql', { sql_query: sqlToRun });

    if (error) {
        console.error('❌ Failed to fix RPC:', error);
        // Fallback: Try with 'sql' just in case it was already fixed
        const { error: retryError } = await supabase.rpc('exec_sql', { sql: sqlToRun });
        if (retryError) {
            console.error('❌ Retry also failed:', retryError);
        } else {
            console.log('✅ RPC function standardized (on retry)!');
        }
    } else {
        console.log('✅ RPC function standardized!');
    }
}

fixRpc();
