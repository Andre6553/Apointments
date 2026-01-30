
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://wxwparezjiourhlvyalw.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind4d3BhcmV6amlvdXJobHZ5YWx3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTA1NjQyOCwiZXhwIjoyMDg0NjMyNDI4fQ.abW5spumitjnN2JC2IKwL4l7TUGW-05sIe4S6QV9-aI';

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

async function inspectAppointment() {
    console.log('--- Inspecting Appointment 9f79d2e6-2913-4b32-876e-b6b4ed475e7e ---');

    const { data: apt, error } = await supabase
        .from('appointments')
        .select('*')
        .eq('id', '9f79d2e6-2913-4b32-876e-b6b4ed475e7e')
        .single();

    if (error) {
        console.error('Error fetching appointment:', error);
        return;
    }

    if (!apt) {
        console.error('Appointment not found.');
        return;
    }

    console.log('ID:', apt.id);
    console.log('Status:', apt.status);
    console.log('Scheduled Start:', apt.scheduled_start);
    console.log('Actual Start:', apt.actual_start);
    console.log('Duration:', apt.duration_minutes);
    console.log('Notifications Sent:', apt.notifications_sent);
    console.log('Delay Minutes:', apt.delay_minutes);
}

inspectAppointment();
