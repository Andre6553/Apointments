import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://wxwparezjiourhlvyalw.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind4d3BhcmV6amlvdXJobHZ5YWx3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTA1NjQyOCwiZXhwIjoyMDg0NjMyNDI4fQ.abW5spumitjnN2JC2IKwL4l7TUGW-05sIe4S6QV9-aI';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function rebrandClients() {
    console.log('🚀 Rebranding clients to match provider numbers...');

    for (let i = 1; i <= 10; i++) {
        const email = `provider${i}@example.com`;
        const surname = `Provider${i}`;

        // 1. Find the profile ID for this email
        const { data: profile, error: profError } = await supabase
            .from('profiles')
            .select('id')
            .eq('email', email)
            .single();

        if (profError || !profile) {
            console.error(`❌ Could not find profile for ${email}:`, profError?.message);
            continue;
        }

        // 2. Update all clients belonging to this profile
        const { count, error: updateError } = await supabase
            .from('clients')
            .update({ last_name: surname })
            .eq('owner_id', profile.id);

        if (updateError) {
            console.error(`❌ Failed to update clients for ${email}:`, updateError.message);
        } else {
            console.log(`✅ Updated clients for ${email} to surname "${surname}"`);
        }
    }

    console.log('🏁 Rebranding complete!');
}

rebrandClients();
