import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

// Manually load env from .env
const env = fs.readFileSync('.env', 'utf8')
    .split('\n')
    .reduce((acc, line) => {
        const [key, value] = line.split('=');
        if (key && value) acc[key.trim()] = value.trim().replace(/"/g, '');
        return acc;
    }, {});

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

async function findJeremiah() {
    console.log('Searching for any appointment related to "Jeremiah"...');

    const { data: clients } = await supabase
        .from('clients')
        .select('id, first_name, last_name')
        .ilike('first_name', '%Jeremiah%');

    if (!clients || clients.length === 0) {
        console.log('No client named Jeremiah found.');
        return;
    }

    console.log(`Found ${clients.length} clients named Jeremiah:`, clients);

    const clientIds = clients.map(c => c.id);
    const { data: apts, error } = await supabase
        .from('appointments')
        .select('*, profiles(full_name)')
        .in('client_id', clientIds)
        .order('scheduled_start', { ascending: false });

    if (error) {
        console.error('Error fetching appointments:', error);
        return;
    }

    console.log(`Found ${apts.length} appointments for Jeremiah:`);
    apts.forEach(a => {
        console.log(`\nID: ${a.id}`);
        console.log(`Status: ${a.status}`);
        console.log(`Provider: ${a.profiles?.full_name}`);
        console.log(`Treatment: ${a.treatment_name}`);
        console.log(`Scheduled: ${a.scheduled_start}`);
        console.log(`Actual Start: ${a.actual_start}`);
        console.log(`Actual End: ${a.actual_end}`);
        console.log(`Additional Services: ${JSON.stringify(a.additional_services)}`);
    });
}

findJeremiah();
