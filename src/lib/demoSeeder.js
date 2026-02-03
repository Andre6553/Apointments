
import { supabase } from './supabase'
import { logEvent, logAppointment } from './logger'

/**
 * Medical Demo Seeder & Stress Tester
 * Simulates a busy clinic environment by injecting live appointments.
 */

// --- CONFIGURATION ---
export const DOCTORS = [
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

// --- REMOTE STATE SYNC (Replaces LocalStorage) ---

export const getDemoStatus = async (businessId) => {
    if (!businessId) return false;
    const { data } = await supabase
        .from('business_settings')
        .select('demo_mode_enabled')
        .eq('business_id', businessId)
        .maybeSingle(); // Use maybeSingle to avoid 406 errors if row missing
    return data?.demo_mode_enabled || false;
};

export const setDemoStatus = async (businessId, isEnabled) => {
    if (!businessId) return;

    // Upsert to handle first-time creation
    const { error } = await supabase
        .from('business_settings')
        .upsert({
            business_id: businessId,
            demo_mode_enabled: isEnabled,
            updated_at: new Date().toISOString()
        });

    if (error) console.error('[DemoSync] Failed to update remote state:', error);
};

/**
 * Seeds ONLY the global business skills if they don't exist yet (for Demo Mode)
 */
export const seedBusinessSkills = async (businessId) => {
    console.log('[Demo] Ensuring global business skills exist...');

    // Check if we already have skills
    const { count } = await supabase
        .from('business_skills')
        .select('*', { count: 'exact', head: true })
        .eq('business_id', businessId);

    if (count > 0) {
        console.log('[Demo] Skills already exist, skipping auto-seed.');
        return;
    }

    const businessSkills = DOCTORS.reduce((acc, doc) => {
        doc.skills.forEach(skill => {
            if (!acc.find(s => s.code === skill.code)) {
                acc.push({
                    business_id: businessId,
                    name: skill.label,
                    code: skill.code
                });
            }
        });
        return acc;
    }, []);

    const { error } = await supabase.from('business_skills').insert(businessSkills);
    if (error) console.error('❌ FAILED to auto-seed business skills:', error);
    else console.log(`✅ ${businessSkills.length} business skills auto-seeded.`);
};

/**
 * Wipes appointments and resets providers to Medical Demo state.
 * Does NOT bulk seed appointments anymore.
 */
export const initializeMedicalDemo = async (businessId) => {
    console.log('🏥 Initializing Medical Demo...');

    // 1. Wipe Data (Hard Delete) with Logging
    console.log(`[Demo] Wiping data for business: ${businessId}...`);
    logEvent('DEMO_DATA_WIPE', { businessId, timestamp: new Date().toISOString() });

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

    // 2.5 Seed Global Business Skills
    console.log('[Demo] Seeding global business skills...');
    const businessSkills = DOCTORS.reduce((acc, doc) => {
        doc.skills.forEach(skill => {
            if (!acc.find(s => s.code === skill.code)) {
                acc.push({
                    business_id: businessId,
                    name: skill.label,
                    code: skill.code
                });
            }
        });
        return acc;
    }, []);

    // Wipe old business skills first
    await supabase.from('business_skills').delete().eq('business_id', businessId);

    const { error: skillError } = await supabase.from('business_skills').insert(businessSkills);
    if (skillError) {
        console.error('❌ FAILED to seed business skills:', skillError);
    } else {
        console.log(`✅ ${businessSkills.length} business skills seeded.`);
    }

    // 3. Update Providers (Name & Skills)
    for (let i = 0; i < providers.length; i++) {
        if (!DOCTORS[i]) break;

        await supabase
            .from('profiles')
            .update({
                full_name: DOCTORS[i].name,
                skills: DOCTORS[i].skills.map(s => s.code),
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
                    end_time: '23:59:59',
                    is_active: true
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
    // 6. Create Dummy Clients (10 per provider for testing)
    console.log('[Demo] Generating 100 unique real clients (10 per provider)...');

    const REAL_FIRST_NAMES = [
        "Liam", "Noah", "Oliver", "James", "Elijah", "William", "Henry", "Lucas", "Benjamin", "Theodore",
        "Mateo", "Levi", "Sebastian", "Daniel", "Jack", "Wyatt", "Owen", "Asher", "Christopher", "Julian",
        "Hudson", "Thomas", "Charles", "Caleb", "Isaac", "Ryan", "Nathan", "Adrian", "Miles", "Eli",
        "Nolan", "Christian", "Aaron", "Cameron", "Ezekiel", "Colton", "Luca", "Landon", "Hunter", "Jonathan",
        "Santiago", "Axel", "Easton", "Cooper", "Jeremiah", "Angel", "Roman", "Connor", "Jameson", "Robert",
        "Emma", "Olivia", "Charlotte", "Amelia", "Sophia", "Mia", "Isabella", "Ava", "Evelyn", "Luna",
        "Harper", "Sofia", "Gianna", "Eleanor", "Ella", "Abigail", "Hazel", "Nora", "Chloe", "Layla",
        "Lily", "Aria", "Zoey", "Penelope", "Hannah", "Maya", "Scarlett", "Stella", "Victoria", "Aurora",
        "Savannah", "Willow", "Hazel", "Violet", "Alice", "Lucy", "Grace", "Ivy", "Audrey", "Claire",
        "Anna", "Caroline", "Ruby", "Sophie", "Sarah", "Eleanor", "Cora", "Genesis", "Eliana", "Adeline"
    ];

    const dummyClients = [];
    let nameIdx = 0;

    providers.forEach((provider, pIdx) => {
        const providerNum = pIdx + 1;
        // Use Doctor's surname for the group (e.g., P1-House, P2-Grey)
        const docNameParts = provider.full_name.split(' ');
        const docSurname = docNameParts[docNameParts.length - 1];
        const groupSurname = `P${providerNum}-${docSurname}`;

        for (let i = 1; i <= 10; i++) {
            if (nameIdx >= REAL_FIRST_NAMES.length) break;

            dummyClients.push({
                first_name: REAL_FIRST_NAMES[nameIdx],
                last_name: groupSurname,
                phone: '+27761963997', // Constant for messaging tests
                business_id: businessId,
                owner_id: provider.id,
                whatsapp_opt_in: Math.random() < 0.8 // 80% opt-in rate
            });
            nameIdx++;
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
    // SECURITY: Prevent Demo Seeder from running on non-local environments
    // This safeguards against accidental "Demo Mode" activation on the Live URL
    // corrupting the production database (since they share the same Supabase instance).
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    if (!isLocal) {
        if (getDemoStatus()) console.warn('[DemoSeeder] ABORTED: Demo Mode is active but disabled on non-local environment for safety.');
        return;
    }

    try {
        // 0. Identity Verification (Strict Isolation)
        const { data: { user } } = await supabase.auth.getUser();
        if (user?.email !== 'admin@demo.com') {
            console.warn('[DemoSeeder] ABORTED: Demo Mode only runs on admin@demo.com');
            return;
        }

        // 0.5 Check Remote Status
        const isEnabled = await getDemoStatus(businessId);
        if (!isEnabled) {
            // console.log('[DemoSeeder] Pulse Skipped: Demo Mode Disabled Globally'); 
            return;
        }

        // 1. Context Collection

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

        const pulseId = crypto.randomUUID();
        await logEvent('seeder.pulse.start', { business_id: businessId, target_provider_count: pIds.length }, {
            level: 'INFO',
            trace_id: pulseId,
            module: 'DemoSeeder'
        });

        // 2. The Search Matrix (Day -> Sorted Providers -> Slot)
        for (let d = 0; d < 14; d++) {
            const targetDate = new Date(now);
            targetDate.setDate(now.getDate() + d);
            const dayOfWeek = targetDate.getDay();
            const dateStr = targetDate.toDateString();

            // ADAPTIVE: Sort providers by load before each day search
            const sortedProviders = [...targetProviders].sort((a, b) => {
                const loadA = (allApts || []).filter(apt => apt.assigned_profile_id === a.id && new Date(apt.scheduled_start).toDateString() === dateStr).length;
                const loadB = (allApts || []).filter(apt => apt.assigned_profile_id === b.id && new Date(apt.scheduled_start).toDateString() === dateStr).length;
                return loadA - loadB;
            });

            for (const provider of sortedProviders) {
                try {
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

                    const bufferMin = (provider.enable_buffer ? (provider.buffer_minutes || 0) : 0);

                    // --- ADAPTIVE v2: INTERVAL-BASED GAP SEARCH ---
                    const decisionStart = performance.now();

                    // 1. Build "Occupied" Intervals [start, end]
                    const occupied = [];

                    // A. Breaks
                    myBreaks.forEach(brk => {
                        const [bH, bM] = brk.start_time.split(':').map(Number);
                        const bS = new Date(targetDate); bS.setHours(bH, bM, 0, 0);
                        const bE = new Date(bS.getTime() + brk.duration_minutes * 60000);
                        occupied.push({ start: bS, end: bE, type: 'break' });
                    });

                    // B. Existing Appointments (including buffer)
                    myApts.forEach(apt => {
                        const aS = new Date(apt.scheduled_start);
                        const aE = new Date(aS.getTime() + apt.duration_minutes * 60000);
                        const aE_buffered = new Date(aE.getTime() + bufferMin * 60000);
                        occupied.push({ start: aS, end: aE_buffered, type: 'apt' });
                    });

                    // C. Constraints from "Now" (don't book in past)
                    if (d === 0) {
                        const lockout = new Date(now);
                        lockout.setMinutes(lockout.getMinutes() + 10); // 10m minimum lead time
                        const dayStart = new Date(targetDate);
                        dayStart.setHours(0, 0, 0, 0);
                        occupied.push({ start: dayStart, end: lockout, type: 'past' });
                    }

                    // D. Staggered Start Logic (Add a virtual occupied slot at the morning start)
                    const staggerMinutes = Math.floor(Math.random() * 4) * 15;
                    if (staggerMinutes > 0) {
                        const sStart = new Date(targetDate); sStart.setHours(hS, mS, 0, 0);
                        const sEnd = new Date(sStart.getTime() + staggerMinutes * 60000);
                        occupied.push({ start: sStart, end: sEnd, type: 'stagger' });
                    }

                    // E. Sort by start time
                    occupied.sort((a, b) => a.start - b.start);

                    // F. Merge overlapping intervals
                    const merged = [];
                    if (occupied.length > 0) {
                        let current = { ...occupied[0] };
                        for (let i = 1; i < occupied.length; i++) {
                            if (occupied[i].start < current.end) {
                                current.end = new Date(Math.max(current.end, occupied[i].end));
                            } else {
                                merged.push(current);
                                current = { ...occupied[i] };
                            }
                        }
                        merged.push(current);
                    }

                    // 2. Find Gaps in merged intervals
                    const gaps = [];
                    let lastEnd = new Date(targetDate); lastEnd.setHours(hS, mS, 0, 0);
                    const workEnd = new Date(targetDate); workEnd.setHours(hE, mE, 0, 0);

                    merged.forEach(interval => {
                        if (interval.start > lastEnd) {
                            gaps.push({ start: new Date(lastEnd), end: new Date(interval.start) });
                        }
                        lastEnd = new Date(Math.max(lastEnd, interval.end));
                    });

                    if (lastEnd < workEnd) {
                        gaps.push({ start: new Date(lastEnd), end: new Date(workEnd) });
                    }

                    // 3. Pick a Gap and Book
                    // Filter gaps by minimum duration required (random service from qualified list)
                    const service = qualifiedTreatments[Math.floor(Math.random() * qualifiedTreatments.length)];
                    const duration = service.duration_minutes || 30;
                    const requiredSize = (duration + bufferMin) * 60000;

                    const validGaps = gaps.filter(g => (g.end - g.start) >= requiredSize);

                    if (validGaps.length > 0) {
                        // Strategy: 70% chance earliest slot, 30% chance random valid slot (to look human)
                        const chosenGap = Math.random() < 0.7 ? validGaps[0] : validGaps[Math.floor(Math.random() * validGaps.length)];
                        const slotStart = chosenGap.start;
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
                            notes: `🤖 Adaptive v2 (Index) for ${provider.full_name}`,
                            cost: service.cost
                        });

                        if (!error) {
                            const totalMs = Math.round(performance.now() - decisionStart);
                            console.log(`✅ ADAPTIVE v2 BOOKING: ${service.name} for ${provider.full_name} at ${slotStart.toLocaleString()}`);

                            await logAppointment({
                                id: 'automated',
                                scheduled_start: slotStart.toISOString(),
                                duration_minutes: duration,
                                treatment_name: service.name
                            }, provider, client, null, 'CREATE', {
                                total_ms: totalMs,
                                collision_retries: 0, // NO COLLISIONS in v2
                                trace_id: pulseId
                            });

                            await logEvent('seeder.selection.success', {
                                business_id: businessId,
                                provider_id: provider.id,
                                attempts: 0,
                                slot_start: slotStart.toISOString()
                            }, {
                                level: 'DEBUG',
                                trace_id: pulseId,
                                parent_id: pulseId,
                                metrics: {
                                    collision_retries: 0,
                                    decision_ms: totalMs
                                },
                                context: { strategy: 'index_gap_search' }
                            });

                            return;
                        }
                    } else {
                        // No valid gaps for this provider-day
                        await logEvent('seeder.selection.fail', {
                            business_id: businessId,
                            provider_id: provider.id,
                            reason: 'PROVIDER_SATURATED',
                            attempts: 0
                        }, {
                            level: 'DEBUG',
                            trace_id: pulseId,
                            metrics: { collision_retries: 0 },
                            context: { strategy: 'index_gap_search' }
                        });
                        // Continue to next provider/day
                    }
                } catch (loopErr) {
                    console.error('[DemoSeeder] Loop Error:', loopErr);
                    await logEvent('seeder.loop.error', {
                        business_id: businessId,
                        error: loopErr.message,
                        provider_id: provider.id,
                        day: d
                    }, {
                        level: 'ERROR',
                        trace_id: pulseId
                    });
                }
            }
        }

        console.log('🏁 [DemoSeeder] Pulse Complete.');
    } catch (err) {
        console.error('Demo Bot Error:', err);
    }
};
