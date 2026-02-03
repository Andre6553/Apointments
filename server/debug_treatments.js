
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
const supabaseUrl = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY || env.VITE_SUPABASE_SERVICE_ROLE_KEY || env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkTreatments() {
    const { data: treatments } = await supabase.from('treatments').select('*').limit(1);
    console.log('Treatment sample:', treatments[0]);
}

checkTreatments();
