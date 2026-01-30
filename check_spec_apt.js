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

async function checkApt() {
    const { data: apt } = await supabase
        .from('appointments')
        .select('*')
        .eq('id', '08546312-41ae-4b10-bf37-28c427e83603')
        .single();

    if (apt) {
        console.log('Appointment Details:');
        console.log(`- Scheduled Start: ${apt.scheduled_start}`);
        const start = new Date(apt.scheduled_start);
        const now = new Date();
        const diffMins = (now - start) / 60000;
        console.log(`- Time since start: ${diffMins.toFixed(1)} minutes`);
        console.log(`- Status: ${apt.status}`);
        console.log(`- Assigned To: ${apt.assigned_profile_id}`);
    } else {
        console.log('Appointment not found.');
    }
}

checkApt();
