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

const BUSINESS_ID = 'fe0e2e7d-6f25-428f-87ee-75b62553a67d';
const PROFILE_ID = 'eae11712-0d3d-4c60-af4a-8de43a591851';

async function cleanup() {
    console.log(`--- CLEANING UP TEST BUSINESS: ${BUSINESS_ID} ---`);

    // 1. Delete Payment History
    const { error: payError } = await supabase
        .from('payment_history')
        .delete()
        .eq('business_id', BUSINESS_ID);
    console.log(payError ? `Error payments: ${payError.message}` : '✅ Payments deleted.');

    // 2. Delete Subscriptions
    const { error: subError } = await supabase
        .from('subscriptions')
        .delete()
        .eq('business_id', BUSINESS_ID);
    console.log(subError ? `Error subscriptions: ${subError.message}` : '✅ Subscriptions deleted.');

    // 3. Delete Appointments
    const { error: appError } = await supabase
        .from('appointments')
        .delete()
        .eq('business_id', BUSINESS_ID);
    console.log(appError ? `Error appointments: ${appError.message}` : '✅ Appointments deleted.');

    // 4. Delete Clients
    const { error: clientError } = await supabase
        .from('clients')
        .delete()
        .eq('business_id', BUSINESS_ID);
    console.log(clientError ? `Error clients: ${clientError.message}` : '✅ Clients deleted.');

    // 5. Break Circular Reference (owner_id in businesses)
    const { error: nullError } = await supabase
        .from('businesses')
        .update({ owner_id: null })
        .eq('id', BUSINESS_ID);
    console.log(nullError ? `Error nulling owner: ${nullError.message}` : '✅ Owner reference nulled.');

    // 6. Delete Profiles
    const { error: profError } = await supabase
        .from('profiles')
        .delete()
        .eq('business_id', BUSINESS_ID);
    console.log(profError ? `Error profiles: ${profError.message}` : '✅ Profiles deleted.');

    // 7. Delete Business
    const { error: busError } = await supabase
        .from('businesses')
        .delete()
        .eq('id', BUSINESS_ID);
    console.log(busError ? `Error business: ${busError.message}` : '✅ Business deleted.');

    // 8. Delete Auth User
    const { error: authError } = await supabase.auth.admin.deleteUser(PROFILE_ID);
    console.log(authError ? `Error auth user: ${authError.message}` : '✅ Auth user deleted.');

    console.log('--- CLEANUP COMPLETE ---');
}

cleanup();
