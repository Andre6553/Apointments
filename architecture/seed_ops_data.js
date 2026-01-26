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

async function seed() {
    console.log('🚀 Seeding operational data for Demo Business...');

    try {
        // 1. Get Admin and Providers
        const { data: profiles } = await supabase.from('profiles').select('*').eq('email', 'admin@demo.com').single();
        const businessId = profiles.business_id;
        const adminId = profiles.id;

        const { data: providers } = await supabase.from('profiles').select('*').eq('business_id', businessId).eq('role', 'Provider');

        // 2. Seed Working Hours for Admin (so Schedule page isn't blank)
        console.log('  Seeding Working Hours...');
        const workingHours = [];
        for (let i = 0; i < 7; i++) {
            workingHours.push({
                profile_id: adminId,
                business_id: businessId,
                day_of_week: i,
                start_time: '08:00',
                end_time: '17:00',
                is_active: i > 0 && i < 6 // Weekdays active
            });
        }
        await supabase.from('working_hours').insert(workingHours);

        // 3. Seed Treatments for Admin
        console.log('  Seeding Treatments...');
        const treatments = [
            { profile_id: adminId, business_id: businessId, name: 'Basic Consultation', duration: 30, cost: 50 },
            { profile_id: adminId, business_id: businessId, name: 'Deep Clean', duration: 60, cost: 120 },
            { profile_id: adminId, business_id: businessId, name: 'Advanced Treatment', duration: 90, cost: 250 }
        ];
        await supabase.from('treatments').insert(treatments);

        // 4. Seed Appointments for today (to fill Dashboard/Workload)
        console.log('  Seeding Appointments...');
        const { data: clients } = await supabase.from('clients').select('*').eq('business_id', businessId).limit(20);

        const today = new Date().toISOString().split('T')[0];
        const appointments = [];

        // Add 5 appointments for Admin
        for (let i = 0; i < 5; i++) {
            const startHour = 9 + i;
            appointments.push({
                business_id: businessId,
                assigned_profile_id: adminId,
                client_id: clients[i].id,
                scheduled_start: `${today}T${startHour.toString().padStart(2, '0')}:00:00`,
                duration_minutes: 45,
                status: 'active',
                treatment_name: 'Basic Consultation'
            });
        }

        // Add 1 appointment for each of the first 5 providers
        for (let i = 0; i < 5; i++) {
            appointments.push({
                business_id: businessId,
                assigned_profile_id: providers[i].id,
                client_id: clients[5 + i].id,
                scheduled_start: `${today}T10:00:00`,
                duration_minutes: 60,
                status: 'active',
                treatment_name: 'Standard Service'
            });
        }

        const { error: apptError } = await supabase.from('appointments').insert(appointments);
        if (apptError) throw apptError;

        console.log('✨ Operational data seeded successfully!');
        process.exit(0);
    } catch (err) {
        console.error('💥 Seeding failed:', err);
        process.exit(1);
    }
}

seed();
