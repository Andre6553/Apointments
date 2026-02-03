import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

// --- ENV LOADER ---
const __filename = fileURLToPath(import.meta.url);
const rootDir = path.resolve(path.dirname(__filename), '..');

const loadEnv = () => {
    try {
        const envPath = path.join(rootDir, '.env');
        if (!fs.existsSync(envPath)) return process.env;
        const envFile = fs.readFileSync(envPath, 'utf8');
        const env = { ...process.env };
        envFile.split('\n').forEach(line => {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) return;
            const firstEq = trimmed.indexOf('=');
            if (firstEq === -1) return;
            const key = trimmed.substring(0, firstEq).trim();
            let val = trimmed.substring(firstEq + 1).trim();
            if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
                val = val.substring(1, val.length - 1);
            }
            if (key && val) env[key] = val;
        });
        return env;
    } catch (e) {
        return process.env;
    }
};

const env = loadEnv();
const supabase = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY); // Use Service Role to bypass RLS

const simulateCrisis = async () => {
    console.log('🔥 INITIATING CRISIS SIMULATION 🔥');

    // 1. Get a Provider and Business
    const { data: providers } = await supabase.from('profiles').select('*').eq('role', 'Provider').limit(1);
    if (!providers?.length) { console.error('No providers found!'); return; }

    const provider = providers[0];
    console.log(`target Provider: ${provider.full_name} (${provider.id})`);

    // 2. Get a Client (or create fake ones)
    const { data: clients } = await supabase.from('clients').select('*').limit(3);
    if (clients.length < 3) { console.error('Need at least 3 clients for this demo.'); return; }

    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];

    // 3. Create THE CRISIS (Root Cause)
    // An active appointment that started 2 hours ago and is still running
    const startTime1 = new Date(now.getTime() - (120 * 60000));

    console.log('--- Injecting Root Cause (Stuck/Late Session) ---');
    await supabase.from('appointments').insert({
        business_id: provider.business_id,
        assigned_profile_id: provider.id,
        client_id: clients[0].id,
        scheduled_start: startTime1.toISOString(),
        actual_start: startTime1.toISOString(),
        duration_minutes: 60,
        status: 'active',
        treatment_name: 'Complex Surgery (Simulated)',
        notes: 'Simulated Crisis Root Cause',
        delay_minutes: 130 // Artificial delay for testing
    });

    // 4. Create Collateral Dmage (The "load" to shed)
    console.log('--- Injecting Collateral Damage (Middle Session) ---');
    const startTime2 = new Date(now.getTime() - (30 * 60000)); // Should have started 30 mins ago
    await supabase.from('appointments').insert({
        business_id: provider.business_id,
        assigned_profile_id: provider.id,
        client_id: clients[1].id,
        scheduled_start: startTime2.toISOString(),
        duration_minutes: 45,
        status: 'pending',
        treatment_name: 'Standard Checkup',
        delay_minutes: 130 // Inherited delay
    });

    // 5. Create "Last Client" (The Deferral Candidate)
    console.log('--- Injecting Last Client (Deferral Candidate) ---');
    const startTime3 = new Date(now);
    startTime3.setHours(16, 0, 0, 0); // 4:00 PM today
    if (startTime3 < now) startTime3.setHours(now.getHours() + 1); // Ensure it's in "future" of today if late

    await supabase.from('appointments').insert({
        business_id: provider.business_id,
        assigned_profile_id: provider.id,
        client_id: clients[2].id,
        scheduled_start: startTime3.toISOString(),
        duration_minutes: 60,
        status: 'pending',
        treatment_name: 'Closing Session',
        delay_minutes: 130 // Inherited delay
    });

    // 6. BLOCK TOMORROW (To test "Smart Scan")
    // Use a dummy appointment to block the whole day tomorrow
    /* 
       We won't block it for now to see if it suggests "Tomorrow". 
       If you want to test the "+2 days logic", uncomment this.
    */
    /*
    const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(9, 0, 0, 0);
    await supabase.from('appointments').insert({
        business_id: provider.business_id,
        assigned_profile_id: provider.id,
        client_id: clients[0].id,
        scheduled_start: tomorrow.toISOString(),
        duration_minutes: 480, // 8 hours blocking
        status: 'pending',
        treatment_name: 'Full Day Block (Simulated)',
        notes: 'Blocking to force deferral to day after tomorrow'
    });
    */

    console.log('✅ SIMULATION COMPLETE');
    console.log('Go to the Dashboard. You should see:');
    console.log('1. RED CRISIS ALERT');
    console.log('2. Suggestion to "Load Shed" the middle client.');
    console.log('3. Suggestion to "Postpone" the last client.');
};

simulateCrisis();
