
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://wxwparezjiourhlvyalw.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind4d3BhcmV6amlvdXJobHZ5YWx3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTA1NjQyOCwiZXhwIjoyMDg0NjMyNDI4fQ.abW5spumitjnN2JC2IKwL4l7TUGW-05sIe4S6QV9-aI'

const supabase = createClient(supabaseUrl, supabaseKey)

async function calculateChurn() {
    console.log('--- Analyzing Churn Rate (Timeline View) ---')

    const { data: subs, error } = await supabase
        .from('subscriptions')
        .select('*')

    if (error) {
        console.error('Error:', error)
        return
    }

    if (!subs || subs.length === 0) {
        console.log('No subscription data found.')
        return
    }

    const now = new Date()

    // Check months
    for (let i = 0; i < 5; i++) {
        const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1)
        const nextMonthStart = new Date(now.getFullYear(), now.getMonth() - i + 1, 1)

        const activeAtStart = subs.filter(s => {
            const created = new Date(s.created_at)
            return created < monthStart && (s.status === 'active' || new Date(s.expires_at) >= monthStart)
        }).length

        const newSignups = subs.filter(s => {
            const created = new Date(s.created_at)
            return created >= monthStart && created < nextMonthStart
        }).length

        const lostInMonth = subs.filter(s => {
            const expiry = new Date(s.expires_at)
            return (s.status === 'expired' || s.status === 'cancelled') &&
                expiry >= monthStart &&
                expiry < nextMonthStart
        }).length

        const churnRate = activeAtStart > 0
            ? ((lostInMonth / activeAtStart) * 100).toFixed(2)
            : '0.00'

        console.log(`\nMonth: ${monthStart.toLocaleString('default', { month: 'long', year: 'numeric' })}`)
        console.log(` - Active at start: ${activeAtStart}`)
        console.log(` - New signups: ${newSignups}`)
        console.log(` - Lost (Churned): ${lostInMonth}`)
        console.log(` - Churn Rate: ${churnRate}%`)
    }

    // Overall stats
    const totalActive = subs.filter(s => s.status === 'active' && new Date(s.expires_at) > now).length
    const totalLost = subs.filter(s => s.status === 'expired' || s.status === 'cancelled').length

    console.log('\n--- Overall stats ---')
    console.log(`Current Active Users: ${totalActive}`)
    console.log(`Historical Lost Users: ${totalLost}`)
    console.log(`Lifetime Retention Rate: ${((totalActive / (totalActive + totalLost)) * 100).toFixed(2)}%`)
}

calculateChurn()
