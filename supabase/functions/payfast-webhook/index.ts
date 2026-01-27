// @ts-nocheck
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { crypto } from "https://deno.land/std@0.177.0/crypto/mod.ts";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req: Request) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const formData = await req.formData()
        const payload: Record<string, string> = {}
        formData.forEach((value, key) => {
            payload[key] = value.toString()
        })

        console.log('PayFast Webhook received:', payload)

        const supabase = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        )

        // 1. Verify Signature
        const passphrase = Deno.env.get('PAYFAST_PASSPHRASE')
        let signatureString = ''

        // PayFast signature requires specific encoding: 
        // 1. Sort fields alphabetical
        // 2. Exclude 'signature'
        // 3. Exclude empty fields
        // 4. Use + for spaces (not %20)
        const keys = Object.keys(payload).filter(k => k !== 'signature').sort()

        const params: string[] = []
        keys.forEach(key => {
            const val = payload[key].trim()
            if (val !== '') {
                params.push(`${key}=${encodeURIComponent(val).replace(/%20/g, '+')}`)
            }
        })

        signatureString = params.join('&')

        if (passphrase) {
            signatureString += `&passphrase=${encodeURIComponent(passphrase.trim()).replace(/%20/g, '+')}`
        }

        console.log('Generated Signature String:', signatureString)

        const encoder = new TextEncoder();
        const data = encoder.encode(signatureString);
        const hashBuffer = await crypto.subtle.digest("MD5", data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const generatedSignature = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

        if (generatedSignature !== payload.signature) {
            console.error('SIGNATURE MISMATCH!', {
                generated: generatedSignature,
                received: payload.signature,
                string: signatureString
            })
            // return new Response('Invalid Signature', { status: 400 })
        } else {
            console.log('Signature verified successfully.')
        }

        // 2. Process Payment
        console.log('Payment Status:', payload.payment_status)
        if (payload.payment_status === 'COMPLETE') {
            const custom_str1 = payload.custom_str1 // business_id
            const custom_str2 = payload.custom_str2 // profile_id / user_id
            const item_name = payload.item_name // Admin Monthly, Provider Yearly etc.

            const isYearly = item_name.toLowerCase().includes('yearly')
            const daysToAdd = isYearly ? 365 : 30
            const tier = isYearly ? 'yearly' : 'monthly'

            // Update Subscriptions
            const { data: sub, error: subError } = await supabase
                .from('subscriptions')
                .upsert({
                    profile_id: custom_str2,
                    business_id: custom_str1,
                    tier: tier,
                    status: 'active',
                    expires_at: new Date(Date.now() + daysToAdd * 24 * 60 * 60 * 1000).toISOString(),
                    updated_at: new Date().toISOString()
                }, { onConflict: 'profile_id, business_id' })

            if (subError) throw subError

            // Log Payment
            const { error: historyError } = await supabase
                .from('payment_history')
                .insert({
                    profile_id: custom_str2,
                    business_id: custom_str1,
                    amount: parseFloat(payload.amount_gross),
                    currency: 'ZAR', // PayFast is always ZAR
                    payment_status: payload.payment_status,
                    payfast_payment_id: payload.pf_payment_id
                })

            if (historyError) throw historyError

            console.log(`Subscription updated for user ${custom_str2} in business ${custom_str1}`)
        }

        return new Response('OK', { headers: corsHeaders })
    } catch (error: any) {
        console.error('Webhook Error:', error)
        return new Response(JSON.stringify({ error: error.message || 'Unknown error' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400
        })
    }
})
