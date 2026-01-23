import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Manual env parsing since we don't have dotenv installed and want to keep it light
const envPath = path.join(__dirname, '../.env');
const env = fs.readFileSync(envPath, 'utf8').split('\n').reduce((acc, line) => {
    const [key, ...value] = line.split('=');
    if (key && value) acc[key.trim()] = value.join('=').trim();
    return acc;
}, {});

const supabaseUrl = env['VITE_SUPABASE_URL'] || env['SUPABASE_URL'];
const serviceRoleKey = env['SUPABASE_SERVICE_ROLE_KEY'];

if (!supabaseUrl || !serviceRoleKey) {
    console.error('❌ Missing environment variables');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function migrate() {
    try {
        console.log('Reading migration file...');
        const sqlPath = path.join(__dirname, 'working_hours.sql');
        const sql = fs.readFileSync(sqlPath, 'utf8');

        console.log('Executing migration via RPC...');
        const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql }); // Trying both 'sql' and 'sql_query' argument names

        if (error) {
            // If function doesn't exist, we try 'sql' as the argument name
            if (error.message?.includes('function') || error.message?.includes('sql_query')) {
                const { error: error2 } = await supabase.rpc('exec_sql', { sql: sql });
                if (error2) throw error2;
            } else {
                throw error;
            }
        }

        console.log('✅ Migration successful');
    } catch (err) {
        console.error('❌ Migration failed:', err.message);
        if (err.message?.includes('3D000')) {
            console.error('💡 Tip: Ensure the exec_sql function is created in your Supabase project.');
        }
        process.exit(1);
    }
}

migrate();
