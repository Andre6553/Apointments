
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://wxwparezjiourhlvyalw.supabase.co';
const serviceRoleKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind4d3BhcmV6amlvdXJobHZ5YWx3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTA1NjQyOCwiZXhwIjoyMDg0NjMyNDI4fQ.abW5spumitjnN2JC2IKwL4l7TUGW-05sIe4S6QV9-aI';

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function listTables() {
    const sql = `
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public'
    `;
    const { data, error } = await supabase.rpc('exec_sql', { sql });
    if (error) {
        console.error('Error:', error);
    } else {
        console.log('Tables:', data);
    }
}

listTables();
