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

async function test() {
    console.log('Testing User Creation...');
    const { data, error } = await supabase.auth.admin.createUser({
        email: 'test@example.com',
        password: 'Password123!',
        user_metadata: {
            full_name: 'Test Admin',
            role: 'Admin', // Test the Admin trigger
            whatsapp: '+0000000000'
        }
    });

    if (error) {
        console.error('Error:', JSON.stringify(error, null, 2));
    } else {
        console.log('Success:', data.user.id);
        // Clean up
        await supabase.auth.admin.deleteUser(data.user.id);
    }
}

test();
