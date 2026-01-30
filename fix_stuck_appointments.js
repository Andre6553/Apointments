
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://wxwparezjiourhlvyalw.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind4d3BhcmV6amlvdXJobHZ5YWx3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTA1NjQyOCwiZXhwIjoyMDg0NjMyNDI4fQ.abW5spumitjnN2JC2IKwL4l7TUGW-05sIe4S6QV9-aI';

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

async function cleanupStuckAppointments() {
    console.log('--- Cleaning up Stuck Active Appointments ---');

    // Find active appointments older than 1 HOUR
    const cutOff = new Date();
    cutOff.setHours(cutOff.getHours() - 1);

    const { data: stuck, error } = await supabase
        .from('appointments')
        .select('*')
        .eq('status', 'active')
        .lt('actual_start', cutOff.toISOString());

    if (error) {
        console.error('Error fetching stuck appointments:', error);
        return;
    }

    if (!stuck || stuck.length === 0) {
        console.log('✅ No stuck appointments found.');
        return;
    }

    console.log(`Found ${stuck.length} stuck appointments. Completing them...`);

    const ids = stuck.map(a => a.id);
    const { error: updateError } = await supabase
        .from('appointments')
        .update({ status: 'completed' })
        .in('id', ids);

    if (updateError) {
        console.error('❌ Failed to update appointments:', updateError);
    } else {
        console.log('✅ Successfully marked stuck appointments as completed.');
    }
}

cleanupStuckAppointments();
