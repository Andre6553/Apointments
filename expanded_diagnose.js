
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const envFile = fs.readFileSync(path.join(process.cwd(), '.env'), 'utf8');
const env = Object.fromEntries(envFile.split('\n').filter(l => l && !l.startsWith('#')).map(l => l.split('=')));

const supabaseUrl = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
const supabaseServiceKey = env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function check() {
    console.log('--- Checking all schemas/tables for appointments ---');
    const { data: tables } = await supabase.rpc('exec_sql', {
        sql: "SELECT schemaname, tablename FROM pg_tables WHERE tablename = 'appointments';"
    });
    console.log('Tables found:', tables);

    console.log('\n--- Checking RLS Policies (Raw) ---');
    const { data: policies } = await supabase.rpc('exec_sql', {
        sql: "SELECT * FROM pg_policies WHERE tablename = 'appointments';"
    });
    console.log('Policies:', policies);

    console.log('\n--- Checking Profiles ---');
    const { data: profiles } = await supabase.from('profiles').select('id, full_name, email');
    console.log('Profiles:', JSON.stringify(profiles, null, 2));

    const aptId = '53c801c6-c04f-4a79-8c04-dbd95c8f0960';
    const { data: apt } = await supabase.from('appointments').select('assigned_profile_id').eq('id', aptId).single();
    console.log('\nAppt assigned to:', apt?.assigned_profile_id);
}
check();
