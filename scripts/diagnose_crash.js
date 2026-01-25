import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://wxwparezjiourhlvyalw.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind4d3BhcmV6amlvdXJobHZ5YWx3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTA1NjQyOCwiZXhwIjoyMDg0NjMyNDI4fQ.abW5spumitjnN2JC2IKwL4l7TUGW-05sIe4S6QV9-aI';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function diagnose() {
    console.log('🔍 Starting Dashboard Crash Diagnosis...');

    // 1. Check for appointments with missing relations
    console.log('\n--- 1. Checking Appointments for Integrity ---');
    const { data: apts, error: aptError } = await supabase
        .from('appointments')
        .select('*, client:clients(id), provider:profiles(id)');

    if (aptError) {
        console.error('❌ Error fetching appointments:', aptError.message);
    } else {
        console.log(`Found ${apts.length} appointments.`);
        const brokenClients = apts.filter(a => !a.client);
        const brokenProviders = apts.filter(a => !a.provider);

        if (brokenClients.length > 0) console.warn(`⚠️ Found ${brokenClients.length} appointments with MISSING client records.`);
        if (brokenProviders.length > 0) console.warn(`⚠️ Found ${brokenProviders.length} appointments with MISSING provider records.`);
        if (brokenClients.length === 0 && brokenProviders.length === 0) console.log('✅ All appointments have valid relation pointers.');
    }

    // 2. Check for missing foreign key triggers/functions
    console.log('\n--- 2. Checking Profiles Integrity ---');
    const { data: profiles, error: profError } = await supabase.from('profiles').select('*');
    if (profError) {
        console.error('❌ Error fetching profiles:', profError.message);
    } else {
        console.log(`Found ${profiles.length} profiles.`);
        const missingMeta = profiles.filter(p => !p.full_name);
        if (missingMeta.length > 0) console.warn(`⚠️ Found ${missingMeta.length} profiles with NULL full_name (Potential Auth trigger issue).`);
    }

    // 3. Inspect specific appointment data for provider1
    console.log('\n--- 3. inspecting provider1 data ---');
    const { data: prov1 } = await supabase.auth.admin.listUsers();
    const p1 = prov1.users.find(u => u.email === 'provider1@example.com');
    if (p1) {
        const { data: p1Apts } = await supabase.from('appointments').select('*').eq('assigned_profile_id', p1.id);
        console.log(`Provider1 has ${p1Apts?.length || 0} appointments.`);
    }

    console.log('\n🏁 Diagnosis complete. Review the warnings above.');
}

diagnose();
