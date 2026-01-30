import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const rootDir = path.dirname(__filename);

function loadEnv() {
    try {
        const envPath = path.join(rootDir, '.env');
        const envFile = fs.readFileSync(envPath, 'utf8');
        const env = {};
        envFile.split('\n').forEach(line => {
            const parts = line.split('=');
            if (parts.length >= 2) {
                const key = parts[0].trim();
                const val = parts.slice(1).join('=').trim();
                env[key] = val;
            }
        });
        return env;
    } catch { return process.env; }
}

const env = loadEnv();
const supabaseUrl = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY || env.VITE_SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function stageScenario() {
    console.log('🎬 Staging "7 Late Meetings" Scenario...');

    // 1. Get a Business ID and Provider
    const { data: profiles, error: pError } = await supabase
        .from('profiles')
        .select('id, business_id, full_name')
        .limit(1);

    if (pError || !profiles || profiles.length === 0) {
        console.error('❌ No profiles found. Cannot stage scenario.');
        return;
    }

    const provider = profiles[0];
    console.log(`Using Provider: ${provider.full_name} (${provider.id})`);

    // 2. Get or Create a Dummy Client
    let clientId;
    const { data: clients } = await supabase.from('clients').select('id').limit(1);

    if (clients && clients.length > 0) {
        clientId = clients[0].id;
    } else {
        // Create one
        const { data: newClient } = await supabase.from('clients').insert({
            first_name: 'Staged',
            last_name: 'Client',
            phone: '+15550000000',
            business_id: provider.business_id
        }).select().single();
        clientId = newClient.id;
    }

    // 3. Create 7 Late Appointments
    const appointments = [];
    const now = new Date();

    for (let i = 0; i < 7; i++) {
        // Randomly 30 to 120 minutes late
        const delayMinutes = 30 + Math.floor(Math.random() * 90);
        const startDate = new Date(now.getTime() - delayMinutes * 60000);

        appointments.push({
            created_at: new Date(),
            scheduled_start: startDate.toISOString(),
            duration_minutes: 30,
            status: 'pending', // Still pending but in the past = LATE
            client_id: clientId,
            assigned_profile_id: provider.id,
            business_id: provider.business_id,
            treatment_name: `Late Test Meeting ${i + 1}`,
            notes: `Staged as ${delayMinutes} mins late`
        });
    }

    const { error: insError } = await supabase.from('appointments').insert(appointments);

    if (insError) {
        console.error('❌ Failed to insert appointments:', insError);
    } else {
        console.log('✅ Successfully created 7 late meetings!');
        console.log('Go check your Workload Balancer.');
    }
}

stageScenario();
