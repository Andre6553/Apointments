import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Manual env parsing
const envPath = path.join(__dirname, '../.env');
const envStr = fs.readFileSync(envPath, 'utf8');
const env = envStr.split('\n').reduce((acc, line) => {
    const [key, ...value] = line.split('=');
    if (key && value.length > 0) acc[key.trim()] = value.join('=').trim().replace(/^["']|["']$/g, '');
    return acc;
}, {});

const supabaseUrl = env['VITE_SUPABASE_URL'] || env['SUPABASE_URL'];
const serviceRoleKey = env['SUPABASE_SERVICE_ROLE_KEY'];

if (!supabaseUrl || !serviceRoleKey) {
    console.error('❌ Missing environment variables (VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function applySql(filePath) {
    try {
        const absolutePath = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
        console.log(`Reading SQL from: ${absolutePath}`);

        if (!fs.existsSync(absolutePath)) {
            console.error(`❌ File not found: ${absolutePath}`);
            process.exit(1);
        }

        const sql = fs.readFileSync(absolutePath, 'utf8');

        console.log('Executing SQL via RPC...');
        const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql });

        if (error) {
            // Try alternate argument name if failed
            if (error.message?.includes('function') || error.message?.includes('sql_query')) {
                const { error: error2 } = await supabase.rpc('exec_sql', { sql: sql });
                if (error2) throw error2;
            } else {
                throw error;
            }
        }

        console.log('✅ SQL applied successfully');
        if (data) console.log('Result:', JSON.stringify(data, null, 2));
    } catch (err) {
        console.error('❌ Failed to apply SQL:', err.message);
        process.exit(1);
    }
}

const targetFile = process.argv[2];
if (!targetFile) {
    console.error('Usage: node architecture/apply_sql.js <relative_path_to_sql_file>');
    process.exit(1);
}

applySql(targetFile);
