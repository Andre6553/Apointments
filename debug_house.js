
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'

const env = fs.readFileSync('.env', 'utf8')
const lines = env.split(/\r?\n/)
const getEnv = (key) => lines.find(l => l.startsWith(key))?.split('=')[1]?.trim()

const supabaseUrl = getEnv('VITE_SUPABASE_URL')
const supabaseKey = getEnv('SUPABASE_SERVICE_ROLE_KEY')

if (!supabaseUrl || !supabaseKey) {
    console.error('Failed to load Supabase credentials from .env')
    process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function debugMissingProvider() {
    console.log('--- DEBUGGING MISSING PROVIDER (V3) ---')

    // 1. Get all businesses
    const { data: businesses } = await supabase.from('businesses').select('*')
    console.log('\nBusinesses:', businesses?.map(b => `${b.name} (${b.id})`))

    // 2. Search for Dr. House everywhere
    const { data: houseProfiles, error: houseError } = await supabase
        .from('profiles')
        .select('*, business:businesses(name)')
        .ilike('full_name', '%House%')

    if (houseError) console.error('House Search Error:', houseError)

    console.log('\nHouse Profiles Found:', houseProfiles?.map(p => ({
        id: p.id,
        name: p.full_name,
        email: p.email,
        role: p.role,
        business: p.business?.name,
        business_id: p.business_id,
        skills: p.skills,
        accepts_transfers: p.accepts_transfers
    })))

    // 3. Search for the user 'admin@demo.com' to see their business
    const { data: adminProfiles, error: adminError } = await supabase
        .from('profiles')
        .select('*, business:businesses(name)')
        .eq('email', 'admin@demo.com')

    if (adminError) console.error('Admin Search Error:', adminError)

    console.log('\nAdmin Profiles Found:', adminProfiles?.map(p => ({
        id: p.id,
        name: p.full_name,
        email: p.email,
        role: p.role,
        business: p.business?.name,
        business_id: p.business_id
    })))

    if (houseProfiles?.length && adminProfiles?.length) {
        const houseBiz = houseProfiles[0].business_id
        const adminBiz = adminProfiles[0].business_id
        console.log(`\nComparison: House Biz ID (${houseBiz}) vs Admin Biz ID (${adminBiz})`)
        if (houseBiz === adminBiz) {
            console.log('SUCCESS: They are in the SAME business.')
        } else {
            console.log('FAILURE: They are in DIFFERENT businesses.')
        }
    } else {
        console.log('\nCould not find both profiles for comparison.')
        // Log all profiles in the first business found to see who is there
        if (businesses?.length > 0) {
            const firstBizId = businesses[0].id
            const { data: allInBiz } = await supabase.from('profiles').select('full_name, role, email').eq('business_id', firstBizId)
            console.log(`\nAll Profiles in ${businesses[0].name}:`, allInBiz)
        }
    }
}

debugMissingProvider()
