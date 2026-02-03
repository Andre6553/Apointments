
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

async function investigateNolan() {
    const clientId = '17a7047c-cc3b-4c3d-becc-33e4d66c3d79';
    const appointmentId = 'b2834acc-6881-48fc-b1b1-86c9ca69e790';
    const altAppointmentId = '8780a677-5b26-4e1d-b079-94be531e95b8';

    console.log('🔍 Investigating Nolan Timeline...');

    // Search for any log that mentions Nolan's client ID or the target appointment IDs in the payload
    const { data: logs, error } = await supabase
        .from('audit_logs')
        .select('*')
        .or(`payload->>client_id.eq.${clientId},payload->>appointment_id.eq.${appointmentId},payload->>appointment_id.eq.${altAppointmentId}`)
        .order('ts', { ascending: true });

    if (error) {
        console.error('Error:', error);
        return;
    }

    if (logs.length === 0) {
        console.log('No logs found for these IDs.');
        // Try searching by name in actor or metadata if possible, but IDs are better.
        return;
    }

    console.log(`\nTimeline for Nolan (Client ID: ${clientId}):`);
    logs.forEach(l => {
        const eventName = l.event?.name || 'Unknown Event';
        const actorName = l.actor?.name || 'System';
        const actorRole = l.actor?.role || '';
        const timestamp = new Date(l.ts).toLocaleString();

        console.log(`[${timestamp}] ${eventName.toUpperCase()}`);
        console.log(`  Actor: ${actorName} (${actorRole})`);

        if (l.payload.appointment_id) {
            console.log(`  Apt ID: ${l.payload.appointment_id}`);
            if (l.payload.scheduled_start) {
                console.log(`  Scheduled: ${new Date(l.payload.scheduled_start).toLocaleString()}`);
            }
        }

        if (l.event.reason) console.log(`  Reason: ${l.event.reason}`);
        if (l.context?.reason) console.log(`  Context Reason: ${l.context.reason}`);
        console.log('---');
    });
}

investigateNolan();
