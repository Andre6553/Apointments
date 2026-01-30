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

async function findMissingClient() {
    console.log('🕵️‍♂️ Searching for "Late Test Meeting"...');

    // Searching for any appointments created today
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const { data: apts } = await supabase
        .from('appointments')
        .select(`
            id, 
            status, 
            treatment_name, 
            scheduled_start,
            assigned_profile_id,
            profile:profiles!appointments_assigned_profile_id_fkey(full_name, id)
        `)
        .ilike('treatment_name', '%Late Test Meeting%')
        .gte('created_at', startOfDay.toISOString());

    if (!apts || apts.length === 0) {
        console.log('❌ No "Late Test Meeting" appointments found from today.');
    } else {
        console.log(`Found ${apts.length} recent test meetings:`);
        apts.forEach(a => {
            console.log(`- ${a.treatment_name}: Assigned to -> ${a.profile?.full_name} (${a.profile?.id})`);
        });
    }
}

findMissingClient();
