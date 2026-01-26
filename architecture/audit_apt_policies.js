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
    const { data: policies } = await supabase.rpc('exec_sql', {
        sql_query: "SELECT policyname, qual, cmd FROM pg_policies WHERE tablename = 'appointments';"
    });
    console.log('Appointments Policies:', JSON.stringify(policies, null, 2));

    const { data: rlsStatus } = await supabase.rpc('exec_sql', {
        sql_query: "SELECT relrowsecurity FROM pg_class WHERE relname = 'appointments';"
    });
    console.log('Appointments RLS Status:', rlsStatus);
}

check();
