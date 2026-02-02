
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// --- ENV Loader (Adapter from twilio-proxy.js) ---
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
const supabaseUrl = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY || env.VITE_SUPABASE_SERVICE_ROLE_KEY || env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Missing Supabase Credentials in .env');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const runVerification = async () => {
    console.log('--- Supabase Logging Verification ---');
    console.log(`Target: ${supabaseUrl}`);

    // 1. Write Test Log
    console.log('\n📝 Attempting to WRITE test log to "audit_logs"...');
    const testLog = {
        ts: new Date().toISOString(),
        schema: "lat.audit.v1.3.0",
        event_id: crypto.randomUUID(),
        trace_id: crypto.randomUUID(),
        level: "INFO",
        service: { name: "verification-script", env: "test" },
        event: { name: "system.verification.test", result_code: "OK" },
        actor: { type: "admin", id: "verifier", name: "Verification Bot" },
        payload: { message: "Verifying Supabase Write Access" },
        metrics: { test_run: true },
        context: { is_demo: true }
    };

    const { error: writeError } = await supabase.from('audit_logs').insert(testLog);

    if (writeError) {
        console.error('❌ WRITE FAILED:', writeError);
    } else {
        console.log('✅ WRITE SUCCESS');
    }

    // 2. Read Back Logs
    console.log('\n📖 Attempting to READ last 5 "audit_logs"...');
    const { data, error: readError } = await supabase
        .from('audit_logs')
        .select('*')
        .order('ts', { ascending: false })
        .limit(5);

    if (readError) {
        console.error('❌ READ FAILED:', readError);
    } else {
        console.log(`✅ READ SUCCESS: Retrieved ${data.length} logs.`);

        if (data.length > 0) {
            console.log('\n--- Recent Logs Analysis ---');
            data.forEach((log, i) => {
                console.log(`\n[${i + 1}] ${log.ts} | ${log.event?.name || 'Unknown Event'}`);
                console.log(`    Actor: ${log.actor?.name} (${log.actor?.role || 'No Logged Role'})`);
                console.log(`    Payload: ${JSON.stringify(log.payload).substring(0, 100)}...`);
                // Check for our test log
                if (log.event_id === testLog.event_id) {
                    console.log('    🌟 THIS IS THE VERIFICATION LOG WE JUST WROTE!');
                }
            });
        }
    }
};

runVerification();
