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

const supabase = createClient(supabaseUrl, supabaseKey);

async function testTrigger() {
    console.log('Testing Cloud Scheduler Trigger...');
    // We call the internal function that pg_cron calls
    const { data, error } = await supabase.rpc('trigger_process_reminders');

    if (error) {
        console.error('❌ Trigger failed:', error);
    } else {
        console.log('✅ Trigger sent!');
        console.log('Note: Since this is an async HTTP call inside Postgres (pg_net), valid output is "null" or "void".');
        console.log('If you see this, the database successfully fired the request to the Edge Function.');
    }
}

testTrigger();
