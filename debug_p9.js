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

async function investigateP9() {
    console.log('🕵️‍♂️ Investigating Provider 9...');

    // 1. Find Provider 9
    const { data: providers } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .ilike('full_name', '%Provider 9%');

    if (!providers || providers.length === 0) {
        console.error('❌ Provider 9 not found.');
        return;
    }

    const p9 = providers[0];
    console.log(`Found: ${p9.full_name} (${p9.id})`);

    // 2. Find Appointments assigned to P9
    const { data: apts } = await supabase
        .from('appointments')
        .select('*')
        .eq('assigned_profile_id', p9.id)
        .order('scheduled_start', { ascending: false });

    if (!apts || apts.length === 0) {
        console.log('⚠️ No appointments assigned to Provider 9.');
    } else {
        console.log(`Found ${apts.length} appointments for P9:`);
        const now = new Date();
        apts.forEach(a => {
            const start = new Date(a.scheduled_start);
            const diffMins = (now - start) / 60000;
            console.log(`- [${a.status}] ${a.treatment_name || 'Untitled'} @ ${start.toLocaleString()} (${diffMins.toFixed(1)} mins ago)`);

            if (a.status === 'pending' && diffMins >= 240) {
                console.warn('  ⚠️ HIDDEN BY DASHBOARD FILTER (>= 240 mins)');
            } else if (a.status === 'pending') {
                console.log('  ✅ Should be VISIBLE on Dashboard');
            }
        });
    }
}

investigateP9();
