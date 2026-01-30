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

async function findClient3() {
    console.log('🕵️‍♂️ Searching for "Client 3 (P1)"...');

    // 1. Find Client ID
    const { data: clients, error } = await supabase
        .from('clients')
        .select('*')
        .ilike('first_name', '%Client 3%');

    if (!clients || clients.length === 0) {
        console.log('❌ Client not found by name.');
        return;
    }

    console.log(`Found ${clients.length} matching clients.`);

    for (const c of clients) {
        console.log(`Ref: ${c.first_name} ${c.last_name || ''} (${c.id})`);

        // 2. Check Appointments
        const { data: apts } = await supabase
            .from('appointments')
            .select(`
                id, status, scheduled_start, updated_at,
                assigned_profile_id,
                profile:profiles!appointments_assigned_profile_id_fkey(full_name, whatsapp)
            `)
            .eq('client_id', c.id)
            .order('scheduled_start', { ascending: false });

        if (apts && apts.length > 0) {
            apts.forEach(a => {
                console.log(`   Meeting: ${a.status} @ ${new Date(a.scheduled_start).toLocaleString()}`);
                console.log(`   Assigned To: ${a.profile?.full_name} (Whatsapp: ${a.profile?.whatsapp})`);
                console.log(`   Last Updated: ${a.updated_at}`);
                console.log('------------------------------------------------');
            });
        } else {
            console.log('   No appointments.');
        }
    }
}

findClient3();
