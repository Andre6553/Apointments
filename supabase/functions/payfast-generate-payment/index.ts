import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createHash } from "https://deno.land/std@0.168.0/crypto/mod.ts"

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const body = await req.json()
        const {
            amount,
            item_name,
            email_address,
            name_first,
            m_payment_id,
            custom_str1, // business_id
            custom_str2, // user_id
            return_url,
            cancel_url,
            notify_url
        } = body

        // PayFast Live Credentials
        const merchantId = '11945617'
        const merchantKey = '9anvup217hdck'
        const passphrase = Deno.env.get('PAYFAST_PASSPHRASE') || 'OmniBibleApp1'

        // Construct payment data
        const paymentData: Record<string, string> = {
            merchant_id: merchantId,
            merchant_key: merchantKey,
            return_url: return_url,
            cancel_url: cancel_url,
            notify_url: notify_url,
            name_first: name_first || 'User',
            email_address: email_address,
            m_payment_id: m_payment_id,
            amount: amount,
            item_name: item_name,
        }

        // Add optional fields if present
        if (custom_str1) paymentData.custom_str1 = custom_str1
        if (custom_str2) paymentData.custom_str2 = custom_str2

        // Generate signature
        const sortedKeys = Object.keys(paymentData).sort()
        let signatureString = ''

        for (const key of sortedKeys) {
            const value = paymentData[key]
            if (value !== undefined && value !== null && value !== '') {
                const encodedVal = encodeURIComponent(String(value).trim()).replace(/%20/g, '+')
                if (signatureString.length > 0) signatureString += '&'
                signatureString += `${key}=${encodedVal}`
            }
        }

        // Append passphrase
        signatureString += `&passphrase=${encodeURIComponent(passphrase.trim()).replace(/%20/g, '+')}`

        // Calculate MD5 hash
        const encoder = new TextEncoder()
        const data = encoder.encode(signatureString)
        const hashBuffer = await crypto.subtle.digest('MD5', data)
        const hashArray = Array.from(new Uint8Array(hashBuffer))
        const signature = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')

        // Add signature to payment data
        paymentData.signature = signature

        console.log('[payfast-generate-payment] Sending to PayFast:', { merchantId, item_name, amount })

        // POST to PayFast OnSite endpoint
        const formBody = Object.entries(paymentData)
            .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
            .join('&')

        const response = await fetch('https://www.payfast.co.za/onsite/process', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: formBody,
        })

        const responseText = await response.text()
        console.log('[payfast-generate-payment] PayFast response:', response.status, responseText)

        if (!response.ok) {
            return new Response(JSON.stringify({
                error: 'PayFast request failed',
                status: response.status,
                details: responseText
            }), {
                status: response.status,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            })
        }

        // Parse the JSON response from PayFast
        let paymentResponse
        try {
            paymentResponse = JSON.parse(responseText)
        } catch {
            return new Response(JSON.stringify({
                error: 'Invalid response from PayFast',
                details: responseText
            }), {
                status: 500,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            })
        }

        // Return the UUID
        return new Response(JSON.stringify({
            uuid: paymentResponse.uuid,
            success: true
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })

    } catch (error) {
        console.error('[payfast-generate-payment] Error:', error)
        return new Response(JSON.stringify({
            error: 'Internal server error',
            message: error.message
        }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
    }
})
