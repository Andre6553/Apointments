
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
    console.log('🔍 Investigating Nolan...');

    // 1. Find the client
    const { data: clients, error: clientError } = await supabase
        .from('clients')
        .select('*')
        .ilike('first_name', '%Nolan%');

    if (clientError) {
        console.error('Error fetching client:', clientError);
        return;
    }

    if (!clients || clients.length === 0) {
        console.log('No client named Nolan found.');
        return;
    }

    const nolan = clients[0];
    console.log('Found Client:', nolan.first_name, nolan.last_name, 'ID:', nolan.id);

    // 2. Find appointments
    const { data: appointments, error: aptError } = await supabase
        .from('appointments')
        .select('*')
        .eq('client_id', nolan.id)
        .order('scheduled_start', { ascending: false });

    if (aptError) {
        console.error('Error fetching appointments:', aptError);
        return;
    }

    console.log('\n📅 Appointments:');
    appointments.forEach(a => {
        console.log(`- ID: ${a.id}, Start: ${a.scheduled_start}, Status: ${a.status}`);
    });

    // 3. Find Audit Logs
    const { data: logs, error: logError } = await supabase
        .from('audit_logs')
        .select('*')
        .or(`payload->>appointment_id.eq.${appointments[0]?.id},payload->>client_id.eq.${nolan.id}`)
        .order('ts', { ascending: true });

    if (logError) {
        console.error('Error fetching audit logs:', logError);
    } else {
        console.log('\n📜 Audit Trail:');
        logs.forEach(l => {
            console.log(`[${l.ts}] ${l.event_type} - ${l.description}`);
            if (l.payload) console.log('   Payload:', JSON.stringify(l.payload));
        });
    }
}

investigateNolan();
