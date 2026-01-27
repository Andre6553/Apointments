import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const rootDir = path.dirname(__filename);

function loadEnv() {
    try {
        const envPath = path.join(rootDir, '.env');
        const envFile = fs.readFileSync(envPath, 'utf8');
        const env = {};
        envFile.split('\n').forEach(line => {
            const parts = line.split('=');
            if (parts.length >= 2) {
                const key = parts[0].trim();
                const val = parts.slice(1).join('=').trim();
                env[key] = val;
            }
        });
        return env;
    } catch { return process.env; }
}

const env = loadEnv();
const supabaseUrl = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY || env.VITE_SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseKey) {
    console.error("Missing SERVICE_ROLE_KEY, cannot perform schema migration via RPC.");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
    try {
        const migrationSql = fs.readFileSync(path.join(rootDir, 'architecture', 'add_reminder_column.sql'), 'utf8');
        console.log('Running migration via RPC exec_sql...');

        const { error } = await supabase.rpc('exec_sql', { sql: migrationSql });

        if (error) {
            console.error('Migration RPC failed:', error);
            // Fallback: Try specific error handling or just log it
            // If exec_sql doesn't exist, this will fail.
        } else {
            console.log('Migration successful!');
        }
    } catch (e) {
        console.error('Migration failed:', e);
    }
}

run();
