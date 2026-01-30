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

async function dumpRecent() {
    console.log('📋 Dumping Last 10 Updated/Created Appointments...');

    const { data: apts, error } = await supabase
        .from('appointments')
        .select(`
            id, 
            status, 
            created_at, 
            scheduled_start,
            assigned_profile_id,
            profile:profiles!appointments_assigned_profile_id_fkey(full_name, id),
            client:clients(first_name, last_name)
        `)
        .order('created_at', { ascending: false }) // Show most recently touched
        .limit(20);

    if (error) {
        console.error('Error:', error);
    } else {
        apts.forEach(a => {
            console.log(`[${new Date(a.updated_at).toLocaleTimeString()}] ${a.client?.first_name} ${a.client?.last_name || ''} -> ${a.profile?.full_name}`);
            console.log(`   ID: ${a.id}`);
            console.log(`   Provider ID: ${a.assigned_profile_id}`);
            console.log('-------------------------------------------');
        });
    }
}

dumpRecent();
