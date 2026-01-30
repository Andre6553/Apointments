
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://wxwparezjiourhlvyalw.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind4d3BhcmV6amlvdXJobHZ5YWx3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTA1NjQyOCwiZXhwIjoyMDg0NjMyNDI4fQ.abW5spumitjnN2JC2IKwL4l7TUGW-05sIe4S6QV9-aI'

const supabase = createClient(supabaseUrl, supabaseKey)

async function debugSubscription() {
    console.log('--- Debugging Subscription for admin@demo.com ---')

    // 1. Get Profile ID
    const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('id, email, full_name, role')
        .eq('email', 'admin@demo.com')
        .single()

    if (profileError) {
        console.error('Error fetching profile:', profileError)
        return
    }

    if (!profileData) {
        console.error('Profile admin@demo.com not found')
        return
    }

    console.log('Profile Found:', profileData)

    // 2. Scan ALL subscriptions for this profile
    const { data: subs, error: subError } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('profile_id', profileData.id)

    if (subError) {
        console.error('Error fetching subscriptions:', subError)
        return
    }

    console.log(`Found ${subs.length} subscription records:`)
    subs.forEach((sub, i) => {
        console.log(`\n[${i + 1}] ID: ${sub.id}`)
        console.log(`    Status: ${sub.status}`)
        console.log(`    Tier: ${sub.tier}`)
        console.log(`    Expires At: ${sub.expires_at}`)
        console.log(`    Created At: ${sub.created_at}`)

        // Check if valid
        const daysLeft = sub.expires_at ? Math.ceil((new Date(sub.expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : 0
        console.log(`    Days Left: ${daysLeft}`)
    })
}

debugSubscription()
