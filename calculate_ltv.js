
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://wxwparezjiourhlvyalw.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind4d3BhcmV6amlvdXJobHZ5YWx3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTA1NjQyOCwiZXhwIjoyMDg0NjMyNDI4fQ.abW5spumitjnN2JC2IKwL4l7TUGW-05sIe4S6QV9-aI'

const supabase = createClient(supabaseUrl, supabaseKey)

async function calculateLTV() {
    console.log('--- Calculating LTV & ARPU ---')

    const { data: subs, error } = await supabase
        .from('subscriptions')
        .select('*')

    if (error) {
        console.error(error)
        return
    }

    const now = new Date()
    const activeSubs = subs.filter(s => s.status === 'active' && new Date(s.expires_at) > now && s.tier !== 'trial')

    // Pricing
    const prices = {
        Admin: 5,
        Provider: 3
    }

    let totalMonthlyRevenue = 0
    activeSubs.forEach(s => {
        const price = prices[s.role] || 3
        totalMonthlyRevenue += price
    })

    const arpu = activeSubs.length > 0 ? totalMonthlyRevenue / activeSubs.length : 0

    // Churn Rate (using the 16.6% we found earlier for paying users)
    const churnRate = 0.166

    const ltv = churnRate > 0 ? arpu / churnRate : arpu * 12 // fallback to 1 year if 0 churn

    console.log(`Active Paying Subscribers: ${activeSubs.length}`)
    console.log(`Total Monthly Revenue: $${totalMonthlyRevenue.toFixed(2)}`)
    console.log(`ARPU (Average Revenue Per User): $${arpu.toFixed(2)}`)
    console.log(`Assumed Monthly Churn: ${(churnRate * 100).toFixed(1)}%`)
    console.log(`Estimated LTV: $${ltv.toFixed(2)}`)
}

calculateLTV()
