
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://wxwparezjiourhlvyalw.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind4d3BhcmV6amlvdXJobHZ5YWx3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTA1NjQyOCwiZXhwIjoyMDg0NjMyNDI4fQ.abW5spumitjnN2JC2IKwL4l7TUGW-05sIe4S6QV9-aI';

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkProviders() {
    console.log('Fetching all profiles...');
    const { data: profiles, error } = await supabase
        .from('profiles')
        .select('*');

    if (error) {
        console.error('Error fetching profiles:', error);
        return;
    }

    console.log(`Found ${profiles.length} profiles.`);
    console.log('--------------------------------------------------');
    console.log('Name | Role | Online | Transfers? | Skills');
    console.log('--------------------------------------------------');

    const targetSkill = 'SURG';
    console.log(`Checking for '${targetSkill}' skill...`);
    console.log('--------------------------------------------------');
    console.log('Name | Role | Online | Transfers? | Skills');
    console.log('--------------------------------------------------');

    const qualified = profiles.filter(p => {
        const skills = (p.skills || []).map(s => typeof s === 'object' ? s.code : s);
        return skills.includes(targetSkill);
    });

    console.log('--- QUALIFIED PROVIDERS (SURG) ---');
    qualified.forEach(p => {
        console.log(`[${p.is_online ? 'ONLINE' : 'OFFLINE'}] ${p.full_name} (${p.role})`);
    });
    console.log('----------------------------------');
    console.log(`Total: ${qualified.length}`);
}

checkProviders();
