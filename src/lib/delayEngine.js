import { supabase } from './supabase'
import { sendWhatsApp } from './notifications'
import { logEvent } from './logger'

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

    if (fetchError || !currentApt) {
        console.warn(`[DelayEngine] Triggering appointment ${appointmentId} not found. Rip-current aborted.`);
        return;
    }

    // AVOID FEEDBACK LOOPS: If this appointment already has a set delay close to what we're calculating, skip.
    const currentRecordedDelay = currentApt.delay_minutes || 0;

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

    // AVOID REDUNDANT PROPAGATION: 
    // If the change is tiny (< 2 mins), skip to save DB writes.
    // If catching up (delay decreasing), we ALWAYS propagate if change >= 2 mins to help the Assistant.
    const delayChange = Math.abs(delayMinutes - currentRecordedDelay);
    const isCatchingUp = delayMinutes < currentRecordedDelay;

    if (delayChange < 2) {
        console.log(`[DelayEngine] Delay change (${delayChange}m) is negligible. Skipping.`);
        return;
    }

    // THRESHOLD: Only apply NEW delays to clients if they breach the 25%/10m floor.
    // BUT: If catching up, we bypass the threshold to clear the board for the Assistant.
    if (!isCatchingUp && delayMinutes <= threshold) {
        console.log(`[DelayEngine] New delay of ${delayMinutes}m is within ${threshold}m threshold. Skipping.`);
        return
    }

    console.log(`[DelayEngine] ${isCatchingUp ? 'Catch-up detected' : 'Threshold breached'} (${delayMinutes}m). Propagating ripple...`);

    // 2. Find all subsequent PENDING appointments for this provider TODAY ONLY
    const startOfDay = new Date(currentApt.scheduled_start);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(startOfDay);
    endOfDay.setHours(23, 59, 59, 999);

    const { data: subsequentApts, error: subError } = await supabase
        .from('appointments')
        .select('*, client:clients(first_name, last_name, phone, whatsapp_opt_in), provider:profiles!appointments_assigned_profile_id_fkey(whatsapp)')
        .eq('assigned_profile_id', currentApt.assigned_profile_id)
        .eq('status', 'pending')
        .gt('scheduled_start', currentApt.scheduled_start)
        .lte('scheduled_start', endOfDay.toISOString()) // LIMIT TO SAME DAY
        .order('scheduled_start', { ascending: true })

    if (subError) {
        console.error('[DelayEngine] Failed to fetch subsequent appointments:', subError);
        return;
    }

    // 3. RIPPLE CALCULATION: Project the timeline forward
    // If starting: the provider is free after this session ends (actual + duration)
    // If ending: the provider is free NOW (actual)
    let projectedFreeTime = type === 'start'
        ? new Date(actual.getTime() + currentApt.duration_minutes * 60000)
        : actual;

    console.log(`[DelayEngine] Propagating ripple from ${type.toUpperCase()}. Projected free time: ${projectedFreeTime.toLocaleTimeString()}`);

    const updatePromises = [];
    const notificationApts = [];

    for (const apt of subsequentApts) {
        const scheduledStart = new Date(apt.scheduled_start);

        // The delay for THIS specific appointment is the delta between when the provider is free 
        // and when it was originally scheduled.
        const newDelay = Math.max(0, Math.floor((projectedFreeTime - scheduledStart) / 60000));

        // Only update if the delay has changed significantly (> 2 mins)
        const oldDelay = apt.delay_minutes || 0;
        if (Math.abs(newDelay - oldDelay) >= 2) {
            console.log(`[DelayEngine] Updating ${apt.id}: ${oldDelay}m -> ${newDelay}m`);

            updatePromises.push(
                supabase.from('appointments').update({ delay_minutes: newDelay }).eq('id', apt.id)
            );

            // If it's a significant delay (or a significant change), prep a notification
            if (newDelay >= 10 || (oldDelay >= 10 && newDelay < 5)) {
                notificationApts.push({ ...apt, newDelay });
            }
        }

        // Project when the provider will be free AFTER this appointment
        projectedFreeTime = new Date(scheduledStart.getTime() + (newDelay * 60000) + (apt.duration_minutes * 60000));
    }

    // Also update the triggering appointment's delay if type is 'start'
    if (type === 'start') {
        const startDelay = Math.max(0, Math.floor((actual - scheduledStart) / 60000));
        updatePromises.push(
            supabase.from('appointments').update({ delay_minutes: startDelay }).eq('id', appointmentId)
        );
    }

    if (updatePromises.length > 0) {
        console.log(`[DelayEngine] Executing ${updatePromises.length} ripple updates...`);
        await Promise.all(updatePromises);

        // Audit Logging
        try {
            await logEvent('delay.ripple', {
                business_id: currentApt.business_id,
                trigger_id: currentApt.id,
                trigger_type: type,
                affected_count: updatePromises.length
            }, { level: 'INFO', module: 'DelayEngine' });
        } catch (e) { }
    }

    // 4. Notify Clients of the NEW Projected Times
    for (const apt of notificationApts) {
        const delayMinutes = apt.newDelay;
        const sentCount = apt.notifications_sent || 0;
        const wantsMsg = apt.client?.whatsapp_opt_in === true;
        const bizName = "[Your Business Name]";

        // If catching up (delay cleared), maybe send a "Good News" message?
        // For now, let's keep it simple: Only notify for delays >= 10 mins
        if (delayMinutes < 10) continue;

        if (!wantsMsg) {
            if (sentCount === 0 && apt.provider?.whatsapp) {
                const fallbackMsg = `⚠️ FALLBACK: ${apt.client?.first_name} is NOT opted into WhatsApp. They are ${delayMinutes} mins late. Please call them at ${apt.client?.phone}.`;
                try {
                    await sendWhatsApp(apt.provider.whatsapp, fallbackMsg);
                    await supabase.from('appointments').update({ notifications_sent: 1 }).eq('id', apt.id);
                } catch (err) { }
            }
            continue;
        }

        // Standard Client Notification logic...
        let shouldSend = (sentCount === 0);
        if (sentCount === 1 && delayMinutes > 30) shouldSend = true;

        if (shouldSend) {
            try {
                const success = await sendDelayNotification(apt.client, delayMinutes, apt.scheduled_start, sentCount + 1);
                await supabase.from('appointments').update({ notifications_sent: sentCount + 1 }).eq('id', apt.id);
            } catch (err) { }
        }
    }

    // 5. Admin "Crisis Mode" Alert
    // If delay is significant, notify the Admin to check the Balancer
    if (delayMinutes >= 15) {
        try {
            const providerName = subsequentApts[0]?.provider?.full_name || "A provider";
            const providerId = currentApt.assigned_profile_id;
            await notifyAdminOfCrisis(currentApt.business_id, providerId, providerName, delayMinutes);
        } catch (err) {
            console.error('[DelayEngine] Admin notification failed:', err);
        }
    }
}

/**
 * Notifies the Business Admin via WhatsApp about a significant delay.
 * Includes throttling to prevent duplicate pings.
 */
export const notifyAdminOfCrisis = async (businessId, providerId, providerName, delayMinutes) => {
    // 1. Check throttling for this specific provider
    const { data: provider, error: profileErr } = await supabase
        .from('profiles')
        .select('last_admin_crisis_notified_at, last_notified_delay')
        .eq('id', providerId)
        .single();

    if (profileErr) return;

    const lastNotifiedAt = provider.last_admin_crisis_notified_at ? new Date(provider.last_admin_crisis_notified_at) : null;
    const lastDelay = provider.last_notified_delay || 0;
    const now = new Date();

    const MIN_COOLDOWN = 30 * 60 * 1000; // 30 mins
    const SIGNIFICANT_JUMP = 15; // 15 mins more than last notified

    const hasCooldownExpired = !lastNotifiedAt || (now - lastNotifiedAt) > MIN_COOLDOWN;
    const isDelaySignificantlyWorse = delayMinutes >= (lastDelay + SIGNIFICANT_JUMP);

    // Only notify if enough time has passed OR if the situation has gotten much worse
    if (!hasCooldownExpired && !isDelaySignificantlyWorse) {
        console.log(`[CrisisMonitor] Throttling alert for ${providerName}. (Last notified: ${lastDelay}m delay, ${Math.floor((now - lastNotifiedAt) / 60000)}m ago)`);
        return;
    }

    console.log(`[CrisisMonitor] Detecting breach for business ${businessId}. Locating Admin...`);

    // 1. Find the admin(s) for this business
    // SKIP admins who are currently viewing the 'balancer' tab (DND Mode)
    const { data: admins, error } = await supabase
        .from('profiles')
        .select('whatsapp, full_name, active_tab')
        .eq('business_id', businessId)
        .eq('role', 'Admin')
        .neq('active_tab', 'balancer'); // The "I am already attending to it" check

    if (error || !admins?.length) {
        console.log('[CrisisMonitor] No admins found or all admins are currently on the Balancer page (DND active).');
        return;
    }

    // 2. Send Alert to each Admin
    for (const admin of admins) {
        if (!admin.whatsapp) continue;

        const message = `🚨 *CRISIS ALERT*: ${providerName} is running ${delayMinutes} mins late! 📉\n\nYour dashboard has calculated re-assignment suggestions to fix this. Please open the *Workload Balancer* to approve the autopilot suggestions.\n\n- ${admin.full_name}, attend to this to keep clients happy!`;

        console.log(`[CrisisMonitor] Sending WhatsApp alert to Admin: ${admin.full_name}`);
        await sendWhatsApp(admin.whatsapp, message);

        // Individual log for each admin alerted
        await logEvent('delay.crisis.notified', {
            business_id: businessId,
            admin_id: admin.id,
            admin_name: admin.full_name,
            provider_id: providerId,
            provider_name: providerName,
            delay_minutes: delayMinutes
        }, { level: 'AUDIT', module: 'CrisisMonitor' });
    }

    // 4. Update the provider's throttling record
    await supabase
        .from('profiles')
        .update({
            last_admin_crisis_notified_at: now.toISOString(),
            last_notified_delay: delayMinutes
        })
        .eq('id', providerId);
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
                // Check if we already propagated a similar delay for this ACTIVE session
                if (Math.abs(overrunMinutes - (apt.delay_minutes || 0)) < 10) {
                    continue; // Skip if it hasn't worsened by at least 10 more minutes
                }

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
