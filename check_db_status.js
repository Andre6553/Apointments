
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const envFile = fs.readFileSync(path.join(process.cwd(), '.env'), 'utf8');
const env = Object.fromEntries(envFile.split('\n').filter(l => l && !l.startsWith('#')).map(l => l.split('=')));

const supabaseUrl = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
const supabaseServiceKey = env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function check() {
    console.log('--- Checking notifications table ---');

    // Check table exists and RLS
    const { data: tables, error: tableError } = await supabase.rpc('exec_sql', {
        sql: "SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public' AND tablename = 'notifications';"
    });

    if (tableError) {
        console.error('❌ Table check error:', tableError);
    } else {
        console.log('✅ Tables:', tables);
    }

    // Check policies
    const { data: policies, error: policyError } = await supabase.rpc('exec_sql', {
        sql: "SELECT policyname, permissive, roles, cmd, qual, with_check FROM pg_policies WHERE schemaname = 'public' AND tablename = 'notifications';"
    });

    if (policyError) {
        console.error('❌ Policy check error:', policyError);
    } else {
        console.log('✅ Policies:', policies);
    }

    // Check publication
    const { data: publication, error: pubError } = await supabase.rpc('exec_sql', {
        sql: "SELECT * FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'notifications';"
    });

    if (pubError) {
        console.error('❌ Publication check error:', pubError);
    } else {
        console.log('✅ Publication:', publication);
    }
}
check();
