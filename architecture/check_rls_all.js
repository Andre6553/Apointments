import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, '../.env');
const envStr = fs.readFileSync(envPath, 'utf8');
const env = envStr.split('\n').reduce((acc, line) => {
    const [key, ...value] = line.split('=');
    if (key && value.length > 0) acc[key.trim()] = value.join('=').trim().replace(/^["']|["']$/g, '');
    return acc;
}, {});

const supabaseUrl = env['VITE_SUPABASE_URL'] || env['SUPABASE_URL'];
const serviceRoleKey = env['SUPABASE_SERVICE_ROLE_KEY'];
const supabase = createClient(supabaseUrl, serviceRoleKey);

async function check() {
    const { data: rlsStatus, error: rlsError } = await supabase.rpc('exec_sql', {
        sql_query: `
            SELECT 
                relname as table_name, 
                relrowsecurity as rls_enabled,
                relforcerowsecurity as force_rls
            FROM pg_class c
            JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public' AND relname = 'appointments';
        `
    });
    console.log('RLS Status:', rlsStatus);

    const { data: policies, error: polError } = await supabase.rpc('exec_sql', {
        sql_query: `
            SELECT 
                policyname, 
                cmd, 
                qual, 
                with_check 
            FROM pg_policies 
            WHERE tablename = 'appointments';
        `
    });
    console.log('Policies:', policies);
}

check();
