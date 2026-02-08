
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

async function count() {
    const n = await supabase.from('notifications').select('*', { count: 'exact', head: true });
    const t = await supabase.from('temporary_messages').select('*', { count: 'exact', head: true });
    console.log('Notifications total:', n.count);
    console.log('Temporary Messages total:', t.count);
}

count();
