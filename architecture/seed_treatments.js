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

const TREATMENTS = [
    { name: 'Treatment 10', duration_minutes: 10, cost: 100 },
    { name: 'Treatment 20', duration_minutes: 20, cost: 200 },
    { name: 'Treatment 30', duration_minutes: 30, cost: 300 },
    { name: 'Treatment 40', duration_minutes: 40, cost: 400 },
    { name: 'Treatment 50', duration_minutes: 50, cost: 500 },
    { name: 'Treatment 60', duration_minutes: 60, cost: 600 },
    { name: 'Treatment 90', duration_minutes: 90, cost: 900 }
];

async function seed() {
    console.log('🚀 Replicating treatments for all demo providers...');

    try {
        const { data: admin } = await supabase.from('profiles').select('business_id').eq('email', 'admin@demo.com').single();
        const businessId = admin.business_id;

        const { data: profiles } = await supabase.from('profiles').select('id, email').eq('business_id', businessId);
        const profileIds = profiles.map(p => p.id);

        // Wipe existing treatments for these profiles
        await supabase.from('treatments').delete().in('profile_id', profileIds);

        const allTreatments = [];
        for (const profile of profiles) {
            TREATMENTS.forEach(t => {
                allTreatments.push({
                    profile_id: profile.id,
                    business_id: businessId,
                    name: t.name,
                    duration_minutes: t.duration_minutes,
                    cost: t.cost
                });
            });
        }

        const { error } = await supabase.from('treatments').insert(allTreatments);
        if (error) throw error;

        console.log(`✅ Success! Inserted ${allTreatments.length} treatments.`);
        process.exit(0);
    } catch (err) {
        console.error('💥 Failed:', err);
        process.exit(1);
    }
}

seed();
