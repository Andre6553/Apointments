
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://wxwparezjiourhlvyalw.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind4d3BhcmV6amlvdXJobHZ5YWx3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTA1NjQyOCwiZXhwIjoyMDg0NjMyNDI4fQ.abW5spumitjnN2JC2IKwL4l7TUGW-05sIe4S6QV9-aI';

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

async function checkSchema() {
    console.log('--- Checking Table Info ---');

    // Check Treatments
    const { data: treatments, error: tError } = await supabase.from('treatments').select('*').limit(1);
    if (tError) {
        console.log('Treatments table might not exist or error:', tError.message);
    } else {
        console.log('Treatments table exists. Sample row:', treatments[0]);
    }

    // Check Profiles for skills
    const { data: profiles, error: pError } = await supabase.from('profiles').select('*').limit(1);
    console.log('Profile sample:', profiles[0]);
}

checkSchema();
