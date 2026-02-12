import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url';

// Load .env from root manually
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, '.env');
let envContent = '';

try {
    envContent = fs.readFileSync(envPath, 'utf8');
} catch (e) {
    console.error('Could not read .env file', e);
    process.exit(1);
}

const env = {};
envContent.split('\n').forEach(line => {
    const [key, value] = line.split('=');
    if (key && value) {
        env[key.trim()] = value.trim();
    }
});

const supabaseUrl = env.VITE_SUPABASE_URL;
const supabaseServiceKey = env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing Supabase credentials in .env');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function migrate() {
    console.log('Running migration...');
    try {
        const sqlPath = path.join(__dirname, 'supabase/migrations/20260212_add_second_schedule.sql');
        const sql = fs.readFileSync(sqlPath, 'utf8');

        console.log(`Executing SQL from ${sqlPath}`);

        const { error: rpcError } = await supabase.rpc('exec_sql', { sql });

        if (rpcError) {
            console.error('RPC exec_sql failed:', rpcError);
            process.exit(1);
        } else {
            console.log('✅ Migration successful via RPC');
        }
    } catch (err) {
        console.error('Migration script error:', err);
        process.exit(1);
    }
}

migrate();
