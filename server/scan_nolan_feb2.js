
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

async function scanLogs() {
    console.log('🔍 Scanning all logs for Feb 2nd...');

    const { data: logs, error } = await supabase
        .from('audit_logs')
        .select('*')
        .gte('ts', '2026-02-02T00:00:00Z')
        .lte('ts', '2026-02-03T00:00:00Z')
        .order('ts', { ascending: true });

    if (error) {
        console.error(error);
        return;
    }

    console.log(`Found ${logs.length} logs for Feb 2nd.`);

    const nolanLogs = logs.filter(l => {
        const payloadStr = JSON.stringify(l.payload || {});
        const actorStr = JSON.stringify(l.actor || {});
        return payloadStr.includes('17a7047c-cc3b-4c3d-becc-33e4d66c3d79') || // Nolan's ID
            payloadStr.toLowerCase().includes('nolan') ||
            actorStr.toLowerCase().includes('nolan');
    });

    console.log(`\nFiltered ${nolanLogs.length} logs for Nolan:`);
    nolanLogs.forEach(l => {
        console.log(`[${l.ts}] ${l.event.name}: ${l.actor.name} - ${l.payload.appointment_id || 'N/A'}`);
        if (l.event.name.includes('create')) {
            console.log('  CREATED at:', l.payload.scheduled_start);
        }
    });
}

scanLogs();
