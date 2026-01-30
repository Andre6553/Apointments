
import { supabase } from './supabase'

/**
 * Medical Demo Seeder & Stress Tester
 * Simulates a busy clinic environment by injecting live appointments.
 */

// --- CONFIGURATION ---
const DOCTORS = [
    { name: 'Dr. Gregory House', skills: [{ label: 'Diagnostician', code: 'DIAG' }, { label: 'Internal Med', code: 'INT' }] },
    { name: 'Dr. Meredith Grey', skills: [{ label: 'General Surgery', code: 'SURG' }] },
    { name: 'Dr. Derek Shepherd', skills: [{ label: 'Neurosurgery', code: 'NEURO' }, { label: 'Surgery', code: 'SURG' }] },
    { name: 'Dr. Cristina Yang', skills: [{ label: 'Cardiothoracic', code: 'CARD' }, { label: 'Surgery', code: 'SURG' }] },
    { name: 'Dr. John Dorian', skills: [{ label: 'Internal Med', code: 'INT' }, { label: 'General Practice', code: 'GP' }] },
    { name: 'Dr. Perry Cox', skills: [{ label: 'Internal Med', code: 'INT' }] },
    { name: 'Dr. Stephen Strange', skills: [{ label: 'Neurosurgery', code: 'NEURO' }, { label: 'Trauma', code: 'TRAUMA' }] },
    { name: 'Dr. Michaela Quinn', skills: [{ label: 'General Practice', code: 'GP' }, { label: 'Pediatrics', code: 'PED' }] },
    { name: 'Dr. Doogie Howser', skills: [{ label: 'General Practice', code: 'GP' }] },
    { name: 'Dr. Leonard McCoy', skills: [{ label: 'Space Medicine', code: 'SPACE' }, { label: 'General Practice', code: 'GP' }] }
];

const SERVICES = [
    // General / Internal
    { name: 'General Checkup', duration: 15, cost: 80, skills: ['GP'] },
    { name: 'Quick Consult', duration: 5, cost: 30, skills: ['GP'] },
    { name: 'Follow-up', duration: 10, cost: 50, skills: ['GP'] },
    { name: 'Internal Med', duration: 25, cost: 180, skills: ['INT'] },
    { name: 'Med Review', duration: 10, cost: 70, skills: ['INT'] },

    // Cardiovascular
    { name: 'Heart Checkup', duration: 30, cost: 200, skills: ['CARD'] },
    { name: 'EKG Reading', duration: 10, cost: 100, skills: ['CARD'] },
    { name: 'Cardiac Sync', duration: 5, cost: 50, skills: ['CARD'] },

    // Surgery / Trauma
    { name: 'Surgical Prep', duration: 20, cost: 300, skills: ['SURG'] },
    { name: 'Minor Suture', duration: 15, cost: 150, skills: ['SURG'] },
    { name: 'Post-Op Chat', duration: 10, cost: 80, skills: ['SURG'] },
    { name: 'Emergency Stitch', duration: 15, cost: 180, skills: ['TRAUMA'] },
    { name: 'Trauma Review', duration: 30, cost: 250, skills: ['TRAUMA'] },

    // Neuro / Diagnostic
    { name: 'Neuro Scan', duration: 30, cost: 400, skills: ['NEURO'] },
    { name: 'Reflex Test', duration: 15, cost: 120, skills: ['NEURO'] },
    { name: 'Diagnostic Test', duration: 30, cost: 350, skills: ['DIAG'] },
    { name: 'Lab Analysis', duration: 15, cost: 200, skills: ['DIAG'] },

    // Peds
    { name: 'Pediatric Check', duration: 20, cost: 90, skills: ['PED'] },
    { name: 'Vaccine', duration: 10, cost: 60, skills: ['PED'] },

    // Space (McCoy)
    { name: 'Scanner Sync', duration: 10, cost: 500, skills: ['SPACE'] }
];

// --- PUBLIC API ---

export const getDemoStatus = () => {
    return localStorage.getItem('DEMO_MODE') === 'true';
};

export const setDemoStatus = (isEnabled) => {
    localStorage.setItem('DEMO_MODE', isEnabled);
};

/**
 * Wipes appointments and resets providers to Medical Demo state.
 * Does NOT bulk seed appointments anymore.
 */
export const initializeMedicalDemo = async (businessId) => {
    console.log('🏥 Initializing Medical Demo...');

    // 1. Wipe Data (Hard Delete) with Logging
    console.log(`[Demo] Wiping data for business: ${businessId}...`);

    const { error: aptError } = await supabase.from('appointments').delete().eq('business_id', businessId);
    if (aptError) {
        console.error('❌ FAILED to delete appointments:', aptError);
        throw new Error(`Appointment Wipe Failed: ${aptError.message}`);
    }
    console.log('✅ Appointments wiped.');

    const { error: txError } = await supabase.from('treatments').delete().eq('business_id', businessId);
    if (txError) {
        console.error('❌ FAILED to delete treatments:', txError);
        // Note: Treatments might be linked to appointments. 
    } else {
        console.log('✅ Treatments wiped.');
    }

    // Hard Reset Clients too for a truly clean slate
    const { error: clientError } = await supabase.from('clients').delete().eq('business_id', businessId);
    if (clientError) {
        console.error('⚠️ Note: Could not wipe clients (might be optional or linked):', clientError);
    } else {
        console.log('✅ Clients wiped.');
    }

    // 2. Fetch Providers & Find a "Seed Owner" (Admin)
    const { data: providers } = await supabase
        .from('profiles')
        .select('*')
        .eq('business_id', businessId)
        .order('created_at');

    if (!providers?.length) {
        console.error('❌ No providers found for business:', businessId);
        return;
    }

    const seedOwner = providers.find(p => p.role?.toLowerCase() === 'admin') || providers[0];

    // 3. Update Providers (Name & Skills)
    for (let i = 0; i < providers.length; i++) {
        if (!DOCTORS[i]) break;

        await supabase
            .from('profiles')
            .update({
                full_name: DOCTORS[i].name,
                skills: DOCTORS[i].skills,
                is_online: true
            })
            .eq('id', providers[i].id);
    }

    // 4. Create Services
    console.log('[Demo] Creating treatments...');
    const servicesToInsert = SERVICES.map(svc => ({
        business_id: businessId,
        profile_id: seedOwner.id,
        name: svc.name,
        duration_minutes: svc.duration,
        cost: svc.cost,
        required_skills: svc.skills
    }));
    const { data: createdTreatments, error: insertTxError } = await supabase.from('treatments').insert(servicesToInsert).select();

    if (insertTxError) {
        console.error('❌ FAILED to create treatments:', insertTxError);
    } else {
        console.log(`✅ ${createdTreatments?.length || 0} treatments created.`);
    }

    // 5. Setup Provider Schedules (24h for 1-4, staggered breaks, 5min buffers)
    console.log('[Demo] Configuring provider schedules (24h staff, staggered breaks, buffers)...');

    // Wipe old schedules/breaks first
    await supabase.from('working_hours').delete().in('profile_id', providers.map(p => p.id));
    await supabase.from('breaks').delete().in('profile_id', providers.map(p => p.id));

    for (let i = 0; i < providers.length; i++) {
        const p = providers[i];

        // Everyone gets 5min buffer
        await supabase.from('profiles').update({
            buffer_minutes: 5,
            enable_buffer: true
        }).eq('id', p.id);

        if (i < 5) {
            // Providers 1-4 get 24h schedule for every day of the week
            const schedule = [];
            for (let day = 0; day < 7; day++) {
                schedule.push({
                    profile_id: p.id,
                    day_of_week: day,
                    start_time: '00:00:00',
                    end_time: '23:59:59'
                });
            }
            await supabase.from('working_hours').insert(schedule);

            // Staggered Breaks (2x 30m Lunch, 4x 15m Tea)
            // Staggering based on index i (0-3)
            const offset = (i * 30); // 0, 30, 60, 90 mins offset
            const breaks = [];
            for (let day = 0; day < 7; day++) {
                // Lunch 1 (around 12pm)
                const l1Min = 720 + offset; // 12:00 + offset
                breaks.push({ profile_id: p.id, day_of_week: day, label: 'Lunch 1', start_time: `${Math.floor(l1Min / 60).toString().padStart(2, '0')}:${(l1Min % 60).toString().padStart(2, '0')}`, duration_minutes: 30 });

                // Lunch 2 (around 5pm)
                const l2Min = 1020 + offset; // 17:00 + offset
                breaks.push({ profile_id: p.id, day_of_week: day, label: 'Lunch 2', start_time: `${Math.floor(l2Min / 60).toString().padStart(2, '0')}:${(l2Min % 60).toString().padStart(2, '0')}`, duration_minutes: 30 });

                // Tea 1 (around 10am)
                const t1Min = 600 + (i * 15);
                breaks.push({ profile_id: p.id, day_of_week: day, label: 'Tea 1', start_time: `${Math.floor(t1Min / 60).toString().padStart(2, '0')}:${(t1Min % 60).toString().padStart(2, '0')}`, duration_minutes: 15 });

                // Tea 2 (around 3pm)
                const t2Min = 900 + (i * 15);
                breaks.push({ profile_id: p.id, day_of_week: day, label: 'Tea 2', start_time: `${Math.floor(t2Min / 60).toString().padStart(2, '0')}:${(t2Min % 60).toString().padStart(2, '0')}`, duration_minutes: 15 });

                // Tea 3 (around 7pm)
                const t3Min = 1140 + (i * 15);
                breaks.push({ profile_id: p.id, day_of_week: day, label: 'Tea 3', start_time: `${Math.floor(t3Min / 60).toString().padStart(2, '0')}:${(t3Min % 60).toString().padStart(2, '0')}`, duration_minutes: 15 });

                // Tea 4 (around 10pm)
                const t4Min = 1320 + (i * 15);
                breaks.push({ profile_id: p.id, day_of_week: day, label: 'Tea 4', start_time: `${Math.floor(t4Min / 60).toString().padStart(2, '0')}:${(t4Min % 60).toString().padStart(2, '0')}`, duration_minutes: 15 });
            }
            await supabase.from('breaks').insert(breaks);
        }
    }

    // 6. Create Dummy Clients (10 per provider for testing)
    console.log('[Demo] Generating 100 dummy clients (10 per provider with specific naming)...');
    const surnameMap = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'];
    const dummyClients = [];

    providers.forEach((provider, pIdx) => {
        const providerNum = pIdx + 1;
        const surname = surnameMap[providerNum] || `P${providerNum}`;

        for (let i = 1; i <= 10; i++) {
            dummyClients.push({
                first_name: `Patient${i}`,
                last_name: surname,
                phone: '+27761963997', // Constant for messaging tests
                business_id: businessId,
                owner_id: provider.id,
                whatsapp_opt_in: Math.random() < 0.8 // 80% opt-in rate
            });
        }
    });

    const { data: createdClients } = await supabase.from('clients').insert(dummyClients).select();

    // 7. Bulk Seed (DISABLED - User wants one-by-one injection every 10s)
    // await performBulkSeed(businessId, providers.slice(0, 4), createdTreatments || [], createdClients || []);

    console.log('✅ Medical Demo Initialized. Reset isolated to business:', businessId);
};

/**
 * Massive bulk injection for testing
 */
const performBulkSeed = async (businessId, providers, treatments, clients) => {
    console.log(`[Demo] Sequential Bulk Seeding for selected ${providers.length} providers...`);
    let allApts = [];
    const now = new Date();

    for (let day = 0; day < 14; day++) {
        // Shuffle providers so we don't always book in the same order
        const shuffledProviders = [...providers].sort(() => Math.random() - 0.5);

        for (const provider of shuffledProviders) {
            const providerSkills = (provider.skills || []).map(s => typeof s === 'object' ? s.code : s);
            const myClients = clients.filter(c => c.owner_id === provider.id);
            if (!myClients.length) continue;

            const qualifiedTreatments = treatments.filter(t => {
                const reqs = t.required_skills || [];
                return reqs.length === 0 || reqs.every(req => providerSkills.includes(req));
            });
            if (!qualifiedTreatments.length) continue;

            // Start day logic
            const dayPointer = new Date(now);
            dayPointer.setDate(dayPointer.getDate() + day);

            // If today, start from right now + 15m buffer
            if (day === 0) {
                dayPointer.setMinutes(dayPointer.getMinutes() + 15);
            } else {
                dayPointer.setHours(8, 0, 0, 0); // Morning for future days
            }

            // Book 6-12 appointments per day for this provider (Busy clinic simulation)
            const apptsToBook = 6 + Math.floor(Math.random() * 7);
            let lastEndTime = dayPointer.getTime();

            for (let i = 0; i < apptsToBook; i++) {
                const service = qualifiedTreatments[Math.floor(Math.random() * qualifiedTreatments.length)];

                // Randomized gap (5-30 mins)
                const gap = (1 + Math.floor(Math.random() * 5)) * 5 * 60000;
                const startDt = new Date(lastEndTime + gap);

                // For providers 1-4 (who have 24h schedules), we can book into the night
                // But let's avoid 3am unless explicitly asked. We'll stick to a wide range.
                if (startDt.getHours() >= 23) break;

                allApts.push({
                    business_id: businessId,
                    assigned_profile_id: provider.id,
                    client_id: myClients[Math.floor(Math.random() * myClients.length)].id,
                    treatment_name: service.name,
                    treatment_id: service.id,
                    required_skills: service.required_skills || [],
                    duration_minutes: service.duration_minutes,
                    scheduled_start: startDt.toISOString(),
                    status: 'pending',
                    notes: '🤖 Bulk Seeded (Demo)',
                    cost: service.cost
                });

                lastEndTime = startDt.getTime() + (service.duration_minutes * 60000);
            }
        }
    }

    if (allApts.length > 0) {
        console.log(`[Demo] Sequential injection of ${allApts.length} appointments for specific providers...`);
        const { error } = await supabase.from('appointments').insert(allApts);
        if (error) console.error('❌ Sequential Injection Error:', error);
        else console.log('✅ Sequential Seeding Successful.');
    }
};


/**
 * Live "Bot" Booking
 * Systematic Sequential Operator Logic:
 * 1. Scans Day 0-13 for Providers 1-4.
 * 2. Finds the FIRST available gap (chronological).
 * 3. Respects Skills, Work Hours, Breaks, Buffers.
 * 4. Books ONE appointment per 10s pulse using the Provider's OWN clients.
 */
export const runStressTest = async (businessId) => {
    if (!getDemoStatus()) return;
    console.log('🤖 Demo Bot: Running systematic sequential scan (Day 0-13)...');

    try {
        // 1. Context Collection
        const { data: allProviders } = await supabase
            .from('profiles')
            .select('*')
            .eq('business_id', businessId)
            .order('created_at');

        // STRICTLY PROVIDERS 1-4 (Excluding Admin)
        const targetProviders = (allProviders
            ?.filter(p => p.role?.toLowerCase() !== 'admin')
            .slice(0, 4) || [])
            .sort(() => Math.random() - 0.5); // Randomize start order to interleave bookings

        if (!targetProviders?.length) return;

        const pIds = targetProviders.map(p => p.id);

        const { data: treatments } = await supabase.from('treatments').select('*').eq('business_id', businessId);
        const { data: clients } = await supabase.from('clients').select('*').in('owner_id', pIds);

        const now = new Date();
        const endDate = new Date(now);
        endDate.setDate(now.getDate() + 14);

        // Fetch all constraints for the window in one go
        const { data: allApts } = await supabase
            .from('appointments')
            .select('scheduled_start, duration_minutes, assigned_profile_id')
            .in('assigned_profile_id', pIds)
            .gte('scheduled_start', now.toISOString())
            .lte('scheduled_start', endDate.toISOString())
            .in('status', ['pending', 'active', 'completed']);

        const { data: allHours } = await supabase.from('working_hours').select('*').in('profile_id', pIds);
        const { data: allBreaks } = await supabase.from('breaks').select('*').in('profile_id', pIds);

        // 2. The Search Matrix (Day -> Provider -> Slot)
        for (let d = 0; d < 14; d++) {
            const targetDate = new Date(now);
            targetDate.setDate(now.getDate() + d);
            const dayOfWeek = targetDate.getDay();
            const dateStr = targetDate.toDateString();

            for (const provider of targetProviders) {
                // A. Check if provider has work on this day
                const myHours = allHours.find(h => h.profile_id === provider.id && h.day_of_week === dayOfWeek);
                if (!myHours || !myHours.is_active) continue;

                // B. Resource check
                const myClients = clients.filter(c => c.owner_id === provider.id);
                if (!myClients.length) continue;

                const providerSkills = (provider.skills || []).map(s => typeof s === 'object' ? s.code : s);
                const qualifiedTreatments = (treatments || []).filter(t => {
                    const reqs = t.required_skills || [];
                    return reqs.length === 0 || reqs.every(req => providerSkills.includes(req));
                });
                if (!qualifiedTreatments.length) continue;

                // C. Local Context
                const myBreaks = (allBreaks || []).filter(b => b.profile_id === provider.id && b.day_of_week === dayOfWeek);
                const myApts = (allApts || []).filter(a => a.assigned_profile_id === provider.id && new Date(a.scheduled_start).toDateString() === dateStr);

                // D. Slot Scanner
                const [hS, mS] = myHours.start_time.split(':').map(Number);
                const [hE, mE] = myHours.end_time.split(':').map(Number);

                let scanPointer = new Date(targetDate);
                scanPointer.setHours(hS, mS, 0, 0);

                // Don't book in the past if today
                if (d === 0 && scanPointer < now) {
                    scanPointer = new Date(now);
                    // Round up to nearest 5 mins + 10m buffer from right now
                    scanPointer.setMinutes(Math.ceil(scanPointer.getMinutes() / 5) * 5 + 10, 0, 0);
                }

                const workEnd = new Date(targetDate);
                workEnd.setHours(hE, mE, 0, 0);

                const bufferMin = (provider.enable_buffer ? (provider.buffer_minutes || 0) : 0);

                while (scanPointer < workEnd) {
                    // Try random treatment from qualified list for variety in the "manual" look
                    const service = qualifiedTreatments[Math.floor(Math.random() * qualifiedTreatments.length)];
                    const duration = service.duration_minutes || 30;

                    const slotStart = new Date(scanPointer);
                    const slotEnd = new Date(slotStart.getTime() + duration * 60000);

                    if (slotEnd > workEnd) break;

                    // CONFLICT CHECK
                    let hasConflict = false;

                    // 1. Break overlap
                    for (const brk of myBreaks) {
                        const [bH, bM] = brk.start_time.split(':').map(Number);
                        const bS = new Date(targetDate); bS.setHours(bH, bM, 0, 0);
                        const bE = new Date(bS.getTime() + brk.duration_minutes * 60000);
                        if (slotStart < bE && slotEnd > bS) { hasConflict = true; break; }
                    }
                    if (hasConflict) { scanPointer.setMinutes(scanPointer.getMinutes() + 15); continue; }

                    // 2. Appointment + Buffer overlap
                    for (const apt of myApts) {
                        const aS = new Date(apt.scheduled_start);
                        const aE = new Date(aS.getTime() + apt.duration_minutes * 60000);
                        const aE_buffered = new Date(aE.getTime() + bufferMin * 60000);
                        const slotEnd_buffered = new Date(slotEnd.getTime() + bufferMin * 60000);

                        // Intersection test: [start, end+buffer]
                        if (slotStart < aE_buffered && slotEnd_buffered > aS) { hasConflict = true; break; }
                    }

                    if (!hasConflict) {
                        // SUCCESS: Found a gap. Book it.
                        const client = myClients[Math.floor(Math.random() * myClients.length)];

                        const { error } = await supabase.from('appointments').insert({
                            business_id: businessId,
                            assigned_profile_id: provider.id,
                            client_id: client.id,
                            treatment_name: service.name,
                            treatment_id: service.id,
                            required_skills: service.required_skills || [],
                            duration_minutes: duration,
                            scheduled_start: slotStart.toISOString(),
                            status: 'pending',
                            notes: `🤖 Manual Op (Pulse) for ${provider.full_name}`,
                            cost: service.cost
                        });

                        if (!error) {
                            console.log(`✅ SEQUENTIAL BOOKING: ${service.name} for ${provider.full_name} at ${slotStart.toLocaleString()}`);
                            return; // Success! Exit until next pulse.
                        } else {
                            console.error('❌ Booking failed:', error);
                            return;
                        }
                    }

                    // Move pointer by 15 mins and try again
                    scanPointer.setMinutes(scanPointer.getMinutes() + 15);
                }
            }
        }

        console.log('🏁 Demo Bot: 14-day schedule for P1-P4 is completely FULL.');
    } catch (err) {
        console.error('Demo Bot Error:', err);
    }
};
