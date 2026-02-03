
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

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
const supabaseUrl = env.VITE_SUPABASE_URL;
const supabaseKey = env.VITE_SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function deepInvestigate() {
    const ids = ['b2834acc-6881-48fc-b1b1-86c9ca69e790', '8780a677-5b26-4e1d-b079-94be531e95b8', '620e58a2-6d49-4bf7-83a0-09b9d30c72dd'];

    console.log('🔍 Deep investigation for IDs:', ids);

    const { data: logs, error: logError } = await supabase
        .from('audit_logs')
        .select('*')
        .or(`payload->>appointment_id.in.(${ids.map(id => `"${id}"`).join(',')})`)
        .order('ts', { ascending: true });

    if (logError) {
        console.error('Error fetching logs:', logError);
    } else {
        logs.forEach(l => {
            console.log(`[${l.ts}] ${l.event_type} - ${l.description}`);
            console.log('   Payload:', JSON.stringify(l.payload));
        });
    }
}

deepInvestigate();
