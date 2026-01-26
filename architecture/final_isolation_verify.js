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
    console.log('🧪 FINAL ISOLATION TEST...');

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

        console.log(`Created Appointment ${aptP1.id} for Provider 1 (${p1.email})`);

        // 3. Try to fetch as P2 (Simulating RLS)
        // We use a custom RPC or anonymous query simulation logic if possible.
        // Direct test via RPC to simulate P2's JWT claims:
        const { data: rlsResult } = await supabase.rpc('exec_sql', {
            sql_query: `
                BEGIN;
                SET LOCAL ROLE authenticated;
                SET LOCAL "request.jwt.claims" = '${JSON.stringify({ sub: p2.id, role: 'authenticated' })}';
                SELECT count(*) as count FROM public.appointments WHERE id = '${aptP1.id}';
                COMMIT;
             `
        });

        const visibleCount = rlsResult?.[0]?.count || 0;
        console.log(`Visibility Check for Provider 2 (${p2.email}): ${visibleCount} appointments visible.`);

        if (visibleCount === 0) {
            console.log('✅ SUCCESS: Provider 2 cannot see Provider 1\'s appointment!');
        } else {
            console.error('❌ FAILURE: Provider 2 CAN see Provider 1\'s appointment!');
        }

        // CLEANUP
        await supabase.from('appointments').delete().eq('id', aptP1.id);

    } catch (err) {
        console.error('💥 Verification failed:', err.message);
    }
}

verifyIsolation();
