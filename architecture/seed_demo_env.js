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

const DEMO_PHONE = '+27761963997';

async function seed() {
    console.log('🚀 Starting Manual Seeding (Triggers Disabled)...');

    try {
        // 1. Clear Auth Users
        const { data: { users } } = await supabase.auth.admin.listUsers();
        for (const user of users) {
            await supabase.auth.admin.deleteUser(user.id);
        }

        // 2. Clear Public Data
        await supabase.rpc('exec_sql', { sql: "DELETE FROM appointments; DELETE FROM clients; DELETE FROM businesses; DELETE FROM profiles;" });

        // 3. Create Demo Admin
        console.log('👑 Creating Admin...');
        const { data: adminUser, error: adminError } = await supabase.auth.admin.createUser({
            email: 'admin@demo.com',
            password: 'Demo12345',
            email_confirm: true,
            user_metadata: { full_name: 'Demo Admin', role: 'Admin', whatsapp: DEMO_PHONE }
        });
        if (adminError) throw adminError;

        // Manual Profile Insert (since trigger is disabled)
        await supabase.from('profiles').insert({
            id: adminUser.user.id,
            email: 'admin@demo.com',
            full_name: 'Demo Admin',
            role: 'Admin',
            whatsapp: DEMO_PHONE
        });

        // 4. Create Business
        const { data: biz } = await supabase.from('businesses').insert({
            name: 'Demo Business',
            owner_id: adminUser.user.id
        }).select().single();

        await supabase.from('profiles').update({ business_id: biz.id }).eq('id', adminUser.user.id);

        // 5. Create 10 Providers
        for (let i = 1; i <= 10; i++) {
            const email = `provider${i}@example.com`;
            console.log(`👨‍⚕️ Provisioning ${email}...`);

            const { data: provUser, error: provError } = await supabase.auth.admin.createUser({
                email: email,
                password: 'Password123!',
                email_confirm: true,
                user_metadata: { full_name: `Provider ${i}`, role: 'Provider', whatsapp: DEMO_PHONE }
            });
            if (provError) continue;

            // Manual Profile Insert
            await supabase.from('profiles').insert({
                id: provUser.user.id,
                email: email,
                full_name: `Provider ${i}`,
                role: 'Provider',
                whatsapp: DEMO_PHONE,
                business_id: biz.id
            });

            // Seed 10 Clients
            const clients = Array.from({ length: 10 }, (_, j) => ({
                owner_id: provUser.user.id,
                business_id: biz.id,
                first_name: `Client ${j + 1}`,
                last_name: `(P${i})`,
                phone: DEMO_PHONE,
                email: `p${i}.c${j + 1}@testing.com`
            }));
            await supabase.from('clients').insert(clients);
        }

        console.log('✨ SUCCESS: Demo environment live.');
        process.exit(0);

    } catch (err) {
        console.error('💥 FATAL:', err);
        process.exit(1);
    }
}

seed();
