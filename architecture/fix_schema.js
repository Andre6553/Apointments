import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, '../.env');
const env = fs.readFileSync(envPath, 'utf8').split('\n').reduce((acc, line) => {
    const [key, ...value] = line.split('=');
    if (key && value) acc[key.trim()] = value.join('=').trim();
    return acc;
}, {});

const supabaseUrl = env['VITE_SUPABASE_URL'] || env['SUPABASE_URL'];
const serviceRoleKey = env['SUPABASE_SERVICE_ROLE_KEY'];

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function run() {
    try {
        console.log('Adding column if missing...');
        await supabase.rpc('exec_sql', { sql_query: 'ALTER TABLE working_hours ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;' });

        console.log('Reloading schema cache...');
        await supabase.rpc('exec_sql', { sql_query: 'NOTIFY pgrst, "reload schema";' });

        console.log('✅ Success!');
    } catch (err) {
        console.error('❌ Failed:', err.message);
        process.exit(1);
    }
}

run();
