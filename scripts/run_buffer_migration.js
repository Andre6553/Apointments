import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const SUPABASE_URL = 'https://wxwparezjiourhlvyalw.supabase.co';
// Using the service role key provided in the workspace context/previous successes
const SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind4d3BhcmV6amlvdXJobHZ5YWx3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTA1NjQyOCwiZXhwIjoyMDg0NjMyNDI4fQ.abW5spumitjnN2JC2IKwL4l7TUGW-05sIe4S6QV9-aI';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function migrate() {
    console.log('🚀 Running migration: add_buffer_to_profiles.sql...');
    const sql = fs.readFileSync(path.join(process.cwd(), 'architecture/add_buffer_to_profiles.sql'), 'utf8');
    const { error } = await supabase.rpc('exec_sql', { sql });

    if (error) {
        console.error('❌ Migration failed:', error);
        process.exit(1);
    } else {
        console.log('✅ Migration successful');
        process.exit(0);
    }
}

migrate();
