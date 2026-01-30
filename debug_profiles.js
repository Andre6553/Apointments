
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://wxwparezjiourhlvyalw.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind4d3BhcmV6amlvdXJobHZ5YWx3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTA1NjQyOCwiZXhwIjoyMDg0NjMyNDI4fQ.abW5spumitjnN2JC2IKwL4l7TUGW-05sIe4S6QV9-aI';

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

async function debugProfiles() {
    console.log('--- Debugging Admin vs Provider Visibility ---');

    // 1. Get Admin Profile
    const { data: admin } = await supabase
        .from('profiles')
        .select('*')
        .eq('email', 'admin@demo.com')
        .single();

    if (!admin) {
        console.error('Admin not found');
        return;
    }

    console.log(`\nADMIN: ${admin.full_name} (${admin.role})`);
    console.log(`Business ID: ${admin.business_id}`);
    console.log(`Is Online: ${admin.is_online}`);

    // 2. Fetch ALL profiles in this business
    const { data: profiles } = await supabase
        .from('profiles')
        .select('id, email, full_name, role, is_online, last_seen, business_id')
        .eq('business_id', admin.business_id);

    console.log(`\nFound ${profiles.length} profiles in Business ${admin.business_id}:`);

    const now = new Date();
    profiles.forEach(p => {
        const lastSeen = p.last_seen ? new Date(p.last_seen) : null;
        const diffSeconds = lastSeen ? Math.round((now - lastSeen) / 1000) : 'Never';

        let status = 'OFFLINE';
        if (p.is_online) status = 'ONLINE (DB Flag)';
        if (diffSeconds !== 'Never' && diffSeconds < 300) status += ' + RECENT HEARTBEAT';
        else status += ` (Stale: ${diffSeconds}s ago)`;

        console.log(`- [${p.role}] ${p.full_name} (${p.email})`);
        console.log(`  > Status: ${status}`);
    });
}

debugProfiles();
