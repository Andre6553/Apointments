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

const supabase = createClient(env['VITE_SUPABASE_URL'], env['SUPABASE_SERVICE_ROLE_KEY']);

async function check() {
    const { data, error } = await supabase
        .from('profiles')
        .select('*, business:businesses!profiles_business_id_fkey(name)')
        .eq('email', 'andre.ecprint@gmail.com')
        .single();

    if (error) {
        console.error('Error:', error);
    } else {
        console.log('Profile Data Found:');
        console.log(JSON.stringify(data, null, 2));
    }
}

check();
