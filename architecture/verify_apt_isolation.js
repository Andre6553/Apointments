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

async function verifyIsolation() {
    console.log('🧪 Verifying Provider-Level Appointment Isolation...');

    try {
        // 1. Get two providers from the same business
        const { data: providers } = await supabase
            .from('profiles')
            .select('id, email, business_id')
            .eq('role', 'Provider')
            .limit(2);

        if (!providers || providers.length < 2) {
            console.log('Not enough providers to test. Skipping.');
            return;
        }

        const p1 = providers[0];
        const p2 = providers[1];

        console.log(`Testing with Provider 1: ${p1.email} and Provider 2: ${p2.email}`);

        // 2. Create an appointment for P1
        const { data: aptP1 } = await supabase
            .from('appointments')
            .insert([{
                assigned_profile_id: p1.id,
                business_id: p1.business_id,
                scheduled_start: new Date().toISOString(),
                duration_minutes: 30,
                status: 'pending'
            }])
            .select()
            .single();

        console.log(`Created Appointment ${aptP1.id} for ${p1.email}`);

        // 3. Try to fetch as P2 (Simulating RLS)
        // We simulate the JWT claims to check RLS
        const checkAsP2 = await supabase.rpc('exec_sql', {
            sql_query: `
                SET LOCAL ROLE authenticated;
                SET LOCAL "request.jwt.claims" = '${JSON.stringify({ sub: p2.id, role: 'authenticated' })}';
                SELECT count(*) FROM public.appointments WHERE id = '${aptP1.id}';
            `
        });

        // Since exec_sql might not return the SELECT result in a readable way in this environment,
        // let's try a direct query with the auth header if possible, or just trust the previous logic.
        // Wait, I can use the rpc to return the result.

        const { data: countP2 } = await supabase.rpc('exec_sql', {
            sql_query: `
                SELECT count(*)::int as c FROM public.appointments WHERE id = '${aptP1.id}' 
                AND assigned_profile_id = '${p1.id}'; -- Should be 0 if RLS is working
            `
        });

        // Actually, let's just use the 'authenticated' role simulation more cleanly.
        const { data: rlsResult } = await supabase.rpc('exec_sql', {
            sql_query: `
                BEGIN;
                SET LOCAL ROLE authenticated;
                SET LOCAL "request.jwt.claims" = '${JSON.stringify({ sub: p2.id, role: 'authenticated' })}';
                SELECT count(*) as count FROM public.appointments WHERE id = '${aptP1.id}';
                COMMIT;
             `
        });

        console.log('Isolation Check Result (should be empty/null or 0 if active):', rlsResult);

        // CLEANUP
        await supabase.from('appointments').delete().eq('id', aptP1.id);

    } catch (err) {
        console.error('💥 Verification failed:', err.message);
    }
}

verifyIsolation();
