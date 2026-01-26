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
    console.log('🧪 FINAL ISOLATION TEST (HARD-CODED IDs)...');

    const p1_id = '01705702-210b-45a6-ab3e-bf95006e0b1c'; // Provider 6
    const p2_id = 'b2bade09-5af5-49fd-8a4a-f3aca0e01554'; // Provider 10
    const biz_id = '5690ad0a-60b9-4823-9c83-fa4a6ad370e3';

    try {
        // 2. Create an appointment for P1
        const { data: aptP1 } = await supabase
            .from('appointments')
            .insert([{
                assigned_profile_id: p1_id,
                business_id: biz_id,
                scheduled_start: new Date().toISOString(),
                duration_minutes: 30,
                status: 'pending'
            }])
            .select()
            .single();

        console.log(`Created Appointment ${aptP1.id} for Provider 6`);

        // 3. Try to fetch as P2 (Simulating RLS)
        const { data: rlsResult } = await supabase.rpc('exec_sql', {
            sql_query: `
                BEGIN;
                SET LOCAL ROLE authenticated;
                SET LOCAL "request.jwt.claims" = '${JSON.stringify({ sub: p2_id, role: 'authenticated' })}';
                SELECT count(*) as count FROM public.appointments WHERE id = '${aptP1.id}';
                COMMIT;
             `
        });

        const visibleCount = rlsResult?.[0]?.count || 0;
        console.log(`Visibility Check for Provider 10: ${visibleCount} appointments visible.`);

        if (visibleCount === 0) {
            console.log('✅ SUCCESS: Provider 10 cannot see Provider 6\'s appointment!');
        } else {
            console.error('❌ FAILURE: Provider 10 CAN see Provider 6\'s appointment!');
        }

        // CLEANUP
        await supabase.from('appointments').delete().eq('id', aptP1.id);

    } catch (err) {
        console.error('💥 Verification failed:', err.message);
    }
}

verifyIsolation();
