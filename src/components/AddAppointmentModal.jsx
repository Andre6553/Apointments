import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { X, Calendar, Clock, User, MessageCircle, ArrowRight, Loader2, Timer, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { format, isSameDay } from 'date-fns';
import { useAuth } from '../hooks/useAuth';
import { getCache, setCache, CACHE_KEYS } from '../lib/cache';
import { sendWhatsApp } from '../lib/notifications';
import { logAppointment } from '../lib/logger';

const AddAppointmentModal = ({ isOpen, onClose, onRefresh, editData = null, initialData = null }) => {
    const { user, profile } = useAuth();
    const [clients, setClients] = useState([]);
    const [formData, setFormData] = useState({
        clientId: '',
        date: format(new Date(), 'yyyy-MM-dd'),
        time: '09:00',
        duration: 30,
        notes: '',
        treatmentId: '',
        treatmentName: '',
        cost: 0
    });
    const [treatments, setTreatments] = useState([]);
    const [fetchingTreatments, setFetchingTreatments] = useState(false);
    const [loading, setLoading] = useState(false);
    const [fetchingClients, setFetchingClients] = useState(false);
    const [slotStatus, setSlotStatus] = useState({ type: 'idle', message: '', suggestion: null });
    const [providerData, setProviderData] = useState({ hours: null, breaks: [] });
    const [isFetchingProviderBase, setIsFetchingProviderBase] = useState(false);
    const [suggestedSlots, setSuggestedSlots] = useState([]);
    const [searchingSlots, setSearchingSlots] = useState(false);
    const [providers, setProviders] = useState([]);
    const [targetProviderId, setTargetProviderId] = useState(null);
    const [targetProviderSkills, setTargetProviderSkills] = useState([]);
    const isAdmin = profile?.role?.toLowerCase() === 'admin' || profile?.role?.toLowerCase() === 'manager' || profile?.role?.toLowerCase() === 'owner';
    const [providerAvailability, setProviderAvailability] = useState({});
    const [calculatingAvailability, setCalculatingAvailability] = useState(false);

    const qualifiedProviders = useMemo(() => {
        const req = formData.requiredSkills || [];
        if (req.length === 0) return providers;

        return providers.filter(p => {
            const pSkillsRaw = Array.isArray(p.skills) ? p.skills : [];
            const pCodes = pSkillsRaw.map(s => (typeof s === 'object' ? s.code : s).toUpperCase());
            return req.every(r => pCodes.includes(r.toUpperCase()));
        });
    }, [providers, formData.requiredSkills]);

    const sortedQualifiedProviders = useMemo(() => {
        return [...qualifiedProviders].sort((a, b) => {
            const timeA = providerAvailability[a.id] || '23:59';
            const timeB = providerAvailability[b.id] || '23:59';
            return timeA.localeCompare(timeB);
        });
    }, [qualifiedProviders, providerAvailability]);

    useEffect(() => {
        if (isOpen) {
            fetchClients();
            fetchTreatments();
            setSuggestedSlots([]);
            if (editData) {
                setTargetProviderId(editData.assigned_profile_id);
                setFormData({
                    clientId: editData.client_id || editData.clientId || editData.client?.id,
                    date: format(new Date(editData.scheduled_start), 'yyyy-MM-dd'),
                    time: format(new Date(editData.scheduled_start), 'HH:mm'),
                    duration: editData.duration_minutes,
                    notes: editData.notes || '',
                    treatmentId: editData.treatment_id || '',
                    treatmentName: editData.treatment_name || '',
                    cost: editData.cost || 0,
                    requiredSkills: editData.required_skills || []
                });
            } else {
                setTargetProviderId(user?.id);

                // Pre-fill from shared data if available
                let initialNotes = '';
                if (initialData) {
                    const parts = [];
                    if (initialData.title) parts.push(`Title: ${initialData.title}`);
                    if (initialData.text) parts.push(`Shared: ${initialData.text}`);
                    if (initialData.url) parts.push(`Link: ${initialData.url}`);
                    initialNotes = parts.join('\n');
                }

                setFormData({
                    clientId: '',
                    date: format(new Date(), 'yyyy-MM-dd'),
                    time: '09:00',
                    duration: 30,
                    notes: initialNotes,
                    treatmentId: '',
                    treatmentName: '',
                    cost: 0
                });
            }
        }
    }, [isOpen, editData, initialData, profile?.business_id]);

    useEffect(() => {
        if (isOpen && profile?.business_id && isAdmin) {
            fetchProviders();
        }
    }, [isOpen, profile?.business_id]);

    const fetchProviders = async () => {
        const { data } = await supabase
            .from('profiles')
            .select('id, full_name, whatsapp, skills, is_online')
            .eq('business_id', profile.business_id)
            .in('role', ['Provider', 'Admin', 'Manager', 'Owner']);
        if (data) setProviders(data);
    };

    useEffect(() => {
        if (isOpen && targetProviderId) {
            fetchProviderBaseData();
            fetchTargetProviderSkills();
            fetchTreatments(); // Fetch provider-specific treatments with their pricing
        }
    }, [isOpen, targetProviderId, formData.date, profile?.business_id]);

    useEffect(() => {
        if (isOpen && qualifiedProviders.length > 0 && formData.date && formData.duration) {
            calculateProvidersAvailability();
        }
    }, [isOpen, qualifiedProviders, formData.date, formData.duration]);

    const calculateProvidersAvailability = async () => {
        setCalculatingAvailability(true);
        try {
            const pIds = qualifiedProviders.map(p => p.id);
            const [y, m, d] = formData.date.split('-').map(Number);
            const dayOfWeek = new Date(y, m - 1, d).getDay();

            // Bulk fetch for all qualified providers
            const [hoursRes, breaksRes, aptsRes] = await Promise.all([
                supabase.from('working_hours').select('*').in('profile_id', pIds).eq('day_of_week', dayOfWeek).eq('is_active', true),
                supabase.from('breaks').select('*').in('profile_id', pIds).eq('day_of_week', dayOfWeek),
                supabase.from('appointments')
                    .select('assigned_profile_id, scheduled_start, duration_minutes')
                    .in('assigned_profile_id', pIds)
                    .in('status', ['pending', 'active', 'completed'])
                    .gte('scheduled_start', `${formData.date}T00:00:00`)
                    .lte('scheduled_start', `${formData.date}T23:59:59`)
            ]);

            const availMap = {};
            const duration = parseInt(formData.duration) || 30;

            for (const provider of qualifiedProviders) {
                const hours = (hoursRes.data || []).find(h => h.profile_id === provider.id);
                if (!hours) {
                    availMap[provider.id] = 'Closed';
                    continue;
                }

                const breaks = (breaksRes.data || []).filter(b => b.profile_id === provider.id);
                const dayApts = (aptsRes.data || []).filter(apt => apt.assigned_profile_id === provider.id);

                const [hS, mS] = hours.start_time.split(':').map(Number);
                const [hE, mE] = hours.end_time.split(':').map(Number);
                let candidate = new Date(y, m - 1, d, hS, mS);
                const limit = new Date(y, m - 1, d, hE, mE);
                const now = new Date();

                if (isSameDay(candidate, now)) {
                    const bufferedNow = new Date(now.getTime() + 15 * 60000);
                    if (bufferedNow > candidate) candidate = new Date(Math.ceil(bufferedNow.getTime() / (15 * 60000)) * (15 * 60000));
                }

                let soonest = 'None';
                while (candidate.getTime() + duration * 60000 <= limit.getTime()) {
                    const cStart = candidate;
                    const cEnd = new Date(cStart.getTime() + duration * 60000);

                    const overlapBreak = breaks.find(brk => {
                        const [bh, bm] = brk.start_time.split(':').map(Number);
                        const bS = new Date(y, m - 1, d, bh, bm);
                        const bE = new Date(bS.getTime() + brk.duration_minutes * 60000);
                        return cStart < bE && cEnd > bS;
                    });
                    if (overlapBreak) {
                        const [bh, bm] = overlapBreak.start_time.split(':').map(Number);
                        const bE = new Date(new Date(y, m - 1, d, bh, bm).getTime() + overlapBreak.duration_minutes * 60000);
                        candidate = new Date(Math.ceil(bE.getTime() / (5 * 60000)) * (5 * 60000));
                        continue;
                    }

                    const overlapApt = dayApts.find(apt => {
                        const aS = new Date(apt.scheduled_start);
                        const aE = new Date(aS.getTime() + apt.duration_minutes * 60000);
                        return cStart < aE && cEnd > aS;
                    });
                    if (overlapApt) {
                        const aE = new Date(new Date(overlapApt.scheduled_start).getTime() + overlapApt.duration_minutes * 60000);
                        candidate = new Date(Math.ceil(aE.getTime() / (5 * 60000)) * (5 * 60000));
                        continue;
                    }

                    soonest = format(cStart, 'HH:mm');
                    break;
                }
                availMap[provider.id] = soonest;
            }
            setProviderAvailability(availMap);
        } catch (err) {
            console.error('Availability Calculation Error:', err);
        } finally {
            setCalculatingAvailability(false);
        }
    };

    useEffect(() => {
        // Auto-select best provider if current one is unqualified or not set
        if (isOpen && sortedQualifiedProviders.length > 0 && !calculatingAvailability) {
            const isQualified = sortedQualifiedProviders.some(p => p.id === targetProviderId);
            if (!targetProviderId || !isQualified) {
                // The first one in sorted list should be the best (soonest)
                const best = sortedQualifiedProviders.find(p => {
                    const avail = providerAvailability[p.id];
                    return avail && avail !== 'Closed' && avail !== 'None';
                }) || sortedQualifiedProviders[0];

                if (best && best.id !== targetProviderId) {
                    setTargetProviderId(best.id);
                }
            }
        }
    }, [isOpen, sortedQualifiedProviders, calculatingAvailability, targetProviderId]);

    const fetchTargetProviderSkills = async () => {
        if (!targetProviderId) return;
        const { data } = await supabase
            .from('profiles')
            .select('skills')
            .eq('id', targetProviderId)
            .single();
        if (data) {
            const raw = Array.isArray(data.skills) ? data.skills : [];
            const codes = raw.map(s => (typeof s === 'object' ? s.code : s));
            setTargetProviderSkills(codes);
        }
    };

    const findSlotsForDate = async (targetDate, duration, constraints) => {
        const { allHours, allBreaks, allApts } = constraints;
        const [y, m, d] = targetDate.split('-').map(Number);
        const dayOfWeek = new Date(y, m - 1, d).getDay();

        const hours = allHours.find(h => h.day_of_week === dayOfWeek);
        if (!hours || hours.is_active === false) return [];

        const breaks = allBreaks.filter(b => b.day_of_week === dayOfWeek);
        const dayApts = allApts.filter(apt => apt.scheduled_start.startsWith(targetDate));

        const slots = [];
        const [hS, mS] = hours.start_time.split(':').map(Number);
        const [hE, mE] = hours.end_time.split(':').map(Number);

        let searchStart = new Date(y, m - 1, d, hS, mS);
        const searchLimit = new Date(y, m - 1, d, hE, mE);
        const now = new Date();

        if (isSameDay(searchStart, now)) {
            const currentPlusBuffer = new Date(now.getTime() + 15 * 60000);
            if (currentPlusBuffer > searchStart) searchStart = currentPlusBuffer;
        }

        let candidate = new Date(Math.ceil(searchStart.getTime() / (5 * 60000)) * (5 * 60000));

        while (candidate.getTime() + duration * 60000 <= searchLimit.getTime()) {
            const cStart = candidate;
            const cEnd = new Date(cStart.getTime() + duration * 60000);

            let onBreak = false;
            for (const brk of breaks) {
                const [bh, bm] = brk.start_time.split(':').map(Number);
                const bS = new Date(y, m - 1, d, bh, bm);
                const bE = new Date(bS.getTime() + brk.duration_minutes * 60000);
                if (cStart < bE && cEnd > bS) { onBreak = true; candidate = bE; break; }
            }
            if (onBreak) continue;

            let overlapping = false;
            for (const apt of dayApts) {
                const aS = new Date(apt.scheduled_start);
                const aE = new Date(aS.getTime() + apt.duration_minutes * 60000);
                if (cStart < aE && cEnd > aS) { overlapping = true; candidate = aE; break; }
            }
            if (overlapping) continue;

            slots.push({
                date: targetDate,
                time: format(cStart, 'HH:mm'),
                label: format(cStart, 'HH:mm')
            });

            if (slots.length >= 5) break;
            candidate = new Date(candidate.getTime() + 15 * 60000);
        }

        return slots;
    };

    const handleFindSoonest = async () => {
        // Skill Check First
        const requiredSkills = formData.requiredSkills || [];
        if (requiredSkills.length > 0) {
            const hasAllSkills = requiredSkills.every(req => targetProviderSkills.includes(req));
            if (!hasAllSkills) {
                alert(`Cannot search: the selected provider does not have the required skills (${requiredSkills.join(', ')}) for this treatment.`);
                return;
            }
        }

        setSearchingSlots(true);
        setSuggestedSlots([]);
        try {
            // Optimization: Fetch everything we need for the next 60 days in BULK
            const startDate = new Date();
            const endDate = new Date(); endDate.setDate(startDate.getDate() + 60);

            const [hoursRes, breaksRes, aptsRes] = await Promise.all([
                supabase.from('working_hours').select('*').eq('profile_id', targetProviderId).eq('is_active', true),
                supabase.from('breaks').select('*').eq('profile_id', targetProviderId),
                supabase.from('appointments')
                    .select('scheduled_start, duration_minutes')
                    .eq('assigned_profile_id', targetProviderId)
                    .in('status', ['pending', 'active', 'completed'])
                    .gte('scheduled_start', startDate.toISOString())
                    .lte('scheduled_start', endDate.toISOString())
            ]);

            const constraints = {
                allHours: hoursRes.data || [],
                allBreaks: breaksRes.data || [],
                allApts: aptsRes.data || []
            };

            let found = [];
            let checkDate = new Date();

            for (let i = 0; i < 60; i++) {
                const dateStr = format(checkDate, 'yyyy-MM-dd');
                const daySlots = await findSlotsForDate(dateStr, formData.duration, constraints);
                found = [...found, ...daySlots];
                if (found.length >= 5) break;
                checkDate.setDate(checkDate.getDate() + 1);
            }

            setSuggestedSlots(found.slice(0, 5));
            if (found.length === 0) {
                alert('No available slots found in the next 60 days.');
            }
        } catch (err) {
            console.error('Find soonest failed:', err);
        } finally {
            setSearchingSlots(false);
        }
    };

    const fetchProviderBaseData = async () => {
        if (!targetProviderId || !formData.date) return;
        setIsFetchingProviderBase(true);

        try {
            const [y, m, d] = formData.date.split('-').map(Number);
            const dayOfWeek = new Date(y, m - 1, d).getDay();

            const [hoursRes, breaksRes] = await Promise.all([
                supabase.from('working_hours').select('*').eq('profile_id', targetProviderId).eq('day_of_week', dayOfWeek).maybeSingle(),
                supabase.from('breaks').select('*').eq('profile_id', targetProviderId).eq('day_of_week', dayOfWeek)
            ]);

            setProviderData({
                hours: hoursRes.data || null,
                breaks: breaksRes.data || []
            });
        } catch (err) {
            console.error(`Failed to fetch provider base data:`, err);
        } finally {
            setIsFetchingProviderBase(false);
        }
    };

    // Clear stale status when provider changes
    useEffect(() => {
        if (isOpen && isAdmin) {
            setSlotStatus({ type: 'idle', message: '' });
            setProviderData({ hours: null, breaks: [] });
            setTargetProviderSkills([]);
        }
    }, [targetProviderId]);

    useEffect(() => {
        let isCurrent = true;
        const timer = setTimeout(async () => {
            if (isOpen && formData.date && formData.time && isCurrent) {
                await checkConflicts(isCurrent);
            }
        }, 250); // Slightly longer debounce to allow data fetching to catch up

        return () => {
            isCurrent = false;
            clearTimeout(timer);
        };
    }, [formData.date, formData.time, formData.duration, formData.clientId, formData.treatmentId, formData.requiredSkills, targetProviderId, providerData, targetProviderSkills, isOpen]);

    const checkConflicts = async (isCurrent) => {
        const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;
        if (!formData.date || !formData.time || !formData.duration || !timeRegex.test(formData.time)) {
            if (isCurrent) {
                setSlotStatus(formData.time && !timeRegex.test(formData.time)
                    ? { type: 'error', message: 'Time must be HH:mm' }
                    : { type: 'idle', message: '' });
            }
            return;
        }

        if (isCurrent) setSlotStatus({ type: 'checking', message: 'Checking availability...' });


        const findNextAvailableSlot = (baseStart, duration, dayData, existingApts, bufferData) => {
            const { hours, breaks } = dayData;

            // If explicitly deactivated, no slots available today
            if (hours?.is_active === false) {
                console.log('Suggestion failed: Provider is explicitly closed today');
                return null;
            }

            // Determine search limit (End of shift or end of day)
            let searchLimit;
            if (hours?.end_time) {
                const [hE, mE] = hours.end_time.split(':').map(Number);
                searchLimit = new Date(baseStart);
                searchLimit.setHours(hE, mE, 0, 0);
            } else {
                // Default to end of current day if no hours defined
                searchLimit = new Date(baseStart);
                searchLimit.setHours(23, 59, 59, 999);
            }

            // Don't search more than 12 hours ahead
            const maxSearch = new Date(baseStart.getTime() + 12 * 60 * 60 * 1000);
            if (searchLimit > maxSearch) searchLimit = maxSearch;

            console.log(`Searching for ${duration}m slot (+${bufferData?.minutes || 0}m buffer) between ${format(baseStart, 'HH:mm')} and ${format(searchLimit, 'HH:mm')}...`);

            let candidate = new Date(baseStart.getTime());
            const now = new Date();
            const bufferMs = (bufferData?.enabled ? bufferData.minutes : 0) * 60000;

            while (candidate < searchLimit) {
                candidate = new Date(candidate.getTime() + 5 * 60000); // Step by 5 min
                const cStart = candidate;
                const cEnd = new Date(cStart.getTime() + duration * 60000);
                const cEndWithBuffer = new Date(cEnd.getTime() + bufferMs);

                if (cStart < now) continue;
                if (cEndWithBuffer > searchLimit) break;

                // Check Breaks
                let onBreak = false;
                for (const brk of breaks || []) {
                    const [bH, bM] = brk.start_time.split(':').map(Number);
                    const bS = new Date(cStart); bS.setHours(bH, bM, 0, 0);
                    const bE = new Date(bS.getTime() + brk.duration_minutes * 60000);
                    if (cStart < bE && cEnd > bS) { onBreak = true; break; }
                }
                if (onBreak) continue;

                // Check Appointments
                let overlapping = false;
                for (const apt of existingApts) {
                    const aS = new Date(apt.scheduled_start);
                    // Standard overlap check with "inflated" existing appointment
                    // AND "inflated" candidate appointment
                    const aptDurationWithBuffer = apt.duration_minutes + (bufferData?.enabled ? bufferData.minutes : 0);
                    const aE_effective = new Date(aS.getTime() + aptDurationWithBuffer * 60000);

                    const myEndBuffered = new Date(cEnd.getTime() + bufferMs);

                    if (cStart < aE_effective && myEndBuffered > aS) { overlapping = true; break; }
                }
                if (overlapping) continue;

                console.log(`✅ Found available slot: ${format(cStart, 'HH:mm')}`);
                return format(cStart, 'HH:mm');
            }
            console.log('❌ No free slots found in the remaining time today.');
            return null;
        };

        try {
            if (!user || !isCurrent) return;

            // 0. Skill Validation Check (Instant)
            const requiredSkills = formData.requiredSkills || [];
            if (requiredSkills.length > 0 && targetProviderSkills.length > 0) {
                const hasAllSkills = requiredSkills.every(req => targetProviderSkills.includes(req));
                if (!hasAllSkills) {
                    setSlotStatus({
                        type: 'error',
                        message: `Provider lacks required skills (${requiredSkills.join(', ')})`,
                        suggestion: null
                    });
                    return;
                }
            }

            const [startHour, startMin] = formData.time.split(':').map(Number);
            const slotStart = new Date(formData.date);
            slotStart.setHours(startHour, startMin, 0, 0);
            const slotEnd = new Date(slotStart.getTime() + formData.duration * 60000);

            // Fetch existing appointments first so we have them for the suggestion logic
            let query = supabase
                .from('appointments')
                .select('scheduled_start, duration_minutes')
                .eq('assigned_profile_id', targetProviderId)
                .in('status', ['pending', 'active', 'completed'])
                .gte('scheduled_start', `${formData.date}T00:00:00`)
                .lte('scheduled_start', `${formData.date}T23:59:59`);

            if (editData?.id) {
                query = query.neq('id', editData.id);
            }

            const { data: existing, error: aptError } = await query;
            if (aptError) throw aptError;
            if (!isCurrent) return;

            // Define a helper to set error with suggestion
            const setErrorWithSuggestion = (msg) => {
                const suggestion = findNextAvailableSlot(slotStart, formData.duration, providerData, existing || []);
                setSlotStatus({ type: 'error', message: msg, suggestion });
            };

            // 0. Past Time Check (Instant)
            if (slotStart < new Date()) {
                setErrorWithSuggestion('This time slot has already passed');
                return;
            }

            // 1. Check working hours (Using cached data)
            const { hours } = providerData;
            if (hours) {
                if (hours.is_active === false) {
                    setSlotStatus({ type: 'error', message: 'You are marked as CLOSED', suggestion: null });
                    return;
                }
                if (hours.start_time && hours.end_time) {
                    const [hS, mS] = hours.start_time.split(':').map(Number);
                    const [hE, mE] = hours.end_time.split(':').map(Number);
                    const workS = new Date(formData.date); workS.setHours(hS, mS, 0, 0);
                    const workE = new Date(formData.date); workE.setHours(hE, mE, 0, 0);
                    if (slotStart < workS || slotEnd > workE) {
                        setErrorWithSuggestion(`Outside shift (${hours.start_time.slice(0, 5)}-${hours.end_time.slice(0, 5)})`);
                        return;
                    }
                }
            }

            // 2. Check Breaks (Using cached data)
            for (const brk of providerData.breaks) {
                const [bH, bM] = brk.start_time.split(':').map(Number);
                const bS = new Date(formData.date); bS.setHours(bH, bM, 0, 0);
                const bE = new Date(bS.getTime() + brk.duration_minutes * 60000);
                if (slotStart < bE && slotEnd > bS) {
                    setErrorWithSuggestion(`Conflict: ${brk.label}`);
                    return;
                }
            }

            // 3. Check Appointments (Buffer-aware)
            if (existing && existing.length > 0) {
                // Fetch buffer settings from profile (injected or fetched)
                const bufferMs = (profile?.enable_buffer ? (profile.buffer_minutes || 0) : 0) * 60000;

                for (const apt of existing) {
                    const aS = new Date(apt.scheduled_start);
                    const aE = new Date(aS.getTime() + apt.duration_minutes * 60000);

                    const aE_buffered = aE.getTime() + bufferMs;
                    const myE_buffered = slotEnd.getTime() + bufferMs;

                    // Buffer-aware overlap: any intersection of [S, E+Buffer] ranges
                    if (slotStart.getTime() < aE_buffered && myE_buffered > aS.getTime()) {
                        setErrorWithSuggestion('Slot already booked (includes buffer)');
                        return;
                    }
                }
            }

            setSlotStatus({ type: 'success', message: 'Time slot is available', suggestion: null });
        } catch (err) {
            console.error("Conflict check failed:", err);
            if (isCurrent) setSlotStatus({ type: 'error', message: 'Connection issue. Could not verify availability.' });
        }
    };

    const fetchClients = async () => {
        setFetchingClients(true);
        try {
            let query = supabase.from('clients').select('*').order('first_name');

            const { data, error } = await query;
            if (error) throw error;
            if (data) setClients(data);
        } catch (err) {
            console.error('Error fetching clients:', err);
        } finally {
            setFetchingClients(false);
        }
    };

    const fetchTreatments = async () => {
        if (!targetProviderId || !profile?.business_id) return;
        setFetchingTreatments(true);
        try {
            // 1. Fetch provider's specific skills and all business profiles (for role check)
            const [pRes, allProfilesRes] = await Promise.all([
                supabase.from('profiles').select('skills').eq('id', targetProviderId).single(),
                supabase.from('profiles').select('id, role').eq('business_id', profile.business_id)
            ]);

            const pSkillsArray = Array.isArray(pRes.data?.skills) ? pRes.data.skills : [];

            // MANDATORY RULE: If provider has no skills in their profile, show nothing
            if (pSkillsArray.length === 0) {
                setTreatments([]);
                return;
            }

            const roleMap = (allProfilesRes.data || []).reduce((acc, curr) => {
                acc[curr.id] = curr.role;
                return acc;
            }, {});

            // 2. Fetch ALL treatments for the entire business to find matching records
            const { data: allTreatments } = await supabase
                .from('treatments')
                .select('*')
                .eq('business_id', profile.business_id)
                .order('name');

            if (allTreatments) {
                // 3. Map the Profile Skills directly to Treatment objects
                const mapped = pSkillsArray.map(skillObj => {
                    const skillCode = (typeof skillObj === 'object' ? skillObj.code : skillObj).toUpperCase();

                    // Find treatments that match this skill code
                    const matches = allTreatments.filter(t => {
                        const reqSkills = Array.isArray(t.required_skills) ? t.required_skills.map(s => String(s).toUpperCase()) : [];
                        return reqSkills.includes(skillCode);
                    });

                    // Priority: 1. Assigned to me, 2. Global/Admin Template
                    const myMatch = matches.find(t => t.profile_id === targetProviderId);
                    const templateMatch = matches.find(t => !t.profile_id || roleMap[t.profile_id] === 'Admin');

                    const baseTreatment = myMatch || templateMatch;
                    if (!baseTreatment) return null;

                    // Merge settings from the profile skill object (duration, price)
                    return {
                        ...baseTreatment,
                        duration_minutes: skillObj.duration || baseTreatment.duration_minutes,
                        price: (skillObj.price !== undefined && skillObj.price !== null) ? skillObj.price : baseTreatment.price,
                        display_name: skillObj.label || baseTreatment.name
                    };
                }).filter(Boolean);

                // De-duplicate by name if necessary
                const uniqueByName = mapped.reduce((acc, curr) => {
                    const existing = acc.find(item => item.name.toLowerCase() === curr.name.toLowerCase());
                    if (!existing) {
                        acc.push(curr);
                    } else if (curr.profile_id === targetProviderId) {
                        const idx = acc.indexOf(existing);
                        acc[idx] = curr;
                    }
                    return acc;
                }, []);

                const finalTreatments = uniqueByName.sort((a, b) => (a.display_name || a.name).localeCompare(b.display_name || b.name));
                setTreatments(finalTreatments);

                // Auto-select match if we have a name but no ID (standard for Deferrals/Edits)
                if (editData && !formData.treatmentId && editData.treatment_name) {
                    const match = finalTreatments.find(t => t.name.toLowerCase() === editData.treatment_name.toLowerCase());
                    if (match) {
                        setFormData(prev => ({ ...prev, treatmentId: match.id, requiredSkills: match.required_skills || [] }));
                    }
                }
            }
        } catch (err) {
            console.error('Error fetching treatments:', err);
        } finally {
            setFetchingTreatments(false);
        }
    };

    const handleTreatmentChange = (treatmentId) => {
        if (!treatmentId) {
            setFormData({ ...formData, treatmentId: '', treatmentName: '', cost: 0 });
            return;
        }

        const selected = treatments.find(t => t.id === treatmentId);
        if (selected) {
            setFormData({
                ...formData,
                treatmentId: selected.id,
                treatmentName: selected.name,
                duration: selected.duration_minutes,
                cost: selected.cost,
                requiredSkills: selected.required_skills || []
            });
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        // 1. Check Target Provider Skills (Corrected from profile?.skills)
        const requiredSkills = formData.requiredSkills || [];

        if (requiredSkills.length > 0) {
            const hasAllSkills = requiredSkills.every(req => targetProviderSkills.includes(req));
            if (!hasAllSkills) {
                alert(`Cannot book: This provider does not have the required skills (${requiredSkills.join(', ')}) to perform this treatment.`);
                return;
            }
        }

        if (slotStatus.type === 'error') {
            alert('Cannot book: ' + slotStatus.message);
            return;
        }
        const totalStart = performance.now();
        setLoading(true);

        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error('You must be logged in to create an appointment.');

            // Instrument: Provider Load Before
            const { count: loadBefore } = await supabase
                .from('appointments')
                .select('*', { count: 'exact', head: true })
                .eq('assigned_profile_id', targetProviderId)
                .is('shifted_from_id', null); // only count original assignments

            const scheduledStart = new Date(`${formData.date}T${formData.time}:00`).toISOString();
            const appointmentData = {
                client_id: formData.clientId,
                assigned_profile_id: targetProviderId,
                scheduled_start: scheduledStart,
                duration_minutes: parseInt(formData.duration),
                notes: formData.notes,
                treatment_name: formData.treatmentName,
                treatment_id: formData.treatmentId || null,
                required_skills: formData.requiredSkills || [],
                cost: formData.cost,
                status: editData ? editData.status : 'pending'
            };

            const dbStart = performance.now();
            const { error, data: savedApt } = editData
                ? await supabase.from('appointments').update(appointmentData).eq('id', editData.id).select().single()
                : await supabase.from('appointments').insert([appointmentData]).select().single();
            const dbMs = Math.round(performance.now() - dbStart);

            if (error) throw error;

            // --- Audit Logging ---
            try {
                const targetProv = providers.find(p => p.id === targetProviderId) || profile;
                const targetClient = clients.find(c => c.id === formData.clientId);
                await logAppointment(
                    { ...appointmentData, id: savedApt?.id || editData?.id },
                    targetProv,
                    targetClient,
                    profile,
                    editData ? 'UPDATE' : 'CREATE',
                    {
                        db_ms: dbMs,
                        total_ms: Math.round(performance.now() - totalStart),
                        load: { before: loadBefore, after: (loadBefore || 0) + 1 }
                    }
                );
            } catch (logErr) {
                console.warn('Logging failed:', logErr);
            }

            // Detect Changes for Notifications
            const isReschedule = editData && (editData.scheduled_start !== scheduledStart);
            const isReassign = editData && (editData.assigned_profile_id !== targetProviderId);

            // Handle Notifications on Update
            if (editData && (isReschedule || isReassign)) {
                try {
                    const client = clients.find(c => c.id === formData.clientId);
                    const newProvider = providers.find(p => p.id === targetProviderId);

                    if (client) {
                        const dateLabel = format(new Date(scheduledStart), 'EEEE, MMM do');
                        const timeLabel = format(new Date(scheduledStart), 'HH:mm');
                        const bizName = profile?.business_name || "the clinic";

                        let clientMsg = `Hi ${client.first_name}, this is ${bizName}. `;
                        if (isReschedule && isReassign) {
                            clientMsg += `Your appointment for ${formData.treatmentName} has been updated. It is now on ${dateLabel} at ${timeLabel} with ${newProvider?.full_name || 'a new provider'}.`;
                        } else if (isReschedule) {
                            clientMsg += `Your appointment for ${formData.treatmentName} has been rescheduled to ${dateLabel} at ${timeLabel}.`;
                        } else if (isReassign) {
                            clientMsg += `Your appointment for ${formData.treatmentName} on ${dateLabel} will now be handled by ${newProvider?.full_name || 'a new provider'}.`;
                        }

                        await sendWhatsApp(client.phone, clientMsg);
                    }

                    if (newProvider && newProvider.whatsapp) {
                        const dateLabel = format(new Date(scheduledStart), 'EEE, MMM do');
                        const timeLabel = format(new Date(scheduledStart), 'HH:mm');
                        const clientName = `${client?.first_name || ''} ${client?.last_name || ''}`.trim();

                        let staffMsg = `[Update] Hi ${newProvider.full_name}, `;
                        if (isReassign) {
                            staffMsg += `you have been assigned a new session: ${clientName} for ${formData.treatmentName} on ${dateLabel} at ${timeLabel}.`;
                        } else {
                            staffMsg += `the session for ${clientName} on ${dateLabel} has been moved to ${timeLabel}.`;
                        }

                        await sendWhatsApp(newProvider.whatsapp, staffMsg);
                    }

                    // Notify old provider if it was a shift
                    if (isReassign) {
                        const oldProvider = providers.find(p => p.id === editData.assigned_profile_id);
                        if (oldProvider && oldProvider.whatsapp) {
                            const dateLabel = format(new Date(editData.scheduled_start), 'EEE, MMM do');
                            const clientName = `${client?.first_name || ''} ${client?.last_name || ''}`.trim();
                            await sendWhatsApp(oldProvider.whatsapp, `[Shifted] Hi ${oldProvider.full_name}, your session with ${clientName} on ${dateLabel} has been reassigned to ${newProvider?.full_name || 'another provider'}.`);
                        }
                    }
                } catch (notiErr) {
                    console.error('Failed to send update notifications:', notiErr);
                }
            }

            // Optimistic cache update for instant feedback
            try {
                const currentCache = getCache(CACHE_KEYS.APPOINTMENTS) || [];
                const clientObj = clients.find(c => c.id === formData.clientId);
                const optimisticApt = {
                    ...appointmentData,
                    id: editData?.id || 'temp-' + Date.now(),
                    client: clientObj ? { first_name: clientObj.first_name, last_name: clientObj.last_name } : null
                };

                let newCache;
                if (editData) {
                    newCache = currentCache.map(a => a.id === editData.id ? optimisticApt : a);
                } else {
                    newCache = [...currentCache, optimisticApt].sort((a, b) => new Date(a.scheduled_start) - new Date(b.scheduled_start));
                }

                setCache(CACHE_KEYS.APPOINTMENTS, newCache);
            } catch (e) {
                console.warn('Optimistic cache update failed', e);
            }

            onRefresh(true, true);
            onClose();
        } catch (error) {
            console.error('Error saving appointment:', error);
            alert(error.message || 'Failed to save appointment');
        } finally {
            setLoading(false);
        }
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 overflow-y-auto">
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="absolute inset-0 bg-black/80 backdrop-blur-md"
                    />

                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        className="relative w-full max-w-xl glass-card border-white/10 shadow-2xl overflow-hidden my-8 flex flex-col max-h-[90vh]"
                    >
                        <div className="p-6 border-b border-white/5 flex justify-between items-center bg-white/[0.02] shrink-0">
                            <div className="flex items-center gap-3">
                                <div className="p-2.5 rounded-xl bg-primary/10 border border-primary/20">
                                    <Calendar className="text-primary" size={20} />
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold text-white">
                                        {editData ? `Adjusting: ${editData.client?.first_name || ''} ${editData.client?.last_name || ''}` : 'New Booking'}
                                    </h3>
                                    <p className="text-slate-500 text-[10px] uppercase tracking-widest font-bold">
                                        {editData ? (editData.treatment_name || 'Update Schedule') : 'Appointment Scheduling'}
                                    </p>
                                </div>
                            </div>

                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={handleFindSoonest}
                                    disabled={searchingSlots || loading}
                                    className="px-4 py-2 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 border border-indigo-500/20 rounded-xl text-xs font-bold transition-all flex items-center gap-2"
                                >
                                    {searchingSlots ? <Loader2 size={14} className="animate-spin" /> : <Clock size={14} />}
                                    {searchingSlots ? 'Searching...' : 'Find Soonest'}
                                </button>
                                <button
                                    type="button"
                                    onClick={onClose}
                                    className="p-2 hover:bg-white/10 rounded-xl transition-all"
                                >
                                    <X size={20} className="text-slate-500" />
                                </button>
                            </div>
                        </div>

                        <form onSubmit={handleSubmit} className="flex flex-col flex-grow overflow-hidden">
                            <div className="p-8 space-y-6 overflow-y-auto flex-grow scrollbar-thin scrollbar-thumb-white/10 hover:scrollbar-thumb-white/20">
                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Select Client</label>
                                    <div className="relative group">
                                        <User size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-primary transition-colors" />
                                        <select
                                            className="glass-input w-full pl-12 h-14"
                                            value={formData.clientId}
                                            onChange={e => setFormData({ ...formData, clientId: e.target.value })}
                                            required
                                            disabled={fetchingClients}
                                        >
                                            {fetchingClients ? (
                                                <option value="" className="bg-slate-900">Loading clients...</option>
                                            ) : (
                                                <>
                                                    <option value="" className="bg-slate-900">Choose from directory...</option>
                                                    {clients.map(c => (
                                                        <option key={c.id} value={c.id} className="bg-slate-900">{c.first_name} {c.last_name}</option>
                                                    ))}
                                                </>
                                            )}
                                        </select>
                                        {fetchingClients && <Loader2 className="absolute right-10 top-1/2 -translate-y-1/2 animate-spin text-primary" size={16} />}
                                    </div>
                                </div>

                                {isAdmin && (
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Assign to Provider</label>
                                        <div className="relative group">
                                            <User size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-primary transition-colors" />
                                            <select
                                                className="glass-input w-full pl-12 h-14"
                                                value={targetProviderId || ''}
                                                onChange={e => setTargetProviderId(e.target.value)}
                                                required
                                            >
                                                <option value="" className="bg-slate-900">
                                                    {calculatingAvailability ? 'Analyzing availability...' : 'Select provider...'}
                                                </option>
                                                {sortedQualifiedProviders.length === 0 && !calculatingAvailability && formData.requiredSkills?.length > 0 && (
                                                    <option value="" disabled className="bg-slate-900 text-red-400 italic">
                                                        ⚠ No providers match required skills
                                                    </option>
                                                )}
                                                {sortedQualifiedProviders.map(p => {
                                                    const avail = providerAvailability[p.id];
                                                    const isAvailable = avail && avail !== 'Closed' && avail !== 'None';
                                                    return (
                                                        <option key={p.id} value={p.id} className="bg-slate-900">
                                                            {p.full_name} {p.id === user?.id ? '(Me)' : ''}
                                                            {avail ? ` — ${isAvailable ? `Soonest: ${avail}` : avail}` : ''}
                                                        </option>
                                                    );
                                                })}
                                            </select>
                                            {calculatingAvailability && <Loader2 className="absolute right-10 top-1/2 -translate-y-1/2 animate-spin text-primary" size={16} />}
                                        </div>
                                    </div>
                                )}

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Target Date</label>
                                        <div className="relative group">
                                            <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-primary transition-colors" size={18} />
                                            <input
                                                type="date"
                                                className="glass-input w-full pl-12 h-14"
                                                value={formData.date}
                                                onChange={e => setFormData({ ...formData, date: e.target.value })}
                                                required
                                            />
                                        </div>
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Start Time (24H: e.g. 14:30)</label>
                                        <div className="relative group">
                                            <Clock className={`absolute left-4 top-1/2 -translate-y-1/2 transition-colors ${!/^([01]\d|2[0-3]):?([0-5]\d)$/.test(formData.time) ? 'text-red-400' : 'text-slate-500'}`} size={18} />
                                            <input
                                                type="text"
                                                placeholder="HH:mm"
                                                className={`glass-input w-full pl-12 h-14 ${!/^([01]\d|2[0-3]):[0-5]\d$/.test(formData.time) && formData.time ? 'border-red-500/50 text-red-400' : ''}`}
                                                value={formData.time}
                                                maxLength={5}
                                                onChange={e => {
                                                    let val = e.target.value.replace(/[^\d:]/g, '');
                                                    if (val.length === 2 && !val.includes(':') && e.nativeEvent.inputType !== 'deleteContentBackward') {
                                                        val += ':';
                                                    }
                                                    setFormData({ ...formData, time: val });
                                                }}
                                                onBlur={() => {
                                                    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(formData.time) && formData.time) {
                                                        setSlotStatus({ type: 'error', message: 'Invalid 24H format. Use HH:mm (e.g. 09:15 or 14:30)' });
                                                    }
                                                }}
                                                required
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Treatment / Service</label>
                                    <div className="relative group">
                                        <Timer size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-primary transition-colors" />
                                        <select
                                            className="glass-input w-full pl-12 h-14"
                                            value={formData.treatmentId}
                                            onChange={e => handleTreatmentChange(e.target.value)}
                                            disabled={fetchingTreatments}
                                        >
                                            {fetchingTreatments ? (
                                                <option value="" className="bg-slate-900">Loading services...</option>
                                            ) : (
                                                <>
                                                    <option value="" className="bg-slate-900">Custom / Select Service...</option>
                                                    {treatments.map(t => (
                                                        <option key={t.id} value={t.id} className="bg-slate-900">{t.name} ({t.duration_minutes}m)</option>
                                                    ))}
                                                </>
                                            )}
                                        </select>
                                        {fetchingTreatments && <Loader2 className="absolute right-10 top-1/2 -translate-y-1/2 animate-spin text-primary" size={16} />}
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Duration (min)</label>
                                        <div className="relative group">
                                            <Timer className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-primary transition-colors" size={18} />
                                            <input
                                                type="number"
                                                step="15"
                                                className="glass-input w-full pl-12 h-14 font-bold"
                                                value={formData.duration}
                                                onChange={e => setFormData({ ...formData, duration: e.target.value })}
                                                required
                                            />
                                        </div>
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Session Notes</label>
                                        <div className="relative group">
                                            <MessageCircle className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-primary transition-colors" size={18} />
                                            <input
                                                className="glass-input w-full pl-12 h-14"
                                                placeholder="Details..."
                                                value={formData.notes}
                                                onChange={e => setFormData({ ...formData, notes: e.target.value })}
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Suggested Slots */}
                                <AnimatePresence>
                                    {suggestedSlots.length > 0 && (
                                        <motion.div
                                            initial={{ opacity: 0, y: -10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, y: -10 }}
                                            className="space-y-3"
                                        >
                                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Suggested Available Spots</label>
                                            <div className="flex flex-wrap gap-2">
                                                {suggestedSlots.map((slot, idx) => (
                                                    <button
                                                        key={idx}
                                                        type="button"
                                                        onClick={() => {
                                                            setFormData({ ...formData, date: slot.date, time: slot.time });
                                                            setSuggestedSlots([]);
                                                        }}
                                                        className="px-4 py-2 rounded-xl bg-primary/10 border border-primary/20 text-primary hover:bg-primary hover:text-white transition-all text-xs font-bold flex flex-col items-center"
                                                    >
                                                        <span className="text-[8px] opacity-60 uppercase">{format(new Date(slot.date), 'EEE, MMM do')}</span>
                                                        <span>{slot.time}</span>
                                                    </button>
                                                ))}
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>

                                <div className="pt-2">
                                    <AnimatePresence mode="wait">
                                        {slotStatus.type !== 'idle' && (
                                            <motion.div
                                                initial={{ opacity: 0, height: 0 }}
                                                animate={{ opacity: 1, height: 'auto' }}
                                                exit={{ opacity: 0, height: 0 }}
                                                className={`flex items-center gap-3 p-3 rounded-xl border text-xs font-bold ${slotStatus.type === 'error' ? 'bg-red-500/10 border-red-500/20 text-red-400' :
                                                    slotStatus.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' :
                                                        'bg-slate-800/50 border-white/5 text-slate-400'
                                                    }`}
                                            >
                                                {slotStatus.type === 'checking' && <Loader2 className="w-3 h-3 animate-spin" />}
                                                {slotStatus.type === 'error' && <AlertTriangle className="w-3 h-3 shrink-0" />}
                                                {slotStatus.type === 'success' && <CheckCircle2 className="w-3 h-3 shrink-0" />}

                                                <span className="flex-grow">{slotStatus.message}</span>
                                                {slotStatus.suggestion && (
                                                    <button
                                                        type="button"
                                                        onClick={() => setFormData({ ...formData, time: slotStatus.suggestion })}
                                                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border transition-all animate-pulse hover:animate-none bg-orange-500/20 border-orange-500/30 text-orange-400 hover:bg-orange-500/40 active:scale-95"
                                                    >
                                                        <Clock size={12} strokeWidth={3} />
                                                        <span className="whitespace-nowrap font-black">Use {slotStatus.suggestion}</span>
                                                    </button>
                                                )}
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>
                            </div>

                            <div className="p-8 pt-4 border-t border-white/5 shrink-0 bg-white/[0.01]">
                                <button
                                    disabled={
                                        loading ||
                                        slotStatus.type === 'error' ||
                                        slotStatus.type === 'checking' ||
                                        !formData.clientId ||
                                        !targetProviderId ||
                                        !formData.date ||
                                        !formData.time ||
                                        !formData.treatmentName
                                    }
                                    className="w-full bg-primary hover:bg-indigo-600 text-white p-4 rounded-xl font-bold shadow-lg shadow-primary/20 active:scale-[0.98] transition-all flex items-center justify-center gap-3 disabled:opacity-30 disabled:grayscale disabled:cursor-not-allowed"
                                >
                                    {loading ? (
                                        <Loader2 className="animate-spin w-5 h-5" />
                                    ) : (
                                        <>
                                            <span>{editData ? 'Update Appointment' : 'Confirm Booking Slot'}</span>
                                            <ArrowRight size={18} />
                                        </>
                                    )}
                                </button>
                            </div>
                        </form>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
};

export default AddAppointmentModal;
