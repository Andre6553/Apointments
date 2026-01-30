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

async function inspectDelay() {
    const { data: apt } = await supabase
        .from('appointments')
        .select('*')
        .eq('id', '08546312-41ae-4b10-bf37-28c427e83603')
        .single();

    if (apt) {
        console.log('--- Appointment Diagnosis ---');
        console.log(`ID: ${apt.id}`);
        console.log(`Scheduled Start: ${apt.scheduled_start}`);
        console.log(`Delay Minutes: ${apt.delay_minutes}`);
        console.log(`Status: ${apt.status}`);

        const start = new Date(apt.scheduled_start);
        const now = new Date();
        const diffMins = (now - start) / 60000;

        console.log(`Real-time Diff: ${diffMins.toFixed(1)} mins`);

        if (diffMins < 0 && apt.delay_minutes > 0) {
            console.warn('⚠️ ANOMALY: Future appointment has positive delay!');
            console.log('Conclusion: Appointment was NOT rescheduled. It was already next week, but appeared in "Late" list due to bad data.');
        } else {
            console.log('Data seems consistent.');
        }
    } else {
        console.log('Appointment not found.');
    }
}

inspectDelay();
