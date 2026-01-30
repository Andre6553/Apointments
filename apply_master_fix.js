
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const SUPABASE_URL = 'https://wxwparezjiourhlvyalw.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind4d3BhcmV6amlvdXJobHZ5YWx3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTA1NjQyOCwiZXhwIjoyMDg0NjMyNDI4fQ.abW5spumitjnN2JC2IKwL4l7TUGW-05sIe4S6QV9-aI';

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

async function applyFix() {
    try {
        console.log('--- Fixing Master Admin Permissions ---');
        const sqlPath = path.join(process.cwd(), 'architecture/fix_master_admin_subscription_update.sql');
        const sql = fs.readFileSync(sqlPath, 'utf8');

        // 1. Apply RLS Policy Fix
        const { error: rpcError } = await supabase.rpc('exec_sql', { sql });
        if (rpcError) {
            console.error('❌ Policy update failed:', rpcError);
            // It might fail if exec_sql doesn't exist, will check
        } else {
            console.log('✅ Policy updated successfully.');
        }

        // 2. Fix admin@demo.com manually
        console.log('--- Manually Extending admin@demo.com ---');
        const { data: profile } = await supabase.from('profiles').select('id').eq('email', 'admin@demo.com').single();
        if (profile) {
            const { data: sub } = await supabase.from('subscriptions').select('id').eq('profile_id', profile.id).single();
            if (sub) {
                const newExpiry = new Date();
                newExpiry.setDate(newExpiry.getDate() + 90); // Add 90 days

                const { error: updateError } = await supabase
                    .from('subscriptions')
                    .update({
                        expires_at: newExpiry.toISOString(),
                        status: 'active',
                        tier: 'monthly' // Ensure it's not trial
                    })
                    .eq('id', sub.id);

                if (updateError) console.error('❌ Manual update failed:', updateError);
                else console.log(`✅ Subscription extended to ${newExpiry.toISOString()}`);
            }
        }

    } catch (err) {
        console.error('Script error:', err);
    }
}

applyFix();
