
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const rootDir = path.dirname(__filename);

// Hardcoding for reliability in this specific run context
const SUPABASE_URL = 'https://wxwparezjiourhlvyalw.supabase.co';
// Using SERVICE_ROLE_KEY from .env (read in step 535)
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind4d3BhcmV6amlvdXJobHZ5YWx3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTA1NjQyOCwiZXhwIjoyMDg0NjMyNDI4fQ.abW5spumitjnN2JC2IKwL4l7TUGW-05sIe4S6QV9-aI';

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

async function migrate() {
    try {
        // Read the SQL file we created earlier
        const sqlPath = path.join(process.cwd(), 'architecture/add_last_seen.sql');
        const sql = fs.readFileSync(sqlPath, 'utf8');

        console.log('Running migration via exec_sql RPC...');
        const { error } = await supabase.rpc('exec_sql', { sql });

        if (error) {
            console.error('❌ Migration failed:', error);
            process.exit(1);
        } else {
            console.log('✅ Migration successful: active_chat_id column added.');
        }
    } catch (err) {
        console.error('Script error:', err);
    }
}

migrate();
