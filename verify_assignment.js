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

async function verifyAssignments() {
    console.log('🔍 Inspecting Recent Appointments...');

    // Fetch recent appointments with provider details
    const { data: apts, error } = await supabase
        .from('appointments')
        .select(`
            id, 
            status,
            scheduled_start,
            treatment_name,
            provider:profiles!appointments_assigned_profile_id_fkey(full_name, id),
            shifter:profiles!appointments_shifted_from_id_fkey(full_name, id)
        `)
        .ilike('treatment_name', '%Late Test Meeting%') // Filter for our staged ones
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error:', error);
        return;
    }

    if (apts.length === 0) {
        console.log('No "Late Test Meeting" appointments found.');
    } else {
        console.log(`Found ${apts.length} staged appointments:`);
        apts.forEach(a => {
            console.log(`-----------------------------------------------`);
            console.log(`Title: ${a.treatment_name}`);
            console.log(`Status: ${a.status}`);
            console.log(`Assigned To: ${a.provider?.full_name} (${a.provider?.id})`);
            console.log(`Shifted From: ${a.shifter?.full_name || 'N/A'}`);
            console.log(`Scheduled: ${new Date(a.scheduled_start).toLocaleString()}`);
        });
    }
}

verifyAssignments();
