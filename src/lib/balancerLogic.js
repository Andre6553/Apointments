import { supabase } from './supabase'

/**
 * Intelligent Engine to find re-assignment opportunities for delayed sessions.
 * Only considers providers who are currently ONLINE.
 * Optimized to use BATCH fetching to prevent N+1 DB query disasters.
 */
export const getSmartReassignments = async (businessId) => {
    if (!businessId) {
        console.warn('[Autopilot] Missing businessId, skipping.');
        return [];
    }
    console.log('[Autopilot] Calculating smart reassignments...');

    // 1. Fetch all delayed appointments in this business
    // Limit to reasonable window (e.g., today/tomorrow) to prevent legacy data load
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const twoDaysFromNow = new Date(); twoDaysFromNow.setDate(today.getDate() + 2);

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
        .gte('scheduled_start', today.toISOString())
        .lte('scheduled_start', twoDaysFromNow.toISOString())
        .order('scheduled_start', { ascending: true });

    if (!delayedApts?.length) {
        console.log('[Autopilot] No delayed appointments found.');
        return [];
    }

    // 2. Fetch all ONLINE providers in the same business
    const { data: onlineProviders } = await supabase
        .from('profiles')
        .select('*')
        .eq('business_id', businessId)
        .eq('is_online', true)
        .eq('role', 'Provider');

    if (!onlineProviders?.length) return [];

    const providerIds = onlineProviders.map(p => p.id);

    // 3. BULK FETCH Provider constraints (Resolve N+1 Issue)
    // 3a. Working Hours
    const { data: allHours } = await supabase
        .from('working_hours')
        .select('*')
        .in('profile_id', providerIds)
        .eq('is_active', true);

    // 3b. Breaks
    const { data: allBreaks } = await supabase
        .from('breaks')
        .select('*')
        .in('profile_id', providerIds);

    // 3c. Existing Appointments (Conflicts) for the relevant dates
    const { data: allProviderApts } = await supabase
        .from('appointments')
        .select('assigned_profile_id, scheduled_start, duration_minutes')
        .in('assigned_profile_id', providerIds)
        .in('status', ['pending', 'active'])
        .gte('scheduled_start', today.toISOString())
        .lte('scheduled_start', twoDaysFromNow.toISOString());

    // 3d. Fetch Treatments (to handle missing treatment_id in appointments)
    const { data: allTreatments } = await supabase
        .from('treatments')
        .select('name, required_skills');

    // Map treatments for fast lookup
    const treatmentSkillsMap = {};
    allTreatments?.forEach(t => {
        treatmentSkillsMap[t.name] = t.required_skills || [];
    });

    const suggestions = [];

    // 4. Processing Loop (In-Memory)
    for (const apt of delayedApts) {
        const start = new Date(apt.scheduled_start);
        const end = new Date(start.getTime() + apt.duration_minutes * 60000);
        const dayOfWeek = start.getDay();

        let bestFix = null;

        for (const provider of onlineProviders) {
            // Skip if it's already their appointment
            if (provider.id === apt.assigned_profile_id) continue;

            const pid = provider.id;

            // CHECK 0: Skills Match (Enforced per USER request)
            const requiredSkills = (apt.required_skills && Array.isArray(apt.required_skills) && apt.required_skills.length > 0)
                ? apt.required_skills
                : (treatmentSkillsMap[apt.treatment_name] || []);

            if (Array.isArray(requiredSkills) && requiredSkills.length > 0) {
                const providerSkillsRaw = Array.isArray(provider.skills) ? provider.skills : [];
                const providerCodes = providerSkillsRaw.map(s => (typeof s === 'object' ? s.code : s));
                const hasAllSkills = requiredSkills.every(req => providerCodes.includes(req));
                if (!hasAllSkills) continue;
            }

            // CHECK 1: Working Hours
            // Find hours for this provider & day
            const hours = allHours?.find(h => h.profile_id === pid && h.day_of_week === dayOfWeek);
            if (!hours) continue;

            const [hS, mS] = hours.start_time.split(':').map(Number);
            const [hE, mE] = hours.end_time.split(':').map(Number);
            const shiftStart = new Date(start); shiftStart.setHours(hS, mS, 0, 0);
            const shiftEnd = new Date(start); shiftEnd.setHours(hE, mE, 0, 0);

            if (start < shiftStart || end > shiftEnd) continue;

            // CHECK 2: Breaks
            const breaks = allBreaks?.filter(b => b.profile_id === pid && b.day_of_week === dayOfWeek) || [];
            let onBreak = false;
            for (const b of breaks) {
                const [bh, bm] = b.start_time.split(':').map(Number);
                const bS = new Date(start); bS.setHours(bh, bm, 0, 0);
                const bE = new Date(bS.getTime() + b.duration_minutes * 60000);
                if (start < bE && end > bS) { onBreak = true; break; }
            }
            if (onBreak) continue;

            // CHECK 3: Overlapping Appointments (Using bulk fetched data)
            const providerApts = allProviderApts?.filter(a => a.assigned_profile_id === pid) || [];
            let overlapping = false;
            for (const other of providerApts) {
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
                treatmentName: apt.treatment_name,
                scheduledTime: start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                delayMinutes: apt.delay_minutes
            });
        }
    }

    console.log(`[Autopilot] Finished. Found ${suggestions.length} suggestions.`);
    return suggestions;
}

/**
 * Calculates the "Health" of the floor.
 * Warning Level:
 * - Green: < 80% Capacity used
 * - Yellow: 80% - 100% Capacity used
 * - Red: > 100% (Mathematically impossible to finish w/o overtime)
 */
export const analyzeSystemHealth = async (businessId) => {
    if (!businessId) {
        console.warn('[SystemHealth] Missing businessId, skipping.');
        return null;
    }
    console.log('[SystemHealth] Analyzing capacity vs workload...');
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const dayOfWeek = now.getDay();

    // 1. Fetch Online Providers & Their Constraints
    const { data: onlineProviders } = await supabase
        .from('profiles')
        .select('id, full_name, whatsapp')
        .eq('business_id', businessId)
        .eq('is_online', true)
        .eq('role', 'Provider');

    if (!onlineProviders?.length) return { status: 'Critical', load: 100, message: 'No providers online!' };

    const pIds = onlineProviders.map(p => p.id);

    // Fetch Hours & Breaks
    const { data: hours } = await supabase.from('working_hours').select('*').in('profile_id', pIds).eq('day_of_week', dayOfWeek).eq('is_active', true);
    const { data: breaks } = await supabase.from('breaks').select('*').in('profile_id', pIds).eq('day_of_week', dayOfWeek);

    // Fetch ALL remaining work for today (Active + Pending)
    const { data: workload } = await supabase
        .from('appointments')
        .select('id, assigned_profile_id, status, scheduled_start, duration_minutes, treatment_name, required_skills, client:clients(first_name, last_name, phone)')
        .in('assigned_profile_id', pIds)
        .in('status', ['active', 'pending'])
        .gte('scheduled_start', `${todayStr}T00:00:00`)
        .lte('scheduled_start', `${todayStr}T23:59:59`);

    let totalCapacityMinutes = 0;
    let totalLoadMinutes = 0;
    const atRisk = [];

    // 2. Calculate Capacity Per Provider
    for (const provider of onlineProviders) {
        const myHours = hours?.find(h => h.profile_id === provider.id);
        if (!myHours) continue; // Not working today

        const [hE, mE] = myHours.end_time.split(':').map(Number);
        const shiftEnd = new Date(now); shiftEnd.setHours(hE, mE, 0, 0);

        if (now >= shiftEnd) continue; // Shift over

        // Raw Minutes Left
        let minutesLeft = (shiftEnd - now) / 60000;

        // Deduct Breaks (future only)
        const myBreaks = breaks?.filter(b => b.profile_id === provider.id) || [];
        for (const b of myBreaks) {
            const [bS_h, bS_m] = b.start_time.split(':').map(Number);
            const breakStart = new Date(now); breakStart.setHours(bS_h, bS_m, 0, 0);
            if (breakStart > now && breakStart < shiftEnd) {
                minutesLeft -= b.duration_minutes;
            }
        }

        totalCapacityMinutes += Math.max(0, minutesLeft);

        // 3. Calculate MY Load
        // Note: For global health, we sum everyone's load vs everyone's capacity
        // "Workload" query already fetched all tasks for these PIDs
        const myTasks = workload?.filter(w => w.assigned_profile_id === provider.id) || [];
        const myLoad = myTasks.reduce((sum, t) => sum + t.duration_minutes, 0);

        totalLoadMinutes += myLoad;

        // 4. Check "At Risk" (Will this specific person finish?)
        // Simple heuristic: If Load > Capacity, last tasks are at risk
        if (myLoad > minutesLeft) {
            // Sort by time, last ones are the problem
            const sorted = [...myTasks].sort((a, b) => new Date(a.scheduled_start) - new Date(b.scheduled_start));
            let runningSum = 0;
            for (const task of sorted) {
                runningSum += task.duration_minutes;
                if (runningSum > minutesLeft) {
                    atRisk.push({
                        ...task,
                        reason: 'Predicting Overtime',
                        providerName: provider.full_name,
                        excessMinutes: Math.round(runningSum - minutesLeft)
                    });
                }
            }
        }
    }

    const loadPercentage = totalCapacityMinutes > 0 ? Math.round((totalLoadMinutes / totalCapacityMinutes) * 100) : 100;

    let status = 'Stable';
    if (loadPercentage >= 100) status = 'Critical';
    else if (loadPercentage > 80) status = 'Warning';

    return {
        status,
        loadPercentage,
        totalCapacityMinutes: Math.round(totalCapacityMinutes),
        totalLoadMinutes: Math.round(totalLoadMinutes),
        atRiskAppointments: atRisk
    };
}
