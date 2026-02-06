
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'

const envContent = fs.readFileSync('.env', 'utf8')
const env = {}
envContent.split('\n').forEach(line => {
    const [key, ...value] = line.split('=')
    if (key && value) {
        env[key.trim()] = value.join('=').trim().replace(/^"(.*)"$/, '$1')
    }
})

const supabaseUrl = env.VITE_SUPABASE_URL
const supabaseServiceKey = env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing Supabase credentials in .env')
    process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function checkDrHouse() {
    const { data: allProfiles, error: fetchError } = await supabase
        .from('profiles')
        .select('*')
        .limit(10)

    if (fetchError) {
        console.error('Error fetching profiles:', fetchError)
        return
    }

    console.log('Sample profiles:', allProfiles.map(p => `${p.email} (${p.full_name})`).join(', '))

    // Use ilike to find Dr House regardless of exact name string
    const { data: houseProfiles, error: houseError } = await supabase
        .from('profiles')
        .select('*')
        .ilike('full_name', '%House%')

    if (houseError) {
        console.error('Error searching for House:', houseError)
    } else {
        console.log(`\nHouse Profiles found: ${houseProfiles.length}`)
        for (const p of houseProfiles) {
            console.log(`- ${p.full_name}: ID=${p.id}, BusinessID=${p.business_id}, Role=${p.role}, Email=${p.email}, AcceptsTransfers=${p.accepts_transfers}`)

            // Check for working hours
            const { data: hours } = await supabase
                .from('working_hours')
                .select('*')
                .eq('profile_id', p.id)

            console.log(`  Working Hours: ${hours?.length || 0} entries`)
            if (hours && hours.length > 0) {
                console.log(`  Sample (Mon): ${JSON.stringify(hours.find(h => h.day_of_week === 1) || 'None')}`)
            }
        }
    }
}

checkDrHouse()
