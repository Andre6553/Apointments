
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const envFile = fs.readFileSync(path.join(process.cwd(), '.env'), 'utf8');
const env = Object.fromEntries(envFile.split('\n').filter(l => l && !l.startsWith('#')).map(l => l.split('=')));

const supabaseUrl = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
const supabaseServiceKey = env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function verify() {
    console.log('--- Verifying Table Existence ---');
    const { count, error } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true });

    if (error) {
        console.error('❌ Table access error:', error);
    } else {
        console.log('✅ Table exists, count:', count);
    }

    console.log('--- Testing Insertion (System Level) ---');
    const { data: profiles } = await supabase.from('profiles').select('id').limit(1);
    if (!profiles || profiles.length === 0) {
        console.error('No profiles found to test with');
        return;
    }

    const { error: insertError } = await supabase
        .from('notifications')
        .insert({
            user_id: profiles[0].id,
            type: 'test',
            title: 'Test',
            message: 'Test'
        });

    if (insertError) {
        console.error('❌ Insertion failed:', insertError);
    } else {
        console.log('✅ Insertion succeeded at system level');
    }
}
verify();
