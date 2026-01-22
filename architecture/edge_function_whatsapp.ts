import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const TWILIO_ACCOUNT_SID = Deno.env.get('TWILIO_ACCOUNT_SID')
const TWILIO_AUTH_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN')
const TWILIO_WHATSAPP_FROM = Deno.env.get('TWILIO_WHATSAPP_FROM')

serve(async (req) => {
    const { to, message } = await req.json()

    const auth = btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`)

    const response = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`,
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': `Basic ${auth}`,
            },
            body: new URLSearchParams({
                To: `whatsapp:${to}`,
                From: TWILIO_WHATSAPP_FROM,
                Body: message,
            }),
        }
    )

    const data = await response.json()

    return new Response(JSON.stringify(data), {
        headers: { 'Content-Type': 'application/json' },
        status: response.ok ? 200 : 400,
    })
})
