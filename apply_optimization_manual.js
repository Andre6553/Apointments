
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const rootDir = path.dirname(__filename);

// Hardcoded creds
const SUPABASE_URL = 'https://wxwparezjiourhlvyalw.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind4d3BhcmV6amlvdXJobHZ5YWx3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTA1NjQyOCwiZXhwIjoyMDg0NjMyNDI4fQ.abW5spumitjnN2JC2IKwL4l7TUGW-05sIe4S6QV9-aI';

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

async function optimize() {
    try {
        const sqlPath = path.join(process.cwd(), 'architecture/optimization.sql');
        const sql = fs.readFileSync(sqlPath, 'utf8');

        console.log('Applying Optimization Indexes...');
        const { error } = await supabase.rpc('exec_sql', { sql });

        if (error) {
            console.error('❌ Indexing failed:', error);
        } else {
            console.log('✅ Indexes applied successfully.');
        }
    } catch (err) {
        console.error('Script error:', err);
    }
}

optimize();
