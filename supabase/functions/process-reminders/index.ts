import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";
import { format, addMinutes } from "https://esm.sh/date-fns@2.29.3";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
    // Handle CORS
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
        const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
        const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
        const fromNumber = Deno.env.get('TWILIO_WHATSAPP_FROM');

        if (!supabaseUrl || !supabaseKey || !accountSid || !authToken || !fromNumber) {
            throw new Error('Missing Env Variables');
        }

        const supabase = createClient(supabaseUrl, supabaseKey);
        const now = new Date();
        const startPath = addMinutes(now, 25).toISOString();
        const endPath = addMinutes(now, 35).toISOString();

        console.log(`[ReminderCron] Checking for appointments between ${startPath} and ${endPath}...`);

        const { data: apts, error } = await supabase
            .from('appointments')
            .select(`
            id, scheduled_start, 
            client:clients(first_name, phone, whatsapp_opt_in),
            provider:profiles!appointments_assigned_profile_id_fkey(full_name),
            notifications_sent
        `)
            .eq('status', 'pending')
            .is('reminder_sent', false)
            .eq('notifications_sent', 0)
            .gte('scheduled_start', startPath)
            .lte('scheduled_start', endPath);

        if (error) throw error;

        let processed = 0;

        if (apts && apts.length > 0) {
            for (const apt of apts) {
                if (!apt.client?.phone || !apt.client?.whatsapp_opt_in) continue;

                const clientName = apt.client.first_name || 'there';
                const providerName = apt.provider?.full_name || 'your doctor';

                // Adjust for +2h offset (User's timezone)
                const scheduledDate = new Date(apt.scheduled_start);
                const localDate = new Date(scheduledDate.getTime() + (2 * 60 * 60 * 1000));

                const dateStr = format(localDate, 'MMM do');
                const timeStr = format(localDate, 'HH:mm');
                const message = `Hi ${clientName}, your appointment with ${providerName} is coming up on ${dateStr} at ${timeStr}`;
                const to = apt.client.phone.startsWith('whatsapp:') ? apt.client.phone : `whatsapp:${apt.client.phone}`;

                const body = new URLSearchParams({
                    'To': to,
                    'From': fromNumber,
                    'Body': message,
                });

                await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
                    method: 'POST',
                    headers: {
                        'Authorization': 'Basic ' + btoa(`${accountSid}:${authToken}`),
                        'Content-Type': 'application/x-www-form-urlencoded',
                    },
                    body: body.toString(),
                });

                await supabase.from('appointments').update({ reminder_sent: true }).eq('id', apt.id);
                processed++;
            }
        }

        return new Response(JSON.stringify({ processed }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        });

    } catch (error: any) {
        console.error('Cron Error:', error);
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 500,
        });
    }
});
