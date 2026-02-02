
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// Load .env
const envPath = path.resolve('.env');
const env = fs.readFileSync(envPath, 'utf8');
const getEnv = (key) => {
    const match = env.match(new RegExp(`${key}=(.*)`));
    return match ? match[1].trim().replace(/^['"]|['"]$/g, '') : null;
};

const SUPABASE_URL = getEnv('VITE_SUPABASE_URL');
const SERVICE_KEY = getEnv('SUPABASE_SERVICE_ROLE_KEY');

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

async function applyAuditHelpers() {
    console.log('Applying Audit Log Helper RPCs...');

    const migrationsDir = './supabase/migrations';
    const migrationFile = '20260202_add_audit_log_helpers.sql';
    const sql = fs.readFileSync(path.join(migrationsDir, migrationFile), 'utf8');

    const { error } = await supabase.rpc('exec_sql', { query: sql }); // Note: check if it's 'query' or 'sql'

    if (error) {
        console.error('RPC Error:', error);
        // Retry with 'sql' parameter if 'query' fails
        console.log('Retrying with "sql" parameter...');
        const { error: error2 } = await supabase.rpc('exec_sql', { sql });
        if (error2) console.error('RPC Retry Error:', error2);
        else console.log('Audit Helpers applied successfully (retry)!');
    } else {
        console.log('Audit Helpers applied successfully!');
    }
}

applyAuditHelpers();
