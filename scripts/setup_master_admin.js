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
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
});

const email = 'apointmenttracker@gmail.com';
const password = 'Andre@58078';

async function setupMasterAdmin() {
    console.log(`Setting up MasterAdmin: ${email}`);

    // 1. Create User in Auth if not exists
    const { data: userData, error: authError } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true
    });

    if (authError) {
        if (authError.message.includes('already registered')) {
            console.log('User already exists in Auth system.');
        } else {
            console.error('Error creating auth user:', authError.message);
            // Don't exit, try to update profile anyway if user exists
        }
    } else {
        console.log('User created successfully in Auth system.');
    }

    // 2. Update Profile Role
    const { error: profileError } = await supabase
        .from('profiles')
        .update({
            role: 'MasterAdmin',
            full_name: 'Master Admin'
        })
        .eq('email', email);

    if (profileError) {
        console.error('Error updating profile role:', profileError.message);
    } else {
        console.log('Profile role updated to MasterAdmin successfully.');
    }

    console.log('Setup complete. You can now login.');
}

setupMasterAdmin();
