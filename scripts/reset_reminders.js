import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url';

// Load .env from root manually
const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Go up one level to root
const envPath = path.join(__dirname, '../.env');
let envContent = '';

try {
    envContent = fs.readFileSync(envPath, 'utf8');
} catch (e) {
    console.error('Could not read .env file', e);
    process.exit(1);
}

const env = {};
envContent.split('\n').forEach(line => {
    const [key, value] = line.split('=');
    if (key && value) {
        env[key.trim()] = value.trim();
    }
});

const supabaseUrl = env.VITE_SUPABASE_URL;
const supabaseServiceKey = env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing Supabase credentials in .env');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function resetReminders() {
    console.log('🔄 Resetting Reminder Status for admin@demo.com...');

    try {
        // 1. Get Business ID for admin@demo.com
        const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('business_id')
            .eq('email', 'admin@demo.com')
            .single();

        if (profileError || !profile) {
            console.error('❌ Could not find admin@demo.com profile:', profileError);
            return;
        }

        const businessId = profile.business_id;
        console.log(`Found Business ID: ${businessId}`);

        // Reset Schedule 1
        const { error: err1 } = await supabase
            .from('business_settings')
            .update({ whatsapp_reminder_last_ran: null })
            .eq('business_id', businessId) // RESTRICT TO THIS BUSINESS
            .not('whatsapp_reminder_last_ran', 'is', null);

        if (err1) console.error('Error resetting Schedule 1:', err1);
        else console.log('✅ Schedule 1 last_ran cleared.');

        // Reset Schedule 2
        const { error: err2 } = await supabase
            .from('business_settings')
            .update({ whatsapp_reminder_last_ran_2: null })
            .eq('business_id', businessId) // RESTRICT TO THIS BUSINESS
            .not('whatsapp_reminder_last_ran_2', 'is', null);

        if (err2) console.error('Error resetting Schedule 2:', err2);
        else console.log('✅ Schedule 2 last_ran cleared.');

        console.log('✨ Reminder status reset for Admin only.');

    } catch (err) {
        console.error('Script error:', err);
        process.exit(1);
    }
}

resetReminders();
