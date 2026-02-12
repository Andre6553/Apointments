
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://wxwparezjiourhlvyalw.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind4d3BhcmV6amlvdXJobHZ5YWx3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTA1NjQyOCwiZXhwIjoyMDg0NjMyNDI4fQ.abW5spumitjnN2JC2IKwL4l7TUGW-05sIe4S6QV9-aI'

const supabase = createClient(supabaseUrl, supabaseKey)

async function dumpSubs() {
    const { data: subs, error } = await supabase
        .from('subscriptions')
        .select('id, status, tier, created_at, expires_at')

    if (error) {
        console.error(error)
        return
    }

    console.log(JSON.stringify(subs, null, 2))
}

dumpSubs()
