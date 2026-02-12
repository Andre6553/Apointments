import { format, addDays, startOfDay, endOfDay, isSameDay } from 'date-fns';

/**
 * Helper to validate/calculate next occurrence of a day
 */
export const getNextDayOfWeek = (dayName) => {
    if (!dayName) return null;
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const dayIdx = days.indexOf(dayName.toLowerCase());
    if (dayIdx === -1) return null;

    const today = new Date();
    const currentDay = today.getDay();
    let distance = dayIdx - currentDay;

    // Logic: If today matches, include it (distance 0). If past, go to next week.
    if (distance < 0) distance += 7;
    return addDays(today, distance);
};

/**
 * Core Logic to Send Reminders
 * @param {Object} supabase - Supabase client
 * @param {string} businessId - Business ID
 * @param {Object} options - Optional overrides { startDay, endDay, message, dryRun }
 * @returns {Object} result { sent: number, failed: number, total: number }
 */
export const sendReminders = async (supabase, businessId, options = {}) => {
    console.log('[WhatsAppAutomation] Starting reminder cycle for:', businessId);

    // 1. Fetch Settings if not provided
    let settings = {};
    if (!options.startDay || !options.endDay || !options.message) {
        const { data, error } = await supabase
            .from('business_settings')
            .select('*')
            .eq('business_id', businessId)
            .single();

        if (error || !data) {
            console.error('[WhatsAppAutomation] Failed to fetch settings', error);
            return { error: 'Settings not found' };
        }
        settings = data;
    }

    const startDay = options.startDay || settings.whatsapp_reminder_start_day;
    const endDay = options.endDay || settings.whatsapp_reminder_end_day;
    const messageTemplate = options.message || settings.whatsapp_reminder_template;

    if (!startDay || !endDay || !messageTemplate) {
        return { error: 'Missing configuration' };
    }

    // 2. Calculate Date Range
    let startDate, endDate;

    if (startDay === 'Today') {
        startDate = new Date();
    } else {
        startDate = getNextDayOfWeek(startDay);
    }

    if (endDay === 'Today') {
        endDate = new Date();
    } else {
        endDate = getNextDayOfWeek(endDay);
    }

    let start = startDate < endDate ? startDate : endDate;
    let end = startDate < endDate ? endDate : startDate;

    // Handle wrap-around or specific logic if needed? 
    // Current logic: strictly next occurrences. 
    // Example: Today is Fri. Start=Mon (Next Mon), End=Thu (Next Thu). Range: Mon->Thu. Correct.
    // Example: Today is Fri. Start=Fri (Today), End=Sun (Next Sun). Range: Fri->Sun. Correct.

    // Safety check for weird wraps?
    if (endDate < startDate) {
        end = addDays(end, 7);
    }

    const rangeStart = startOfDay(start).toISOString();
    const rangeEnd = endOfDay(end).toISOString();

    console.log(`[WhatsAppAutomation] Target Range: ${rangeStart} to ${rangeEnd}`);

    // 3. Fetch Appointments
    const { data: appointments, error: apptError } = await supabase
        .from('appointments')
        .select(`
            id, scheduled_start,
            client:clients(first_name, last_name, phone, whatsapp_opt_in),
            provider:profiles!appointments_assigned_profile_id_fkey(full_name)
        `)
        .eq('business_id', businessId)
        .gte('scheduled_start', rangeStart)
        .lte('scheduled_start', rangeEnd)
        .in('status', ['pending', 'confirmed']);

    if (apptError) {
        console.error('[WhatsAppAutomation] Error fetching appointments', apptError);
        return { error: apptError.message };
    }

    if (!appointments || appointments.length === 0) {
        console.log('[WhatsAppAutomation] No appointments found.');
        return { sent: 0, failed: 0, total: 0 };
    }

    let sentCount = 0;
    let failCount = 0;

    // 4. Send Loop
    // 4. Send Loop (Batched)
    const BATCH_SIZE = 5;
    const DELAY_BETWEEN_BATCHES = 1000; // 1 second

    for (let i = 0; i < appointments.length; i += BATCH_SIZE) {
        const batch = appointments.slice(i, i + BATCH_SIZE);
        console.log(`[WhatsAppAutomation] Processing batch ${Math.ceil((i + 1) / BATCH_SIZE)} of ${Math.ceil(appointments.length / BATCH_SIZE)}`);

        await Promise.all(batch.map(async (apt) => {
            if (!apt.client?.phone) return;

            let msg = messageTemplate
                .replace('[Client Name]', apt.client.first_name || 'Client')
                .replace('[Date]', format(new Date(apt.scheduled_start), 'yyyy-MM-dd'))
                .replace('[Time]', format(new Date(apt.scheduled_start), 'HH:mm'))
                .replace('[Provider]', apt.provider?.full_name || 'Us');

            try {
                if (options.dryRun) {
                    console.log(`[DryRun] Would send to ${apt.client.phone}: ${msg}`);
                    sentCount++;
                    return;
                }

                const { error: sendError } = await supabase.functions.invoke('send-whatsapp', {
                    body: {
                        to: apt.client.phone,
                        message: msg
                    }
                });

                if (sendError) {
                    console.error(`[WhatsAppAutomation] Failed to send to ${apt.client.phone}`, sendError);
                    failCount++;
                } else {
                    sentCount++;
                }
            } catch (err) {
                console.error(`[WhatsAppAutomation] Exception sending to ${apt.client.phone}`, err);
                failCount++;
            }
        }));

        // Delay between batches (unless it's the last batch)
        if (i + BATCH_SIZE < appointments.length) {
            await new Promise(r => setTimeout(r, DELAY_BETWEEN_BATCHES));
        }
    }

    return { sent: sentCount, failed: failCount, total: appointments.length };
};

/**
 * Periodic Check for Automation
 * Called by Dashboard Heartbeat
 */
export const checkAndRunReminders = async (supabase, businessId) => {
    try {
        // 1. Get Settings
        const { data: settings, error } = await supabase
            .from('business_settings')
            .select('*')
            .eq('business_id', businessId)
            .single();

        if (error || !settings) return;

        // Helper to check if a schedule should run
        const shouldRun = (enabled, day, time, lastRan) => {
            if (!enabled || !day || !time) return false;

            // Check Day
            const todayName = format(new Date(), 'EEEE');
            if (todayName.toLowerCase() !== day.toLowerCase()) return false;

            // Check Time
            const now = new Date();
            const [targetHour, targetMinute] = time.split(':').map(Number);
            const targetTime = new Date();
            targetTime.setHours(targetHour, targetMinute, 0, 0);

            if (now < targetTime) return false;

            // Check Last Run
            if (lastRan) {
                if (isSameDay(new Date(lastRan), now)) return false;
            }

            return true;
        };

        // --- Schedule 1 ---
        if (shouldRun(settings.whatsapp_reminder_enabled, settings.whatsapp_reminder_send_day, settings.whatsapp_reminder_send_time, settings.whatsapp_reminder_last_ran)) {
            console.log('[WhatsAppAutomation] Triggering Schedule 1');

            // UPDATE TIMESTAMP FIRST to prevent race conditions (double sends)
            await supabase
                .from('business_settings')
                .update({ whatsapp_reminder_last_ran: new Date().toISOString() })
                .eq('business_id', businessId);

            // Use Global/Default Start/End Days
            await sendReminders(supabase, businessId, {
                startDay: settings.whatsapp_reminder_start_day,
                endDay: settings.whatsapp_reminder_end_day
            });

            console.log('[WhatsAppAutomation] Schedule 1 Execution Complete');
        }

        // --- Schedule 2 ---
        if (shouldRun(settings.whatsapp_reminder_enabled_2, settings.whatsapp_reminder_send_day_2, settings.whatsapp_reminder_send_time_2, settings.whatsapp_reminder_last_ran_2)) {
            console.log('[WhatsAppAutomation] Triggering Schedule 2');

            // UPDATE TIMESTAMP FIRST
            await supabase
                .from('business_settings')
                .update({ whatsapp_reminder_last_ran_2: new Date().toISOString() })
                .eq('business_id', businessId);

            await sendReminders(supabase, businessId, {
                startDay: settings.whatsapp_reminder_start_day_2,
                endDay: settings.whatsapp_reminder_end_day_2
            });

            console.log('[WhatsAppAutomation] Schedule 2 Execution Complete');
        }

    } catch (err) {
        console.error('[WhatsAppAutomation] Auto-cycle check failed:', err);
    }
};
