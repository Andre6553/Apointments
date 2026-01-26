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
    const { data: admin } = await supabase.from('profiles').select('id, business_id').eq('email', 'admin@demo.com').single();
    const { data: business } = await supabase.from('businesses').select('*').eq('id', admin.business_id).single();

    console.log('Admin ID:', admin.id);
    console.log('Business Info:', JSON.stringify(business, null, 2));

    if (business.owner_id === admin.id) {
        console.log('✅ Ownership correct.');
    } else {
        console.warn('❌ Ownership mismatch! RLS will block updates.');
        // Auto-fix if mismatch found
        await supabase.from('businesses').update({ owner_id: admin.id }).eq('id', business.id);
        console.log('🔧 Ownership auto-fixed.');
    }
}

check();
