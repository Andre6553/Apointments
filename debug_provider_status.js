
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://wxwparezjiourhlvyalw.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind4d3BhcmV6amlvdXJobHZ5YWx3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTA1NjQyOCwiZXhwIjoyMDg0NjMyNDI4fQ.abW5spumitjnN2JC2IKwL4l7TUGW-05sIe4S6QV9-aI';

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

async function checkProviderStatus() {
    console.log('--- Checking Provider 2 & 3 Status ---');

    // 1. Get IDs for Provider 2 and 3
    const { data: providers } = await supabase
        .from('profiles')
        .select('id, email, full_name')
        .in('email', ['provider2@example.com', 'provider3@example.com']);

    if (!providers || providers.length === 0) {
        console.error('Providers not found');
        return;
    }

    const ids = providers.map(p => p.id);

    // 2. Fetch ALL appointments for them (active/pending)
    const { data: appts } = await supabase
        .from('appointments')
        .select('id, status, assigned_profile_id, scheduled_start, duration_minutes')
        .in('assigned_profile_id', ids);

    console.log(`Found ${appts.length} appointments for these providers.`);

    providers.forEach(p => {
        console.log(`\nProvider: ${p.full_name} (${p.email})`);
        const theirAppts = appts.filter(a => a.assigned_profile_id === p.id);

        const active = theirAppts.filter(a => a.status === 'active');
        if (active.length > 0) {
            console.log(`  [BUSY] Has ${active.length} ACTIVE appointment(s):`);
            active.forEach(a => console.log(`    - ID: ${a.id}, Start: ${a.scheduled_start}`));
        } else {
            console.log(`  [FREE] No ACTIVE appointments found. (Total appts: ${theirAppts.length})`);
            // Check if there are any that LOOK active but have wrong status?
            const potentiallyActive = theirAppts.filter(a => a.status !== 'completed' && a.status !== 'cancelled' && a.status !== 'active');
            if (potentiallyActive.length > 0) {
                console.log(`    WARNING: Has non-active/non-completed appts: ${potentiallyActive.map(a => `${a.status}`).join(', ')}`);
            }
        }
    });
}

checkProviderStatus();
