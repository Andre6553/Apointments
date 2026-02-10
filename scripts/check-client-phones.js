
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Manual ENV loader
const __filename = fileURLToPath(import.meta.url);
const rootDir = path.resolve(path.dirname(__filename), '..');

const loadEnv = () => {
    let env = { ...process.env };
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
const supabaseUrl = env.VITE_SUPABASE_URL;
const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY || env.VITE_SUPABASE_SERVICE_ROLE_KEY || env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials in .env or .env.local');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkPhones() {
    console.log('Checking client phone numbers...');
    const { data: clients, error } = await supabase
        .from('clients')
        .select('id, first_name, last_name, phone')
        .limit(20);

    if (error) {
        console.error('Error fetching clients:', error);
        return;
    }

    if (!clients || clients.length === 0) {
        console.log('No clients found.');
        return;
    }

    console.log('--- Client Phone Formats ---');
    let nonE164Count = 0;
    clients.forEach(c => {
        const isE164 = c.phone && c.phone.startsWith('+') && c.phone.length > 9;
        const status = isE164 ? 'OK' : 'INVALID (Not E.164)';
        if (!isE164) nonE164Count++;
        console.log(`[${status}] ${c.first_name || 'Unk'} ${c.last_name || ''}: "${c.phone}"`);
    });

    console.log('----------------------------');
    console.log(`Summary: ${nonE164Count} out of ${clients.length} checked clients have non-E.164 numbers.`);
}

checkPhones();
