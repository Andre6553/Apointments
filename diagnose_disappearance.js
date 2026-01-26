
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const envFile = fs.readFileSync(path.join(process.cwd(), '.env'), 'utf8');
const env = Object.fromEntries(envFile.split('\n').filter(l => l && !l.startsWith('#')).map(l => l.split('=')));

const supabaseUrl = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
const supabaseServiceKey = env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function diagnose() {
    const aptId = '53c801c6-c04f-4a79-8c04-dbd95c8f0960'; // From user log
    console.log(`--- Investigating Appointment ${aptId} ---`);

    // 1. Get raw data as service role (bypass RLS)
    const { data: apt, error: aptError } = await supabase
        .from('appointments')
        .select('*')
        .eq('id', aptId)
        .single();

    if (aptError) {
        console.error('❌ Could not find appointment:', aptError.message);
    } else {
        console.log('✅ Appointment details (Service Role):', JSON.stringify(apt, null, 2));
    }

    // 2. Check all policies on appointments
    console.log('\n--- Appointment Policies ---');
    const { data: policies, error: polError } = await supabase.rpc('exec_sql', {
        sql: "SELECT policyname, cmd, qual, with_check FROM pg_policies WHERE tablename = 'appointments';"
    });

    if (polError) {
        console.error('❌ Policy fetch error:', polError.message);
    } else {
        console.log('✅ Policies:', JSON.stringify(policies, null, 2));
    }

    // 3. Check publication
    const { data: pubData } = await supabase.rpc('exec_sql', {
        sql: "SELECT tablename FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'appointments';"
    });
    console.log('✅ Realtime Publication:', pubData ? 'Enabled' : 'Disabled');
}
diagnose();
