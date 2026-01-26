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
    const sql = `
        SELECT table_name, column_name 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        ORDER BY table_name;
    `;
    const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql });

    if (error) {
        // Try 'sql' param
        const { data: data2, error: error2 } = await supabase.rpc('exec_sql', { sql });
        if (error2) {
            console.error('Error:', error2);
            return;
        }
        console.log(JSON.stringify(data2, null, 2));
    } else {
        console.log(JSON.stringify(data, null, 2));
    }
}

check();
