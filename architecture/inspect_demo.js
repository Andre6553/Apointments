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

async function inspect() {
    const { data, error } = await supabase
        .from('profiles')
        .select('*, business:businesses!profiles_business_id_fkey(name)')
        .eq('email', 'admin@demo.com')
        .single();

    if (error) {
        console.error('Error:', JSON.stringify(error, null, 2));
    } else {
        console.log('Profile:', JSON.stringify(data, null, 2));
    }
}

inspect();
