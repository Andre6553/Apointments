import { supabase } from './supabase'

/**
 * Intelligent Engine to find re-assignment opportunities for delayed sessions.
 * Only considers providers who are currently ONLINE.
 */
export const getSmartReassignments = async (businessId) => {
    console.log('[Autopilot] Calculating smart reassignments...');

    // 1. Fetch all delayed appointments in this business
    const { data: delayedApts } = await supabase
        .from('appointments')
        .select(`
            *,
            client:clients(first_name, last_name, phone),
            provider:profiles!appointments_assigned_profile_id_fkey(full_name, id)
        `)
        .eq('business_id', businessId)
        .eq('status', 'pending')
        .gt('delay_minutes', 15) // Threshold
        .order('scheduled_start', { ascending: true });

    if (!delayedApts?.length) return [];

    // 2. Fetch all ONLINE providers in the same business
    const { data: onlineProviders } = await supabase
        .from('profiles')
        .select('*')
        .eq('business_id', businessId)
        .eq('is_online', true)
        .eq('role', 'Provider');

    if (!onlineProviders?.length) return [];

    const suggestions = [];

    // 3. For each delayed appointment, find a "Fix"
    for (const apt of delayedApts) {
        const start = new Date(apt.scheduled_start);
        const end = new Date(start.getTime() + apt.duration_minutes * 60000);
        const dayOfWeek = start.getDay();

        let bestFix = null;

        for (const provider of onlineProviders) {
            // Skip if it's already their appointment
            if (provider.id === apt.assigned_profile_id) continue;

            // CHECK 1: Working Hours
            const { data: hours } = await supabase
                .from('working_hours')
                .select('*')
                .eq('profile_id', provider.id)
                .eq('day_of_week', dayOfWeek)
                .maybeSingle();

            if (!hours || !hours.is_active) continue;

            const [hS, mS] = hours.start_time.split(':').map(Number);
            const [hE, mE] = hours.end_time.split(':').map(Number);
            const shiftStart = new Date(start); shiftStart.setHours(hS, mS, 0, 0);
            const shiftEnd = new Date(start); shiftEnd.setHours(hE, mE, 0, 0);

            if (start < shiftStart || end > shiftEnd) continue;

            // CHECK 2: Breaks
            const { data: breaks } = await supabase
                .from('breaks')
                .select('*')
                .eq('profile_id', provider.id)
                .eq('day_of_week', dayOfWeek);

            let onBreak = false;
            for (const b of breaks || []) {
                const [bh, bm] = b.start_time.split(':').map(Number);
                const bS = new Date(start); bS.setHours(bh, bm, 0, 0);
                const bE = new Date(bS.getTime() + b.duration_minutes * 60000);
                if (start < bE && end > bS) { onBreak = true; break; }
            }
            if (onBreak) continue;

            // CHECK 3: Overlapping Appointments
            const { data: otherApts } = await supabase
                .from('appointments')
                .select('scheduled_start, duration_minutes')
                .eq('assigned_profile_id', provider.id)
                .in('status', ['pending', 'active'])
                .gte('scheduled_start', `${formatDate(start)}T00:00:00`)
                .lte('scheduled_start', `${formatDate(start)}T23:59:59`);

            let overlapping = false;
            for (const other of otherApts || []) {
                const oS = new Date(other.scheduled_start);
                const oE = new Date(oS.getTime() + other.duration_minutes * 60000);
                if (start < oE && end > oS) { overlapping = true; break; }
            }

            if (!overlapping) {
                bestFix = {
                    providerId: provider.id,
                    providerName: provider.full_name,
                    whatsapp: provider.whatsapp
                };
                break; // Found a provider for this apt
            }
        }

        if (bestFix) {
            suggestions.push({
                appointmentId: apt.id,
                clientName: `${apt.client?.first_name} ${apt.client?.last_name || ''}`.trim(),
                currentProviderName: apt.provider?.full_name,
                currentProviderId: apt.assigned_profile_id,
                newProviderId: bestFix.providerId,
                newProviderName: bestFix.providerName,
                newProviderWhatsapp: bestFix.whatsapp,
                scheduledTime: start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                delayMinutes: apt.delay_minutes
            });
        }
    }

    return suggestions;
}

const formatDate = (date) => {
    const d = new Date(date);
    let month = '' + (d.getMonth() + 1);
    let day = '' + d.getDate();
    let year = d.getFullYear();

    if (month.length < 2) month = '0' + month;
    if (day.length < 2) day = '0' + day;

    return [year, month, day].join('-');
}
