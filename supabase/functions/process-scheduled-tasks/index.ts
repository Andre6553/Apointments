/// <reference no-default-lib="true" />
/// <reference lib="deno.ns" />
/// <reference lib="esnext" />

// @ts-ignore
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
// @ts-ignore
import { format, addDays, startOfDay, endOfDay, isSameDay } from 'https://esm.sh/date-fns@3.3.1'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Reuse logic from frontend (adapted for Deno)
const getNextDayOfWeek = (dayName: string) => {
    if (!dayName) return null;
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const dayIdx = days.indexOf(dayName.toLowerCase());
    if (dayIdx === -1) return null;

    const today = new Date();
    const currentDay = today.getDay();
    let distance = dayIdx - currentDay;

    if (distance < 0) distance += 7;
    return addDays(today, distance);
};

Deno.serve(async (req: Request) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const supabase = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        )

        // 1. Get all businesses with EITHER automation ENABLED
        const { data: businesses, error: fetchError } = await supabase
            .from('business_settings')
            .select('*')
            .or('whatsapp_reminder_enabled.eq.true,whatsapp_reminder_enabled_2.eq.true')

        if (fetchError) throw fetchError

        console.log(`[Scheduler] Checking ${businesses?.length} potential businesses...`)

        const results = []

        // Helper to process a specific schedule
        const processSchedule = async (settings: any, scheduleIdx: number) => {
            const suffix = scheduleIdx === 1 ? '' : '_2'
            const enabled = settings[`whatsapp_reminder_enabled${suffix}`]
            const sendDay = settings[`whatsapp_reminder_send_day${suffix}`]
            const sendTime = settings[`whatsapp_reminder_send_time${suffix}`]
            const lastRan = settings[`whatsapp_reminder_last_ran${suffix}`]
            const startDayKey = scheduleIdx === 1 ? 'whatsapp_reminder_start_day' : 'whatsapp_reminder_start_day_2'
            const endDayKey = scheduleIdx === 1 ? 'whatsapp_reminder_end_day' : 'whatsapp_reminder_end_day_2'

            // Validation
            if (!enabled || !sendDay || !sendTime) return 0

            // 1. Check Day
            const todayName = format(new Date(), 'EEEE')
            if (todayName.toLowerCase() !== sendDay.toLowerCase()) return 0

            // 2. Check Time
            const now = new Date()
            const [targetHour, targetMinute] = sendTime.split(':').map(Number)
            const targetTime = new Date()
            targetTime.setHours(targetHour, targetMinute, 0, 0)

            if (now < targetTime) return 0

            // 3. Check Last Run
            if (lastRan) {
                if (isSameDay(new Date(lastRan), now)) return 0
            }

            console.log(`[Scheduler] Triggering Schedule ${scheduleIdx} for Business: ${settings.business_id}`)

            // 4. Calculate Range
            const startDay = settings[startDayKey] || 'Monday'
            const endDay = settings[endDayKey] || 'Thursday'
            const msgTemplate = settings.whatsapp_reminder_template

            let startDate = startDay === 'Today' ? new Date() : getNextDayOfWeek(startDay)
            let endDate = endDay === 'Today' ? new Date() : getNextDayOfWeek(endDay)

            if (!startDate || !endDate) return 0

            let start = startDate < endDate ? startDate : endDate
            let end = startDate < endDate ? endDate : startDate
            if (endDate < startDate) end = addDays(end, 7)

            const rangeStart = startOfDay(start).toISOString()
            const rangeEnd = endOfDay(end).toISOString()

            // 5. Fetch Appointments
            const { data: appointments } = await supabase
                .from('appointments')
                .select(`
                id, scheduled_start,
                client:clients(first_name, last_name, phone, whatsapp_opt_in),
                provider:profiles!appointments_assigned_profile_id_fkey(full_name)
            `)
                .eq('business_id', settings.business_id)
                .gte('scheduled_start', rangeStart)
                .lte('scheduled_start', rangeEnd)
                .in('status', ['pending', 'confirmed'])

            if (!appointments || appointments.length === 0) {
                console.log(`[Scheduler] No appointments for ${settings.business_id} (Schedule ${scheduleIdx})`)
                return 0
            }

            // 6. Send Batched
            const BATCH_SIZE = 5
            const DELAY_BETWEEN_BATCHES = 1000
            let sentCount = 0

            for (let i = 0; i < appointments.length; i += BATCH_SIZE) {
                const batch = appointments.slice(i, i + BATCH_SIZE)
                await Promise.all(batch.map(async (apt: any) => {
                    if (!apt.client?.phone) return

                    let msg = msgTemplate
                        .replace('[Client Name]', apt.client.first_name || 'Client')
                        .replace('[Date]', format(new Date(apt.scheduled_start), 'yyyy-MM-dd'))
                        .replace('[Time]', format(new Date(apt.scheduled_start), 'HH:mm'))
                        .replace('[Provider]', apt.provider?.full_name || 'Us')

                    await supabase.functions.invoke('send-whatsapp', {
                        body: { to: apt.client.phone, message: msg }
                    })
                    sentCount++
                }))
                if (i + BATCH_SIZE < appointments.length) {
                    await new Promise(r => setTimeout(r, DELAY_BETWEEN_BATCHES))
                }
            }

            // 7. Update Last Ran
            const updatePayload: any = {}
            updatePayload[`whatsapp_reminder_last_ran${suffix}`] = new Date().toISOString()

            await supabase
                .from('business_settings')
                .update(updatePayload)
                .eq('business_id', settings.business_id)

            return sentCount
        }

        for (const settings of businesses || []) {
            try {
                let sent1 = 0
                let sent2 = 0

                // Process Schedule 1
                try {
                    sent1 = await processSchedule(settings, 1)
                } catch (e) {
                    console.error(`Error processing Schedule 1 for ${settings.business_id}`, e)
                }

                // Process Schedule 2
                try {
                    sent2 = await processSchedule(settings, 2)
                } catch (e) {
                    console.error(`Error processing Schedule 2 for ${settings.business_id}`, e)
                }

                if (sent1 > 0 || sent2 > 0) {
                    results.push({ business_id: settings.business_id, s1: sent1, s2: sent2 })
                }

            } catch (err) {
                console.error(`[Scheduler] Error processing business ${settings.business_id}:`, err)
            }
        }

        return new Response(
            JSON.stringify({ success: true, processed: results }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    } catch (error: any) {
        return new Response(
            JSON.stringify({ error: error.message }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        )
    }
})
