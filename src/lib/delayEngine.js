import { supabase } from './supabase'
import { sendWhatsApp } from './notifications'

/**
 * Calculates and applies delays to subsequent appointments.
 * Handles both session START and session END triggers.
 * @param {string} appointmentId - The ID of the appointment that just started/ended.
 * @param {string} actualTime - ISO string of the actual start/end time.
 * @param {string} type - 'start' or 'end'
 */
export const calculateAndApplyDelay = async (appointmentId, actualTime, type = 'start') => {
    // 1. Get the current appointment details
    const { data: currentApt, error: fetchError } = await supabase
        .from('appointments')
        .select('*')
        .eq('id', appointmentId)
        .single()

    if (fetchError || !currentApt) return

    const scheduledStart = new Date(currentApt.scheduled_start)
    const scheduledEnd = new Date(new Date(currentApt.scheduled_start).getTime() + (currentApt.duration_minutes * 60000))
    const actual = new Date(actualTime)

    let delayMinutes = 0;

    if (type === 'start') {
        // Delay based on start time lateness
        delayMinutes = Math.max(0, Math.floor((actual - scheduledStart) / 60000))
    } else {
        // Delay based on end time overrunning the scheduled end
        delayMinutes = Math.max(0, Math.floor((actual - scheduledEnd) / 60000))
    }

    // SAFE Percentage-based threshold: 25% of the session duration, with a 10-MINUTE MINIMUM floor
    const threshold = Math.max(10, Math.floor(currentApt.duration_minutes * 0.25))

    if (delayMinutes <= threshold) {
        console.log(`[DelayEngine] Delay of ${delayMinutes}m is within ${threshold}m threshold (25% of ${currentApt.duration_minutes}m). Skipping update.`);
        return
    }

    console.log(`[DelayEngine] Threshold breached (${delayMinutes}m > ${threshold}m). Propagating delay...`);

    // 2. Find all subsequent PENDING appointments for this provider today
    const { data: subsequentApts, error: subError } = await supabase
        .from('appointments')
        .select('*, client:clients(first_name, last_name, phone, whatsapp_opt_in), provider:profiles!appointments_assigned_profile_id_fkey(whatsapp)')
        .eq('assigned_profile_id', currentApt.assigned_profile_id)
        .eq('status', 'pending')
        .gt('scheduled_start', currentApt.scheduled_start)
        .order('scheduled_start', { ascending: true })

    if (subError || !subsequentApts.length) return

    // 3. Update delays in Database
    console.log(`[DelayEngine] Propagating ${delayMinutes}m delay to ${subsequentApts.length} appointments...`);

    for (const apt of subsequentApts) {
        const { error: updateError } = await supabase
            .from('appointments')
            .update({ delay_minutes: delayMinutes })
            .eq('id', apt.id);

        if (updateError) {
            console.error(`[DelayEngine] Failed to update delay for apt ${apt.id}:`, updateError);
            // If it's a 403, we still want to know if the others succeed
        }
    }

    // 4. Notify Clients or Fallback to Provider
    for (const apt of subsequentApts) {
        const sentCount = apt.notifications_sent || 0;
        const wantsMsg = apt.client?.whatsapp_opt_in === true;
        const bizName = "[Your Business Name]";

        if (!wantsMsg) {
            console.log(`[DelayEngine] Client ${apt.client?.first_name} opted out. FALLBACK to Provider.`);

            // Only send fallback if we haven't already bothered the provider for this apt
            if (sentCount === 0 && apt.provider?.whatsapp) {
                const fallbackMsg = `⚠️ FALLBACK: ${apt.client?.first_name} ${apt.client?.last_name} is NOT opted into WhatsApp. Their appointment is running ${delayMinutes} mins late. Please call them at ${apt.client?.phone} to inform them manually. - ${bizName}`;

                const { success } = await sendWhatsApp(apt.provider.whatsapp, fallbackMsg);
                if (success) {
                    await supabase.from('appointments').update({ notifications_sent: 1 }).eq('id', apt.id);
                }
            }
            continue;
        }

        // Standard Client Notification (Max 2)
        let shouldSend = false;
        if (sentCount === 0) {
            shouldSend = true;
        } else if (sentCount === 1 && delayMinutes > 30) {
            shouldSend = true;
        }

        if (shouldSend) {
            const success = await sendDelayNotification(apt.client, delayMinutes, apt.scheduled_start, sentCount + 1);
            if (success) {
                await supabase
                    .from('appointments')
                    .update({ notifications_sent: sentCount + 1 })
                    .eq('id', apt.id);
            }
        }
    }
}

/**
 * Proactive detection: Check for currently ACTIVE sessions that are overrunning.
 */
export const checkActiveOverruns = async () => {
    const { data: activeApts, error } = await supabase
        .from('appointments')
        .select('*, client:clients(first_name, last_name, phone, whatsapp_opt_in)')
        .eq('status', 'active');

    if (error || !activeApts) return;

    for (const apt of activeApts) {
        const scheduledDuration = apt.duration_minutes * 60000;
        const scheduledEnd = new Date(new Date(apt.actual_start).getTime() + scheduledDuration);
        const now = new Date();

        if (now > scheduledEnd) {
            const overrunMinutes = Math.floor((now - scheduledEnd) / 60000);
            const threshold = Math.max(10, Math.floor(apt.duration_minutes * 0.25));

            if (overrunMinutes > threshold) {
                console.log(`[Proactive] Active session ${apt.id} is overrunning by ${overrunMinutes}m (Threshold: ${threshold}m). Predicting delays...`);
                await calculateAndApplyDelay(apt.id, now.toISOString(), 'end');
            }
        }
    }
}

const sendDelayNotification = async (client, delayMinutes, scheduledStart, attempt = 1) => {
    const originalTime = new Date(scheduledStart).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    const newTime = new Date(new Date(scheduledStart).getTime() + delayMinutes * 60000)
        .toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

    const bizName = "[Your Business Name]";

    let message = `Hi ${client.first_name} ${client.last_name || ''}, friendly reminder from ${bizName}! We are running about ${delayMinutes} mins late today. Your ${originalTime} appointment is now scheduled for ${newTime}. Sorry for the wait!`;

    if (attempt === 2) {
        message = `Hi ${client.first_name}, this is an URGENT update from ${bizName}. We are now running ${delayMinutes} mins late. Your appointment is rescheduled for ${newTime}. Please call reception for clarity if needed. Sorry for the inconvenience!`;
    }

    const { success } = await sendWhatsApp(client?.phone, message);
    return success;
}
