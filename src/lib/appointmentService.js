
import { supabase } from './supabase';
import { calculateAndApplyDelay } from './delayEngine';

import { logAppointment } from './logger';

let isProcessingAssistant = false;
const TAB_ID = Math.random().toString(36).substring(7);
const LEADER_KEY = 'lat_assistant_leader';

export const isLeader = () => {
    const leaderData = localStorage.getItem(LEADER_KEY);
    if (!leaderData) return true; // No leader, I'll take it

    try {
        const { id, ts } = JSON.parse(leaderData);
        // If the leader hasn't updated in 30 seconds, it's dead
        if (Date.now() - ts > 30000) return true;
        return id === TAB_ID;
    } catch (e) {
        return true;
    }
};

const updateLeadership = () => {
    localStorage.setItem(LEADER_KEY, JSON.stringify({ id: TAB_ID, ts: Date.now() }));
};

/**
 * Core business logic for starting an appointment.
 * Can be called from UI components or the background Virtual Assistant.
 */
export const startAppointmentAction = async (id, profile, onRefresh = () => { }) => {
    const startTime = new Date().toISOString();

    try {
        const { data: apt, error: fetchError } = await supabase
            .from('appointments')
            .select('*, client:clients(first_name, last_name, phone), provider:profiles!appointments_assigned_profile_id_fkey(full_name, id)')
            .eq('id', id)
            .single();

        if (fetchError || !apt) throw new Error('Appointment not found');

        const { error } = await supabase
            .from('appointments')
            .update({ actual_start: startTime, status: 'active', delay_minutes: 0 })
            .eq('id', id);

        if (!error) {
            // 1. Trigger delay engine
            try {
                await calculateAndApplyDelay(id, startTime);
            } catch (err) {
                console.warn('[StartAction] Delay engine failed:', err);
            }

            // 2. Refresh UI if callback provided
            onRefresh();

            // 3. Log Audit Event
            await logAppointment(
                { ...apt, actual_start: startTime },
                profile || apt.provider,
                apt.client,
                profile,
                'START',
                { source: profile ? 'manual' : 'virtual_assistant' }
            );

            return { success: true };
        } else {
            if (error?.message?.includes('AbortError')) return { aborted: true };
            console.error('[StartAction] Update failed:', error);
            return { error };
        }
    } catch (error) {
        console.error('[StartAction] Critical failure:', error);
        return { error };
    }
};

/**
 * Core business logic for ending an appointment.
 */
export const endAppointmentAction = async (id, profile, onRefresh = () => { }) => {
    const endTime = new Date().toISOString();

    try {
        const { data: apt, error: fetchError } = await supabase
            .from('appointments')
            .select('*, client:clients(first_name, last_name, phone), provider:profiles!appointments_assigned_profile_id_fkey(full_name, id)')
            .eq('id', id)
            .single();

        if (fetchError || !apt) throw new Error('Appointment not found');

        const { error } = await supabase
            .from('appointments')
            .update({ actual_end: endTime, status: 'completed' })
            .eq('id', id);

        if (!error) {
            // 1. Trigger delay engine (End type)
            try {
                await calculateAndApplyDelay(id, endTime, 'end');
                // 2. Trigger assistant immediately to fill the newly freed slot
                runVirtualAssistantCycle(apt.business_id, profile);
            } catch (err) {
                console.warn('[EndAction] Post-action triggers failed:', err);
            }

            // 3. Refresh UI
            onRefresh();

            // 3. Log Audit Event
            const actualDuration = apt.actual_start ? Math.round((new Date(endTime).getTime() - new Date(apt.actual_start).getTime()) / 60000) : 0;
            await logAppointment(
                { ...apt, actual_end: endTime },
                profile || apt.provider,
                apt.client,
                profile,
                'END',
                {
                    actual_duration_min: actualDuration,
                    is_overtime: actualDuration > (apt.duration_minutes || 0),
                    source: profile ? 'manual' : 'virtual_assistant'
                }
            );

            return { success: true };
        } else {
            if (error?.message?.includes('AbortError')) return { aborted: true };
            console.error('[EndAction] Update failed:', error);
            return { error };
        }
    } catch (error) {
        console.error('[EndAction] Critical failure:', error);
        return { error };
    }
};

/**
 * Background loop logic for the Virtual Assistant.
 * Scans for appointments that need to be started or ended.
 */
export const runVirtualAssistantCycle = async (businessId, profile) => {
    if (!businessId || isProcessingAssistant) return;

    if (!isLeader()) {
        console.log(`[Assistant] Tab ${TAB_ID} is NOT leader. Standby mode.`);
        return;
    }

    updateLeadership(); // Refresh our leadership status
    console.log(`[Assistant] 💓 Pulse check for business ${businessId} at ${new Date().toLocaleTimeString()}...`);
    isProcessingAssistant = true;

    const now = new Date();
    const nowTime = now.getTime();

    try {
        const startOfDay = new Date(now);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(now);
        endOfDay.setHours(23, 59, 59, 999);

        const { data: apts, error } = await supabase
            .from('appointments')
            .select(`
                *,
                client:clients(first_name, last_name, phone),
                provider:profiles!appointments_assigned_profile_id_fkey(full_name, id)
            `)
            .eq('business_id', businessId)
            .or('status.eq.pending,status.eq.active')
            .gte('scheduled_start', startOfDay.toISOString())
            .lte('scheduled_start', endOfDay.toISOString());

        if (error || !apts) {
            console.error('[Assistant] Query error or no appointments:', error);
            isProcessingAssistant = false;
            return;
        }

        console.log(`[Assistant] Scanning ${apts.length} sessions for today...`);

        const tasks = [];
        const busyProviders = new Set();
        const providersBeingFreed = new Set();

        // 1. First Pass: Identify sessions that must END
        for (const apt of apts) {
            if (apt.status === 'active' && apt.actual_start) {
                const scheduledDuration = (apt.duration_minutes || 30) * 60000;

                // --- STABLE DICE ROLLER ---
                // We use the ID to generate a consistent "personality" for this session
                // Some sessions naturally run late (+5m), others end early (-2m)
                const seed = apt.id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
                const varianceMin = (seed % 9) - 2; // Range: -2 to +6 minutes
                const variedDuration = scheduledDuration + (varianceMin * 60000);

                const endTime = new Date(apt.actual_start).getTime() + variedDuration;
                const isOver = nowTime >= endTime;

                // SAFETY VALVE: If session is ridiculously overdue (> 120 mins), force close it
                // This prevents "Stuck" sessions from blocking providers forever
                const overdueMinutes = (nowTime - endTime) / 60000;

                if (isOver || overdueMinutes > 120) {
                    const reason = overdueMinutes > 120 ? "Force Cleanup (Stuck)" : "Auto-End";
                    console.log(`[Assistant] ✅ ${reason} Candidate: ${apt.client?.first_name}. (Over by ${Math.round(overdueMinutes)}m).`);
                    tasks.push({ type: 'END', id: apt.id, providerId: apt.assigned_profile_id });
                    providersBeingFreed.add(apt.assigned_profile_id);
                } else {
                    const remaining = Math.ceil((endTime - nowTime) / 60000);
                    console.log(`[Assistant] ⏳ Provider ${apt.assigned_profile_id} busy with ${apt.client?.first_name}. ${remaining}m left (Incl. ${varianceMin}m variance).`);
                    busyProviders.add(apt.assigned_profile_id);
                }
            }
        }

        // 2. Second Pass: Identify sessions that can START (with Smart Early Start)
        // Group pending appointments by provider to find each provider's next appointment
        const pendingByProvider = {};
        for (const apt of apts) {
            if (apt.status === 'pending') {
                const providerId = apt.assigned_profile_id;
                if (!pendingByProvider[providerId]) {
                    pendingByProvider[providerId] = [];
                }
                pendingByProvider[providerId].push(apt);
            }
        }

        // Sort each provider's appointments by scheduled time (earliest first)
        for (const providerId of Object.keys(pendingByProvider)) {
            pendingByProvider[providerId].sort((a, b) =>
                new Date(a.scheduled_start).getTime() - new Date(b.scheduled_start).getTime()
            );
        }

        /**
         * SMART EARLY START - Sliding Window Logic
         * Returns the early start offset (in ms) allowed for the given gap range.
         * 
         * | Gap to Scheduled Time | Early Start Allowed | Start When Gap ≤ |
         * |-----------------------|---------------------|------------------|
         * | 0-5 min               | Start immediately   | gap itself       |
         * | 5-10 min              | Up to 3 min early   | 3 min            |
         * | 10-15 min             | Up to 5 min early   | 5 min            |
         * | 15-20 min             | Up to 10 min early  | 10 min           |
         * | 20+ min               | No early start      | wait             |
         */
        const getEarlyStartAllowedMs = (gapMinutes) => {
            if (gapMinutes <= 5) return gapMinutes * 60000; // Start immediately
            if (gapMinutes <= 10) return 3 * 60000;  // Start when gap ≤ 3 min
            if (gapMinutes <= 15) return 5 * 60000;  // Start when gap ≤ 5 min
            if (gapMinutes <= 20) return 10 * 60000; // Start when gap ≤ 10 min
            return 0; // No early start for 20+ min gaps
        };

        for (const apt of apts) {
            if (apt.status === 'pending') {
                const scheduledStart = new Date(apt.scheduled_start).getTime();
                const delayMs = (apt.delay_minutes || 0) * 60000;
                const delayedStart = scheduledStart + delayMs;
                const providerId = apt.assigned_profile_id;

                const isBusy = busyProviders.has(providerId);
                const isAlreadyPlanned = tasks.some(t => t.type === 'START' && t.providerId === providerId);

                // Check if this is the provider's NEXT appointment (earliest pending)
                const providerPending = pendingByProvider[providerId] || [];
                const isNextAppointment = providerPending.length > 0 && providerPending[0].id === apt.id;

                // Calculate gap to scheduled time (positive = future, negative = overdue)
                const gapMs = scheduledStart - nowTime;
                const gapMinutes = gapMs / 60000;

                // Condition 1: Scheduled time has passed (normal start)
                const isTime = nowTime >= scheduledStart;

                // Condition 2: Smart Early Start - Provider is free and this is their next appointment
                const earlyStartAllowedMs = getEarlyStartAllowedMs(gapMinutes);
                const canStartEarly = !isBusy && isNextAppointment && gapMinutes > 0 && gapMinutes <= 20 && earlyStartAllowedMs > 0;
                const shouldStartEarly = canStartEarly && (gapMs <= earlyStartAllowedMs);

                // DEBUG: Log all conditions for early start candidates
                if (gapMinutes > 0 && gapMinutes <= 20 && isNextAppointment) {
                    console.log(`[Assistant] 📊 Early Start Check for ${apt.client?.first_name}:`, {
                        provider: providerId?.substring(0, 8),
                        gapMinutes: Math.round(gapMinutes * 10) / 10,
                        isBusy,
                        isNextAppointment,
                        earlyStartAllowedMin: earlyStartAllowedMs / 60000,
                        canStartEarly,
                        shouldStartEarly,
                        isTime
                    });
                }

                if (isTime || shouldStartEarly) {
                    if (isBusy) {
                        console.log(`[Assistant] ⏳ Waiting for Provider ${providerId}: ${apt.client?.first_name} is READY.`);
                    } else if (isAlreadyPlanned) {
                        // Already planned for this provider
                    } else {
                        // Determine start reason for logging
                        let startReason;
                        if (shouldStartEarly && !isTime) {
                            const earlyByMin = Math.round(gapMinutes);
                            startReason = `⚡ Smart Early Start (${earlyByMin}m early, provider free)`;
                        } else if (nowTime >= delayedStart) {
                            startReason = "Lateness";
                        } else {
                            startReason = "Catch-up Opportunity";
                        }

                        console.log(`[Assistant] 🚀 Starting ${apt.client?.first_name} (${startReason}).`);
                        tasks.push({ type: 'START', id: apt.id, providerId: providerId });
                    }
                } else if (gapMinutes > 0 && gapMinutes <= 20 && !isBusy && isNextAppointment) {
                    // Log upcoming early-start candidates
                    const earlyStartIn = Math.round((gapMs - earlyStartAllowedMs) / 60000);
                    if (earlyStartIn > 0) {
                        console.log(`[Assistant] 🕐 Early Start Candidate: ${apt.client?.first_name} in ${earlyStartIn}m (Gap: ${Math.round(gapMinutes)}m).`);
                    }
                } else {
                    console.log(`[Assistant] 🕒 Too early for ${apt.client?.first_name}. Due ${new Date(scheduledStart).toLocaleTimeString()}.`);
                }
            }
        }

        if (tasks.length > 0) {
            // Sort: Process END tasks first so providers are freed up before processing START tasks
            tasks.sort((a, b) => (a.type === 'END' ? -1 : 1));

            console.log(`[VirtualAssistant] 🤖 Cycle: processing ${tasks.length} tasks. Busy providers: ${busyProviders.size}`);

            for (const task of tasks) {
                if (task.type === 'START') {
                    console.log(`[VirtualAssistant] 🤖 Auto-Starting appointment ${task.id} for provider ${task.providerId}`);
                    await startAppointmentAction(task.id, null);
                } else {
                    console.log(`[VirtualAssistant] 🤖 Auto-Ending appointment ${task.id} for provider ${task.providerId}`);
                    await endAppointmentAction(task.id, null);
                }
                // Small delay between tasks
                await new Promise(r => setTimeout(r, 1000));
            }
        }
    } finally {
        isProcessingAssistant = false;
    }
};
