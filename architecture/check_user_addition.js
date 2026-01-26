import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, '../.env');
const envStr = fs.readFileSync(envPath, 'utf8');
const env = envStr.split('\n').reduce((acc, line) => {
    const [key, ...value] = line.split('=');
    if (key && value.length > 0) acc[key.trim()] = value.join('=').trim().replace(/^["']|["']$/g, '');
    return acc;
}, {});

const supabaseUrl = env['VITE_SUPABASE_URL'] || env['SUPABASE_URL'];
const serviceRoleKey = env['SUPABASE_SERVICE_ROLE_KEY'];
const supabase = createClient(supabaseUrl, serviceRoleKey);

async function check() {
    const email = 'elzannearline@gmail.com';
    const { data: profile, error } = await supabase.from('profiles').select('*').eq('email', email).single();

    if (error) {
        console.error('Error finding profile:', error.message);
    } else {
        console.log('Target Profile:', JSON.stringify(profile, null, 2));
    }

    const { data: admin } = await supabase.from('profiles').select('*').eq('email', 'admin@demo.com').single();
    console.log('Admin Profile:', JSON.stringify(admin, null, 2));
}

check();
