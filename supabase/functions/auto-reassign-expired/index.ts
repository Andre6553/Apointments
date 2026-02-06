import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const supabase = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        )

        console.log('--- STARTING AUTO-REASSIGNMENT CYCLE ---')

        // 1. Find subscriptions that expired > 24 hours ago and are still 'active'
        // We use 24h as the amnesty window
        const amnestyThreshold = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

        const { data: expiredSubs, error: subError } = await supabase
            .from('subscriptions')
            .select('profile_id, business_id')
            .eq('status', 'active')
            .lt('expires_at', amnestyThreshold)
            .neq('tier', 'trial') // Only paid tiers get this transition logic

        if (subError) throw subError

        console.log(`Found ${expiredSubs?.length || 0} expired subscriptions past amnesty.`)

        let totalReassigned = 0

        if (expiredSubs && expiredSubs.length > 0) {
            for (const sub of expiredSubs) {
                // 2. Find the Admin for this business
                const { data: admin, error: adminError } = await supabase
                    .from('profiles')
                    .select('id')
                    .eq('business_id', sub.business_id)
                    .eq('role', 'Admin')
                    .single()

                if (adminError || !admin) {
                    console.error(`Could not find admin for business ${sub.business_id}. Skipping provider ${sub.profile_id}.`)
                    continue
                }

                // 3. Find pending appointments for this provider
                const { data: apts, error: aptError } = await supabase
                    .from('appointments')
                    .select('id, scheduled_start')
                    .eq('assigned_profile_id', sub.profile_id)
                    .eq('status', 'pending')

                if (aptError) {
                    console.error(`Error fetching appointments for provider ${sub.profile_id}:`, aptError)
                    continue
                }

                if (apts && apts.length > 0) {
                    console.log(`Reassigning ${apts.length} appointments for provider ${sub.profile_id} to admin ${admin.id}.`)

                    for (const apt of apts) {
                        // Use existing RPC or direct update
                        // We'll do direct update here to bypass auth.uid() checks in RPC
                        const { error: updateError } = await supabase
                            .from('appointments')
                            .update({
                                assigned_profile_id: admin.id,
                                shifted_from_id: sub.profile_id,
                                requires_attention: true,
                                notes: `AUTO-REASSIGN: Subscription expired for original provider.`
                            })
                            .eq('id', apt.id)

                        if (!updateError) totalReassigned++
                    }
                }

                // 4. Mark subscription as 'suspended' so we don't process it again
                await supabase
                    .from('subscriptions')
                    .update({ status: 'suspended', updated_at: new Date().toISOString() })
                    .eq('profile_id', sub.profile_id)
                    .eq('business_id', sub.business_id)

                // 5. Audit Log Entry
                await supabase.from('audit_logs').insert({
                    business_id: sub.business_id,
                    actor_id: '00000000-0000-0000-0000-000000000000', // SYSTEM
                    event: 'SUBSCRIPTION_HARD_EXPIRED',
                    description: `Provider ${sub.profile_id} subscription expired past amnesty. ${apts?.length || 0} appointments reassigned to admin.`,
                    payload: { provider_id: sub.profile_id, admin_id: admin.id, count: apts?.length || 0 }
                })
            }
        }

        return new Response(JSON.stringify({
            success: true,
            providers_processed: expiredSubs?.length || 0,
            appointments_reassigned: totalReassigned
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        })

    } catch (error: any) {
        console.error('Auto-Reassignment Error:', error)
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 500,
        })
    }
})
