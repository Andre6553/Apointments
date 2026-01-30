
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://wxwparezjiourhlvyalw.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind4d3BhcmV6amlvdXJobHZ5YWx3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTA1NjQyOCwiZXhwIjoyMDg0NjMyNDI4fQ.abW5spumitjnN2JC2IKwL4l7TUGW-05sIe4S6QV9-aI';

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

async function checkActiveAppointments() {
    console.log('--- Checking Active Appointments for Provider 1 ---');

    // Get Provider 1 ID
    const { data: p1 } = await supabase.from('profiles').select('id').eq('email', 'provider1@example.com').single();
    if (!p1) { console.error('Provider 1 not found'); return; }

    const { data: active } = await supabase
        .from('appointments')
        .select('*')
        .eq('assigned_profile_id', p1.id)
        .eq('status', 'active');

    console.log(`Provider 1 (${p1.id}) has ${active.length} ACTIVE appointments.`);
    if (active.length > 0) {
        console.log('Use WorkloadBalancer logic hides BUSY providers from the top bar.');
    }
}

checkActiveAppointments();
