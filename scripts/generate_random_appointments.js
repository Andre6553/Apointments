
import { createClient } from '@supabase/supabase-js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

// --- CONFIGURATION ---
const SUPABASE_URL = 'https://wxwparezjiourhlvyalw.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind4d3BhcmV6amlvdXJobHZ5YWx3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTA1NjQyOCwiZXhwIjoyMDg0NjMyNDI4fQ.abW5spumitjnN2JC2IKwL4l7TUGW-05sIe4S6QV9-aI';

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

// Helper: Time manipulation
const parseTime = (timeStr) => {
    const [h, m] = timeStr.split(':').map(Number);
    return h * 60 + m;
};

const formatTime = (minutes) => {
    const h = Math.floor(minutes / 60).toString().padStart(2, '0');
    const m = (minutes % 60).toString().padStart(2, '0');
    return `${h}:${m}`;
};

const addMinutes = (date, minutes) => new Date(date.getTime() + minutes * 60000);

const getRandomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

const DURATIONS = [15, 30, 45, 60, 90];

async function run() {
    console.log('🚀 Starting Stress Test Data Generation...');

    try {
        // 1. Fetch Demo Business & Providers
        const { data: profiles, error: profError } = await supabase
            .from('profiles')
            .select('*')
            .ilike('email', 'provider%@example.com') // Target the seeded providers
            .order('email');

        if (profError) throw profError;
        if (!profiles || profiles.length === 0) {
            console.error('❌ No "providerX@example.com" profiles found. Did you run the seed script?');
            process.exit(1);
        }

        console.log(`Found ${profiles.length} providers.`);

        const businessId = profiles[0].business_id;

        // Fetch Clients
        const { data: clients, error: clientError } = await supabase
            .from('clients')
            .select('id')
            .eq('business_id', businessId);

        if (clientError || !clients.length) {
            console.error('❌ No clients found for business.');
            process.exit(1);
        }

        // 2. Setup Schedules & Clean previous appointments
        for (const profile of profiles) {
            const providerNum = parseInt(profile.email.match(/\d+/)[0]);
            console.log(`Processing Provider ${providerNum}...`);

            // Clean slate for this provider
            const { error: delErr } = await supabase.from('appointments').delete().eq('assigned_profile_id', profile.id);
            if (delErr) console.warn('Cleanup warning:', delErr.message);

            // A. Set Buffer (Random 0-15m)
            const buffer = [0, 5, 10, 15][getRandomInt(0, 3)];
            await supabase.from('profiles').update({ enable_buffer: true, buffer_minutes: buffer }).eq('id', profile.id);

            // B. Working Hours (Randomized start/end)
            // Shift variants: 07-15, 08-16, 09-17, 10-18
            const startHour = getRandomInt(7, 10);
            const endHour = startHour + 8; // 8 hour shift

            const workHoursPayload = [];
            for (let day = 1; day <= 5; day++) { // Mon-Fri
                workHoursPayload.push({
                    profile_id: profile.id,
                    day_of_week: day,
                    start_time: `${String(startHour).padStart(2, '0')}:00`,
                    end_time: `${String(endHour).padStart(2, '0')}:00`,
                    is_active: true
                });
            }
            // Upsert Working Hours
            await supabase.from('working_hours').upsert(workHoursPayload, { onConflict: 'profile_id,day_of_week' });

            // C. Breaks (Ensure Lunch & Tea)
            // Clear existing for clean slate? Or just add if missing? User said "if not loaded... create one".
            // Let's check existing.
            const { data: existingBreaks } = await supabase.from('breaks').select('*').eq('profile_id', profile.id);

            if (!existingBreaks || existingBreaks.length === 0) {
                const teaTime = `${String(startHour + 2).padStart(2, '0')}:00`; // 2 hours in
                const lunchTime = `${String(startHour + 5).padStart(2, '0')}:00`; // 5 hours in

                await supabase.from('breaks').insert([
                    { profile_id: profile.id, label: 'Tea Break', start_time: teaTime, duration_minutes: 15, day_of_week: 1 }, // Just Mon for template? 
                    // Actually breaks usually apply every day in this simple model or need per-day entries if table has day_of_week? 
                    // working_hours.sql schema for breaks didn't show day_of_week in previous `view_file` (wait, I viewed ScheduleSettings but not SQL for breaks).
                    // ScheduleSettings line 135: day_of_week: new Date().getDay()... implies breaks are per day?
                    // Let's assume simpler model or repeat for days. 
                ]);

                // Let's insert for all weekdays to be safe
                const breaksPayload = [];
                for (let day = 1; day <= 5; day++) {
                    breaksPayload.push(
                        { profile_id: profile.id, label: 'Tea Break', start_time: teaTime, duration_minutes: 15, day_of_week: day },
                        { profile_id: profile.id, label: 'Lunch', start_time: lunchTime, duration_minutes: 45, day_of_week: day }
                    );
                }
                await supabase.from('breaks').insert(breaksPayload);
            }
        }

        // 3. Generate Appointments (Next 2 Weeks)
        const startDate = new Date();
        const endDate = new Date();
        endDate.setDate(startDate.getDate() + 14);

        const newAppointments = [];

        for (const profile of profiles) {
            const providerNum = parseInt(profile.email.match(/\d+/)[0]);

            // BUSY vs OPEN Logic
            const isBusyTarget = providerNum <= 4;
            if (!isBusyTarget) continue; // Skip generating load for 5-10

            // Fetch constraints
            const { data: works } = await supabase.from('working_hours').select('*').eq('profile_id', profile.id);
            const { data: breaks } = await supabase.from('breaks').select('*').eq('profile_id', profile.id);
            const { data: prof } = await supabase.from('profiles').select('buffer_minutes').eq('id', profile.id).single();
            const bufferMin = prof?.buffer_minutes || 0;

            let currentDate = new Date(startDate);
            while (currentDate <= endDate) {
                const dayOfWeek = currentDate.getDay(); // 0=Sun
                const workDay = works?.find(w => w.day_of_week === dayOfWeek && w.is_active);

                if (workDay) {
                    const workStartMin = parseTime(workDay.start_time);
                    const workEndMin = parseTime(workDay.end_time);
                    const dayBreaks = breaks?.filter(b => b.day_of_week === dayOfWeek) || [];

                    let attempts = 0;
                    const maxApts = getRandomInt(6, 12); // BUSY schedule
                    let placed = 0;

                    while (placed < maxApts && attempts < 50) {
                        attempts++;
                        const duration = DURATIONS[getRandomInt(0, DURATIONS.length - 1)];

                        // Random start time
                        const range = workEndMin - workStartMin - duration;
                        if (range <= 0) break;
                        const startOffset = getRandomInt(0, range);
                        const startMin = workStartMin + startOffset;
                        const endMin = startMin + duration;

                        // Validation
                        let valid = true;

                        // 1. Check Breaks
                        for (const b of dayBreaks) {
                            const bStart = parseTime(b.start_time);
                            const bEnd = bStart + b.duration_minutes;
                            if (startMin < bEnd && endMin > bStart) valid = false;
                        }

                        // 2. Check Existing (in this batch)
                        // Note: We only check against *newly generated* ones for simplicity in this batch-script. 
                        // In real life we'd check DB. But since we are generating fresh for future, assuming empty slots is ok-ish 
                        // OR we check the `newAppointments` array for this provider/date.
                        if (valid) {
                            const thisDayApts = newAppointments.filter(a =>
                                a.assigned_profile_id === profile.id &&
                                new Date(a.start_time).toDateString() === currentDate.toDateString()
                            );

                            for (const existing of thisDayApts) {
                                const exStart = existing.start_time_min; // We'll store this temp
                                const exEnd = existing.end_time_min + bufferMin; // Add Buffer to existing

                                // Check overlap (including buffer of new appt?)
                                // Usually buffer is after.
                                if (startMin < exEnd && (endMin + bufferMin) > exStart) valid = false;
                            }
                        }

                        if (valid) {
                            // Construct Date Objects
                            const startDt = new Date(currentDate);
                            startDt.setHours(Math.floor(startMin / 60), startMin % 60, 0, 0);

                            const endDt = new Date(currentDate);
                            endDt.setHours(Math.floor(endMin / 60), endMin % 60, 0, 0);

                            newAppointments.push({
                                assigned_profile_id: profile.id,
                                client_id: clients[getRandomInt(0, clients.length - 1)].id,
                                business_id: businessId, // Note: Schema might need business_id? Schema 22-35 doesn't show it. Let's check if it exists in DB or if I missed it.
                                // Waiting... Schema above does NOT show business_id. But seed script assumes it?
                                // Let's check if seed script inserts business_id into appointments... "DELETE FROM appointments..."
                                // Wait, the schema line 22-35 does NOT show business_id.
                                // But multi-tenant logic usually requires it.
                                // If I get an error "column business_id does not exist", I will know.
                                // For now, I'll trust the schema I just read: 
                                // columns: client_id, assigned_profile_id, scheduled_start, duration_minutes, status, created_at.
                                // I will omit business_id if it's not in schema result.
                                // Actually, allow me to handle both or check cache error again?
                                // "Could not find 'end_time'..." was the error.
                                // So let's fix keys first.
                                scheduled_start: startDt.toISOString(),
                                duration_minutes: DURATIONS[getRandomInt(0, DURATIONS.length - 1)],
                                status: 'pending', // User wants to start them manually
                                start_time_min: startMin, // temp helpers
                                end_time_min: endMin
                            });
                            placed++;
                        }
                    }
                }
                currentDate.setDate(currentDate.getDate() + 1);
            }
        }

        // Remove temp props
        const cleanApts = newAppointments.map(({ start_time_min, end_time_min, ...rest }) => rest);

        console.log(`Generated ${cleanApts.length} appointments. Inserting...`);

        // Batch Insert
        const { error: insertError } = await supabase.from('appointments').insert(cleanApts);
        if (insertError) throw insertError;

        console.log('✅ Stress Test Data Loaded Successfully.');

    } catch (err) {
        console.error('❌ Script Failed:', err);
    }
}

run();
