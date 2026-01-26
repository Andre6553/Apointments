import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, '../.env');
const envStr = fs.readFileSync(envPath, 'utf8');
const env = envStr.split('\n').reduce((acc, line) => {
    const [key, ...value] = line.split('=');
    if (key && value.length > 0) acc[key.trim()] = value.join('=').trim().replace(/^["']|["']$/g, '');
    return acc;
}, {});

const supabaseUrl = env['VITE_SUPABASE_URL'] || env['SUPABASE_URL'];
const serviceRoleKey = env['SUPABASE_SERVICE_ROLE_KEY'];
const supabase = createClient(supabaseUrl, serviceRoleKey);

async function testRegistration() {
    const testEmail = `test_admin_${Date.now()}@example.com`;
    console.log(`Testing registration for: ${testEmail}`);

    try {
        const { data: user, error: authError } = await supabase.auth.admin.createUser({
            email: testEmail,
            password: 'Password123!',
            email_confirm: true,
            user_metadata: {
                full_name: 'Test Automatic Admin',
                role: 'Admin',
                whatsapp: '+27000000000'
            }
        });

        if (authError) {
            console.error('❌ Registration Failed (Auth):', JSON.stringify(authError, null, 2));
            return;
        }

        console.log('✅ Auth User Created. Waiting for triggers...');
        await new Promise(r => setTimeout(r, 2000));

        const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('*, business:businesses!profiles_business_id_fkey(name)')
            .eq('id', user.user.id)
            .single();

        if (profileError) {
            console.error('❌ Profile Error:', profileError);
        } else {
            console.log('✅ Profile Found:', JSON.stringify(profile, null, 2));
            if (profile.business_id) {
                console.log('✨ Success! Business was automatically created and linked.');
            } else {
                console.warn('⚠️ Profile created, but business_id is NULL.');
            }
        }

        // Cleanup
        await supabase.auth.admin.deleteUser(user.user.id);
        if (profile?.business_id) {
            await supabase.from('businesses').delete().eq('id', profile.business_id);
        }

    } catch (err) {
        console.error('💥 Execution Error:', err);
    }
}

testRegistration();
