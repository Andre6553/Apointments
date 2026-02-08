
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const loadEnv = () => {
    let env = { ...process.env };
    const rootDir = process.cwd();
    const loadFile = (filename) => {
        try {
            const envPath = path.join(rootDir, filename);
            if (!fs.existsSync(envPath)) return;
            const envFile = fs.readFileSync(envPath, 'utf8');
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
        } catch (e) { }
    };
    loadFile('.env');
    loadFile('.env.local');
    return env;
};

const env = loadEnv();
const supabase = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY || env.VITE_SUPABASE_ANON_KEY);

async function check() {
    // Try to find which table has 'action_type' and 'details'
    const tables = ['audit_logs', 'logs', 'activity_logs', 'system_logs', 'backups'];

    for (const table of tables) {
        try {
            const { data, error } = await supabase.from(table).select('*').limit(1);
            if (!error && data && data.length > 0) {
                console.log(`Table: ${table}, Columns:`, Object.keys(data[0]));
            } else if (error && error.code !== 'PGRST116' && error.code !== '42P01') {
                // console.log(`Table ${table} error:`, error.message);
            }
        } catch (e) { }
    }
}

check();
