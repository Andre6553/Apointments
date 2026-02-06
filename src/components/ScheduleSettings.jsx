import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { Plus, Trash2, Clock, Coffee, Loader2, X, Sun, Moon, Save, Check, AlertTriangle, Users, ArrowRight } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { getCache, setCache, CACHE_KEYS } from '../lib/cache'
import { useToast } from '../contexts/ToastContext'
import { format, parseISO } from 'date-fns'
import { logEvent } from '../lib/logger'
import AddAppointmentModal from './AddAppointmentModal'
import { useNavigate } from 'react-router-dom'
import { useRef } from 'react'

const DayHoursRow = ({ day, idx, initialHours, onCommit, saveStatus }) => {
    const [localStart, setLocalStart] = useState(initialHours?.start_time?.slice(0, 5) || '08:00')
    const [localEnd, setLocalEnd] = useState(initialHours?.end_time?.slice(0, 5) || '17:00')
    const [isActive, setIsActive] = useState(initialHours?.is_active !== false)
    const isFocused = useRef(false)
    const lastCommitted = useRef({ start: localStart, end: localEnd, active: isActive })

    // Sync with backend changes only when NOT focused
    useEffect(() => {
        if (isFocused.current) return

        const hStart = initialHours?.start_time?.slice(0, 5) || '08:00'
        const hEnd = initialHours?.end_time?.slice(0, 5) || '17:00'
        const hActive = initialHours?.is_active !== false

        setLocalStart(hStart)
        setLocalEnd(hEnd)
        setIsActive(hActive)
        lastCommitted.current = { start: hStart, end: hEnd, active: hActive }
    }, [initialHours])

    const handleTimeChange = (field, val, setter) => {
        let processed = val.replace(/[^\d:]/g, '')

        // Smarter colon logic: Only add if typing forward (not deleting)
        if (processed.length === 2 && !processed.includes(':') && val.length > (field === 'start' ? localStart : localEnd).length) {
            processed += ':'
        }

        setter(processed)

        // If it's a valid 5-char time, we can optionally auto-commit or wait for blur
        if (processed.length === 5 && /^([01]\d|2[0-3]):[0-5]\d$/.test(processed)) {
            const newStart = field === 'start' ? processed : localStart
            const newEnd = field === 'end' ? processed : localEnd
            if (newStart !== lastCommitted.current.start || newEnd !== lastCommitted.current.end) {
                lastCommitted.current = { start: newStart, end: newEnd, active: isActive }
                onCommit(idx, newStart, newEnd, isActive)
            }
        }
    }

    const handleBlur = () => {
        isFocused.current = false
        const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/
        if (timeRegex.test(localStart) && timeRegex.test(localEnd)) {
            if (localStart !== lastCommitted.current.start || localEnd !== lastCommitted.current.end) {
                lastCommitted.current = { start: localStart, end: localEnd, active: isActive }
                onCommit(idx, localStart, localEnd, isActive)
            }
        }
    }

    const toggleActive = () => {
        const newActive = !isActive
        setIsActive(newActive)
        lastCommitted.current = { ...lastCommitted.current, active: newActive }
        onCommit(idx, localStart, localEnd, newActive)
    }

    const status = saveStatus[idx]

    return (
        <div key={day} className={`glass-card p-6 flex flex-col gap-4 group transition-all relative overflow-hidden ${!isActive ? 'opacity-60 grayscale-[0.5]' : 'hover:border-primary/30'}`}>
            <AnimatePresence>
                {status && (
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className="absolute top-2 right-2 px-2 py-0.5 rounded text-[8px] font-bold uppercase tracking-widest flex items-center gap-1"
                    >
                        {status === 'saving' && <Loader2 size={10} className="animate-spin text-primary" />}
                        {status === 'saved' && <Check size={10} className="text-emerald-400" />}
                        {(status === 'error' || status === 'invalid format') && <AlertTriangle size={10} className="text-red-400" />}
                        <span className={status === 'saved' ? 'text-emerald-400' : (status === 'error' || status === 'invalid format') ? 'text-red-400' : 'text-slate-500'}>
                            {status}
                        </span>
                    </motion.div>
                )}
            </AnimatePresence>

            <div className="flex items-center justify-between">
                <span className={`font-bold ${isActive ? 'text-white' : 'text-slate-500'}`}>{day}</span>
                <button
                    onClick={toggleActive}
                    className={`w-10 h-5 rounded-full relative transition-colors ${isActive ? 'bg-primary/40' : 'bg-slate-700'}`}
                >
                    <motion.div
                        animate={{ x: isActive ? 20 : 2 }}
                        className={`absolute top-1 w-3 h-3 rounded-full ${isActive ? 'bg-primary shadow-glow shadow-primary/50' : 'bg-slate-400'}`}
                    />
                </button>
            </div>
            <div className={`grid grid-cols-2 gap-4 transition-opacity ${!isActive ? 'pointer-events-none' : ''}`}>
                <div className="space-y-1">
                    <label className="text-[9px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1">
                        <Sun size={10} className={isActive ? "text-amber-400" : "text-slate-600"} /> Start (HH:mm)
                    </label>
                    <input
                        type="text"
                        disabled={!isActive}
                        placeholder="08:00"
                        className={`glass-input text-[11px] p-2 h-10 w-full text-center ${!/^([01]\d|2[0-3]):[0-5]\d$/.test(localStart) && localStart ? 'border-red-500/50 text-red-400' : ''}`}
                        value={localStart}
                        maxLength={5}
                        onFocus={() => { isFocused.current = true }}
                        onChange={(e) => handleTimeChange('start', e.target.value, setLocalStart)}
                        onBlur={handleBlur}
                    />
                </div>
                <div className="space-y-1">
                    <label className="text-[9px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1">
                        <Moon size={10} className={isActive ? "text-blue-400" : "text-slate-600"} /> End (HH:mm)
                    </label>
                    <input
                        type="text"
                        disabled={!isActive}
                        placeholder="17:00"
                        className={`glass-input text-[11px] p-2 h-10 w-full text-center ${!/^([01]\d|2[0-3]):[0-5]\d$/.test(localEnd) && localEnd ? 'border-red-500/50 text-red-400' : ''}`}
                        value={localEnd}
                        maxLength={5}
                        onFocus={() => { isFocused.current = true }}
                        onChange={(e) => handleTimeChange('end', e.target.value, setLocalEnd)}
                        onBlur={handleBlur}
                    />
                </div>
            </div>
        </div>
    )
}

const ScheduleSettings = () => {
    const { user, profile, updateProfile } = useAuth()
    const showToast = useToast()
    const [breaks, setBreaks] = useState(() => {
        const cached = getCache(CACHE_KEYS.BREAKS)
        return Array.isArray(cached) ? cached : []
    })
    const [workingHours, setWorkingHours] = useState(() => {
        const cached = getCache(CACHE_KEYS.WORKING_HOURS)
        return Array.isArray(cached) ? cached : []
    })
    const [loading, setLoading] = useState(!getCache(CACHE_KEYS.WORKING_HOURS))
    const [showAddBreak, setShowAddBreak] = useState(false)
    const [newBreak, setNewBreak] = useState({ label: 'Lunch Break', startTime: '13:00', duration: 60 })
    const [isUpdatingBreak, setIsUpdatingBreak] = useState(null) // { label, startTime, dayIdx }
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [saveStatus, setSaveStatus] = useState({}) // { dayIdx: 'saved' | 'saving' | 'error' }
    const [bufferSettings, setBufferSettings] = useState({ enabled: false, duration: 15 })

    // Conflict Detection State
    const [showConflictModal, setShowConflictModal] = useState(false)
    const [conflictingAppointments, setConflictingAppointments] = useState([])
    const [pendingHoursChange, setPendingHoursChange] = useState(null)
    const [transferring, setTransferring] = useState(false)
    const [showTransferReminder, setShowTransferReminder] = useState(false)
    const [breakConflictData, setBreakConflictData] = useState(null) // { brk, dayIdx, conflicts }
    const [isRescheduling, setIsRescheduling] = useState(false)
    const [selectedAptToReschedule, setSelectedAptToReschedule] = useState(null)
    const navigate = useNavigate()

    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

    const fetchData = useCallback(async (silent = false) => {
        if (!user) return
        if (!silent) setLoading(true)
        try {
            const [breakRes, hoursRes, profileRes] = await Promise.all([
                supabase.from('breaks').select('*').eq('profile_id', user.id).order('start_time', { ascending: true }),
                supabase.from('working_hours').select('*').eq('profile_id', user.id),
                supabase.from('profiles').select('enable_buffer, buffer_minutes').eq('id', user.id).single()
            ])

            setBreaks(breakRes.data || [])
            setWorkingHours(hoursRes.data || [])
            if (profileRes.data) {
                setBufferSettings({
                    enabled: profileRes.data.enable_buffer || false,
                    duration: profileRes.data.buffer_minutes || 15
                })
            }

            setCache(CACHE_KEYS.BREAKS, breakRes.data || [])
            setCache(CACHE_KEYS.WORKING_HOURS, hoursRes.data || [])
        } catch (error) {
            console.error('Error fetching schedule settings:', error)
        } finally {
            setLoading(false)
        }
    }, [user])

    useEffect(() => {
        if (!user) return
        fetchData()

        const channel = supabase.channel(`schedule-settings-${user.id}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'breaks', filter: `profile_id=eq.${user.id}` }, () => fetchData(true))
            .on('postgres_changes', { event: '*', schema: 'public', table: 'working_hours', filter: `profile_id=eq.${user.id}` }, () => fetchData(true))
            .subscribe()

        return () => {
            supabase.removeChannel(channel)
        }
    }, [user, fetchData])

    const handleCommitHours = async (dayIdx, start, end, isActive, skipConflictCheck = false) => {
        if (!user) {
            return
        }

        const newItem = { profile_id: user.id, day_of_week: dayIdx, start_time: start, end_time: end, is_active: isActive }

        // 1. Validate
        const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/
        if (!timeRegex.test(start) || !timeRegex.test(end)) {
            setSaveStatus(prev => ({ ...prev, [dayIdx]: 'invalid format' }))
            return
        }

        // 2. Optimistic UI update for the canonical state
        setWorkingHours(prev => {
            const updated = [...prev]
            const idx = updated.findIndex(h => h.day_of_week === dayIdx)
            if (idx >= 0) updated[idx] = newItem
            else updated.push(newItem)
            setCache(CACHE_KEYS.WORKING_HOURS, updated)
            return updated
        })

        // 3. Conflict Check
        if (!skipConflictCheck) {
            const conflicts = isActive
                ? await checkForConflicts(dayIdx, start, end)
                : await checkForConflicts(dayIdx, '00:00', '00:01')

            if (conflicts.length > 0) {
                setConflictingAppointments(conflicts)
                setPendingHoursChange({ dayIdx, start, end, isActive })
                setShowConflictModal(true)
                return
            }
        }

        await saveHoursToDb(newItem, dayIdx)
    }

    // Check for appointments that fall outside new working hours
    const checkForConflicts = async (dayIdx, newStart, newEnd) => {
        if (!user) return []

        try {
            // Get future pending appointments for this provider on this day of week
            const today = new Date()
            today.setHours(0, 0, 0, 0)

            const { data: appointments } = await supabase
                .from('appointments')
                .select('*, client:clients(first_name, last_name, phone)')
                .eq('assigned_profile_id', user.id)
                .eq('status', 'pending')
                .gte('scheduled_start', today.toISOString())

            if (!appointments) return []

            // Filter to appointments on this day of week that are outside new hours
            const conflicts = appointments.filter(apt => {
                const aptDate = new Date(apt.scheduled_start)
                if (aptDate.getDay() !== dayIdx) return false

                const aptTime = format(aptDate, 'HH:mm')
                const aptEndTime = format(new Date(aptDate.getTime() + apt.duration_minutes * 60000), 'HH:mm')

                // Check if appointment is outside new working hours
                return aptTime < newStart || aptEndTime > newEnd
            })

            return conflicts
        } catch (err) {
            console.error('Error checking conflicts:', err)
            return []
        }
    }

    // Save hours change to database
    const saveHoursToDb = async (newItem, dayIdx) => {
        setSaveStatus(prev => ({ ...prev, [dayIdx]: 'saving' }))

        // Get old hours for logging
        const oldHours = workingHours.find(h => h.day_of_week === dayIdx)
        const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

        try {
            const { error } = await supabase
                .from('working_hours')
                .upsert(newItem, { onConflict: 'profile_id,day_of_week' })

            if (error) throw error

            // Log the change
            await logEvent('SCHEDULE_CHANGE', {
                provider_id: user?.id,
                provider_name: profile?.full_name,
                day: days[dayIdx],
                day_index: dayIdx,
                old_hours: oldHours ? { start: oldHours.start_time, end: oldHours.end_time, active: oldHours.is_active } : null,
                new_hours: { start: newItem.start_time, end: newItem.end_time, active: newItem.is_active },
                action: !newItem.is_active ? 'DAY_DISABLED' : (oldHours?.is_active === false ? 'DAY_ENABLED' : 'HOURS_CHANGED')
            }, profile)

            // NEW: Logic to auto-disable transfers if all days are off
            if (!newItem.is_active) {
                const { data: allHours } = await supabase
                    .from('working_hours')
                    .select('is_active')
                    .eq('profile_id', user.id);

                const activeCount = (allHours || []).filter(h => h.is_active).length;
                const totalRows = (allHours || []).length;

                // Only auto-disable if every single day (7) is explicitly set to inactive
                if (activeCount === 0 && totalRows === 7) {
                    await supabase.from('profiles')
                        .update({ accepts_transfers: false })
                        .eq('id', user.id);

                    showToast('All working days closed. Transfers automatically disabled.', 'info');

                    await logEvent('TRANSFERS_AUTO_DISABLED', {
                        provider_id: user.id,
                        reason: 'all_working_days_disabled'
                    }, profile);
                }
            } else {
                // REVERSE Logic: If turning a day ON, and transfers are currently OFF, show reminder popup
                if (profile && profile.accepts_transfers === false) {
                    setShowTransferReminder(true);
                }
            }

            setSaveStatus(prev => ({ ...prev, [dayIdx]: 'saved' }))

            // NEW: If the day was disabled, automatically sweep and remove any breaks for that day
            if (!newItem.is_active) {
                const { data: removedBreaks, error: breakSweepError } = await supabase
                    .from('breaks')
                    .delete()
                    .eq('profile_id', user.id)
                    .eq('day_of_week', dayIdx)
                    .select();

                if (breakSweepError) {
                    console.error('Failed to sweep breaks for disabled day:', breakSweepError);
                } else {
                    if (removedBreaks?.length > 0) {
                        await logEvent('BREAKS_CLEARED_AUTOMATICALLY', {
                            day: days[dayIdx],
                            removed_count: removedBreaks.length,
                            reason: 'Working day deactivated'
                        }, profile);
                    }
                    // Update local state to reflect the swept breaks
                    setBreaks(prev => prev.filter(b => b.day_of_week !== dayIdx));
                    setCache(CACHE_KEYS.BREAKS, (breaks || []).filter(b => b.day_of_week !== dayIdx));
                }
            }

            setTimeout(() => setSaveStatus(prev => ({ ...prev, [dayIdx]: null })), 2000)
        } catch (error) {
            console.error('Update failed:', error)
            setSaveStatus(prev => ({ ...prev, [dayIdx]: 'error' }))
            fetchData()
        }
    }

    // Transfer conflicting appointments to admin and notify
    const handleTransferToAdmin = async () => {
        if (!pendingHoursChange || conflictingAppointments.length === 0) return

        setTransferring(true)
        try {
            // 1. Find admin for this business
            const { data: admins } = await supabase
                .from('profiles')
                .select('id, full_name')
                .eq('business_id', profile?.business_id)
                .ilike('role', 'admin')
                .limit(1)

            const admin = admins?.[0]
            if (!admin) {
                showToast('No admin found to transfer appointments to', 'error')
                setTransferring(false)
                return
            }

            // 2. Transfer all conflicting appointments to admin
            const aptIds = conflictingAppointments.map(a => a.id)
            const clientNames = conflictingAppointments.map(a =>
                `${a.client?.first_name || 'Unknown'} ${a.client?.last_name || ''}`
            ).join(', ')

            // 2. Use RPC to transfer each appointment (bypasses RLS)
            for (const aptId of aptIds) {
                const { error: rpcError } = await supabase.rpc('reassign_appointment', {
                    appt_id: aptId,
                    new_provider_id: admin.id,
                    note_text: 'Transferred due to working hours change - requires attention',
                    flag_attention: true
                })
                if (rpcError) throw rpcError
            }

            // 3. Send internal message to admin
            const messageContent = `Hi ${admin.full_name}, it's ${profile?.full_name || 'a provider'}. I have changed my working hours and the following clients need to be rescheduled: ${clientNames}. Please attend to this. Thank you!`

            await supabase.from('temporary_messages').insert({
                sender_id: user.id,
                receiver_id: admin.id,
                business_id: profile?.business_id,
                content: messageContent,
                is_read: false
            })

            // Log the transfers
            const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
            await logEvent('APPOINTMENTS_TRANSFERRED', {
                provider_id: user?.id,
                provider_name: profile?.full_name,
                admin_id: admin.id,
                admin_name: admin.full_name,
                day: days[pendingHoursChange.dayIdx],
                reason: pendingHoursChange.isActive ? 'WORKING_HOURS_NARROWED' : 'DAY_DISABLED',
                appointments_count: conflictingAppointments.length,
                appointment_ids: aptIds,
                clients_affected: clientNames
            }, profile)

            // 4. Now save the hours change
            const { dayIdx, start, end, isActive } = pendingHoursChange
            const newItem = { profile_id: user.id, day_of_week: dayIdx, start_time: start, end_time: end, is_active: isActive }
            await saveHoursToDb(newItem, dayIdx)

            showToast(`${conflictingAppointments.length} appointment(s) transferred to ${admin.full_name}`, 'success')
            setShowConflictModal(false)
            setConflictingAppointments([])
            setPendingHoursChange(null)

        } catch (err) {
            console.error('Transfer failed:', err)
            showToast('Failed to transfer appointments', 'error')
        } finally {
            setTransferring(false)
        }
    }

    // Cancel hours change
    const handleCancelHoursChange = () => {
        setShowConflictModal(false)
        setConflictingAppointments([])
        setPendingHoursChange(null)
        fetchData() // Revert to original hours
    }

    const handleAddBreak = async (e) => {
        e.preventDefault()
        if (!user) return

        const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/
        if (!timeRegex.test(newBreak.startTime)) {
            alert('Please use HH:mm 24H format (e.g. 13:00)')
            return
        }

        setIsSubmitting(true)
        try {
            // For simplicity in Demo/Stress test context, we often want breaks for all days
            // We'll add them for all 7 days to ensure consistent coverage
            const allDaysBreaks = []
            for (let d = 0; d < 7; d++) {
                allDaysBreaks.push({
                    profile_id: user.id,
                    label: newBreak.label,
                    start_time: newBreak.startTime,
                    duration_minutes: parseInt(newBreak.duration),
                    day_of_week: d
                })
            }

            const { error } = await supabase.from('breaks').insert(allDaysBreaks)

            if (error) throw error
            setShowAddBreak(false)

            // Optimistic break update
            const updatedBreaks = [...breaks, {
                id: 'temp-' + Date.now(),
                profile_id: user.id,
                label: newBreak.label,
                start_time: newBreak.startTime,
                duration_minutes: parseInt(newBreak.duration),
                day_of_week: new Date().getDay()
            }].sort((a, b) => a.start_time.localeCompare(b.start_time))

            setBreaks(updatedBreaks)
            setCache(CACHE_KEYS.BREAKS, updatedBreaks)

            fetchData(true)
        } catch (error) {
            alert('Could not add break: ' + error.message)
        } finally {
            setIsSubmitting(false)
        }
    }

    const toggleBreakDay = async (brk, dayIdx, options = { force: false, action: 'transfer' }) => {
        if (!user) return

        const isActive = brk.days.includes(dayIdx)
        if (isActive) {
            // Turning it OFF is always safe
            setIsUpdatingBreak(`${brk.label}-${brk.start_time}-${dayIdx}`)
            try {
                await supabase.from('breaks').delete()
                    .eq('profile_id', user.id)
                    .eq('label', brk.label)
                    .eq('start_time', brk.start_time)
                    .eq('duration_minutes', brk.duration_minutes)
                    .eq('day_of_week', dayIdx)
                fetchData(true)
            } finally {
                setIsUpdatingBreak(null)
            }
            return
        }

        // Turning it ON needs safety check
        const conflicts = await checkBreakConflicts(brk, dayIdx)
        if (conflicts.length > 0 && !options.force) {
            setBreakConflictData({ brk, dayIdx, conflicts })
            return
        }

        setIsUpdatingBreak(`${brk.label}-${brk.start_time}-${dayIdx}`)
        try {
            if (options.force && conflicts.length > 0) {
                await performBreakTransfers(conflicts, options.action)
            }

            await supabase.from('breaks').insert({
                profile_id: user.id,
                label: brk.label,
                start_time: brk.start_time,
                duration_minutes: brk.duration_minutes,
                day_of_week: dayIdx
            })

            // Log event
            await logEvent('BREAK_TOGGLED', {
                provider_id: user.id,
                label: brk.label,
                day: days[dayIdx],
                active: !isActive
            }, profile)

            fetchData(true)
        } catch (err) {
            console.error('Failed to toggle break day:', err)
            showToast('Update failed', 'error')
        } finally {
            setIsUpdatingBreak(null)
            setBreakConflictData(null)
        }
    }

    const checkBreakConflicts = async (brk, dayIdx) => {
        const today = new Date()
        today.setHours(0, 0, 0, 0)

        const { data: appointments } = await supabase
            .from('appointments')
            .select('*, client:clients(first_name, last_name, phone)')
            .eq('assigned_profile_id', user.id)
            .eq('status', 'pending')
            .gte('scheduled_start', today.toISOString())

        if (!appointments) return []

        return appointments.filter(apt => {
            const aptDate = new Date(apt.scheduled_start)
            if (aptDate.getDay() !== dayIdx) return false

            const aptStartTime = format(aptDate, 'HH:mm')
            const aptEndTime = format(new Date(aptDate.getTime() + apt.duration_minutes * 60000), 'HH:mm')

            const breakStart = brk.start_time
            const breakEnd = format(new Date(new Date(`1970-01-01T${brk.start_time}`).getTime() + brk.duration_minutes * 60000), 'HH:mm')

            // Does appointment overlap with break?
            return aptStartTime < breakEnd && aptEndTime > breakStart
        })
    }

    const performBreakTransfers = async (conflicts, action) => {
        const { data: admins } = await supabase
            .from('profiles')
            .select('id, full_name')
            .eq('business_id', profile?.business_id)
            .ilike('role', 'admin')
            .limit(1)

        const admin = admins?.[0]
        if (!admin) throw new Error('No admin found')

        for (const apt of conflicts) {
            await supabase.rpc('reassign_appointment', {
                appt_id: apt.id,
                new_provider_id: admin.id,
                note_text: action === 'transfer'
                    ? 'Transferred due to break scheduling'
                    : 'Marked for rescheduling due to break scheduling',
                flag_attention: true
            })

            // Log high-fidelity appointment event
            await logEvent('APPT_BREAK_SHIFT', {
                appointment_id: apt.id,
                client_name: `${apt.client?.first_name} ${apt.client?.last_name}`,
                original_provider: user.id,
                target_provider: admin.id,
                break_label: breakConflictData?.brk?.label,
                action_type: action,
                reason: `Provider scheduled a ${breakConflictData?.brk?.label} break`
            }, profile)
        }

        const clientNames = conflicts.map(a => `${a.client?.first_name} ${a.client?.last_name}`).join(', ')
        const msg = action === 'transfer'
            ? `Hi ${admin.full_name}, I've added a break on ${days[conflicts[0].dayIdx]}. Please handle these clients: ${clientNames}`
            : `Hi ${admin.full_name}, I've added a break on ${days[conflicts[0].dayIdx]}. These clients need to be RESCHEDULED: ${clientNames}`

        await supabase.from('temporary_messages').insert({
            sender_id: user.id,
            receiver_id: admin.id,
            business_id: profile?.business_id,
            content: msg,
            is_read: false
        })
    }

    const deleteBreak = async (breakToCancel) => {
        if (!confirm(`Cancel this scheduled break (${breakToCancel.label}) for all days?`)) return
        try {
            // Optimistic delete: filter out all breaks that match the label, start_time, and duration
            const updatedBreaks = breaks.filter(b =>
                !(b.label === breakToCancel.label &&
                    b.start_time === breakToCancel.start_time &&
                    b.duration_minutes === breakToCancel.duration_minutes)
            )
            setBreaks(updatedBreaks)
            setCache(CACHE_KEYS.BREAKS, updatedBreaks)

            // Delete from DB: matches label, start_time, duration for this user
            const { error } = await supabase.from('breaks').delete()
                .eq('profile_id', user.id)
                .eq('label', breakToCancel.label)
                .eq('start_time', breakToCancel.start_time)
                .eq('duration_minutes', breakToCancel.duration_minutes)

            if (error) throw error
            fetchData(true)
        } catch (e) {
            console.error('Delete failed:', e)
            fetchData(true) // Revert on failure
        }
    }

    const handleUpdateBuffer = async (enabled, duration) => {
        const newSettings = { enabled, duration: parseInt(duration) || 0 };
        setBufferSettings(newSettings);

        try {
            const { error } = await supabase.from('profiles').update({
                enable_buffer: newSettings.enabled,
                buffer_minutes: newSettings.duration
            }).eq('id', user.id);

            if (error) throw error;
        } catch (e) {
            console.error('Failed to update buffer settings:', e);
            fetchData(true); // Revert on error
        }
    };

    return (
        <div className="space-y-12">
            {/* Working Hours Conflict Modal */}
            <AnimatePresence>
                {showConflictModal && (
                    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={handleCancelHoursChange}
                            className="absolute inset-0 bg-slate-950/90 backdrop-blur-xl"
                        />
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            className="relative w-full max-w-lg glass-card p-0 flex flex-col max-h-[90vh] overflow-hidden shadow-2xl border border-red-500/30"
                        >
                            <div className="p-6 border-b border-red-500/20 bg-red-500/10 flex items-center justify-between shrink-0">
                                <div className="flex items-center gap-3">
                                    <div className="p-2.5 rounded-xl bg-red-500/20 border border-red-500/30 text-red-400">
                                        <AlertTriangle size={24} />
                                    </div>
                                    <div>
                                        <h3 className="text-xl font-bold text-white leading-none">Schedule Conflict</h3>
                                        <p className="text-[10px] text-red-400 font-bold uppercase tracking-widest mt-1.5">
                                            {conflictingAppointments.length} APPOINTMENT{conflictingAppointments.length !== 1 ? 'S' : ''} ALREADY BOOKED
                                        </p>
                                    </div>
                                </div>
                                <button onClick={handleCancelHoursChange} className="p-2 text-slate-500 hover:text-white hover:bg-white/5 rounded-xl transition-all">
                                    <X size={20} />
                                </button>
                            </div>

                            <div className="flex-1 overflow-y-auto p-6 space-y-4">
                                <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 mb-4">
                                    <p className="text-sm text-amber-200/80 leading-relaxed">
                                        You are narrowing your availability, but you already have clients booked during the hours you're removing.
                                        You must transfer these clients to the Admin or reschedule them before you can save these new hours.
                                    </p>
                                </div>

                                <div className="space-y-2">
                                    {conflictingAppointments.map(apt => (
                                        <div key={apt.id} className="bg-slate-800/80 border border-white/5 rounded-xl p-4 flex items-center justify-between gap-4">
                                            <div className="flex items-center gap-4">
                                                <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center text-red-400 font-bold text-sm">
                                                    {apt.client?.first_name?.charAt(0)}
                                                </div>
                                                <div className="flex-1">
                                                    <p className="font-bold text-white text-sm">
                                                        {apt.client?.first_name} {apt.client?.last_name}
                                                    </p>
                                                    <p className="text-xs text-slate-400">
                                                        {format(new Date(apt.scheduled_start), 'eeee, HH:mm')} ({apt.duration_minutes}min)
                                                    </p>
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => setSelectedAptToReschedule(apt)}
                                                className="px-3 py-1.5 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/20 text-indigo-400 text-[10px] font-bold uppercase tracking-wider transition-all"
                                            >
                                                Reschedule
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="p-6 border-t border-white/5 bg-white/[0.02] flex flex-col gap-3">
                                <button
                                    onClick={handleTransferToAdmin}
                                    disabled={transferring}
                                    className="w-full py-4 rounded-xl bg-red-500 hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold transition-all flex items-center justify-center gap-2 text-sm shadow-lg shadow-red-500/20"
                                >
                                    {transferring ? <Loader2 size={18} className="animate-spin" /> : <Users size={18} />}
                                    <span>Transfer {conflictingAppointments.length} Clients to Admin</span>
                                </button>
                                <button
                                    onClick={handleCancelHoursChange}
                                    className="w-full py-3 rounded-xl border border-white/10 hover:bg-white/5 text-slate-400 font-bold transition-all text-sm"
                                >
                                    Cancel & Revert Changes
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Break Conflict Warning Modal */}
            <AnimatePresence>
                {breakConflictData && (
                    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setBreakConflictData(null)}
                            className="absolute inset-0 bg-slate-950/90 backdrop-blur-xl"
                        />
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            className="relative w-full max-w-lg glass-card p-0 flex flex-col max-h-[90vh] overflow-hidden shadow-2xl border border-orange-500/30"
                        >
                            <div className="p-6 border-b border-orange-500/20 bg-orange-500/10 flex items-center justify-between shrink-0">
                                <div className="flex items-center gap-3">
                                    <div className="p-2.5 rounded-xl bg-orange-500/20 border border-orange-500/30 text-orange-400">
                                        <Coffee size={24} />
                                    </div>
                                    <div>
                                        <h3 className="text-xl font-bold text-white leading-none">Break Conflict</h3>
                                        <p className="text-[10px] text-orange-400 font-bold uppercase tracking-widest mt-1.5">
                                            {breakConflictData.conflicts.length} CLIENT{breakConflictData.conflicts.length !== 1 ? 'S' : ''} BOOKED DURING {breakConflictData.brk.label}
                                        </p>
                                    </div>
                                </div>
                                <button onClick={() => setBreakConflictData(null)} className="p-2 text-slate-500 hover:text-white hover:bg-white/5 rounded-xl transition-all">
                                    <X size={20} />
                                </button>
                            </div>

                            <div className="flex-1 overflow-y-auto p-6 space-y-4">
                                <p className="text-sm text-slate-300 leading-relaxed">
                                    "{breakConflictData.conflicts.map(c => c.client?.first_name).join(', ')}" is booked during this time.
                                    Should we move them to Admin or reschedule so you can take your {breakConflictData.brk.label.toLowerCase()}?
                                </p>

                                <div className="space-y-2">
                                    {breakConflictData.conflicts.map(apt => (
                                        <div key={apt.id} className="bg-slate-800/80 border border-white/5 rounded-xl p-4 flex items-center justify-between gap-4">
                                            <div className="flex items-center gap-4">
                                                <div className="w-10 h-10 rounded-full bg-orange-500/20 flex items-center justify-center text-orange-400 font-bold text-sm">
                                                    {apt.client?.first_name?.charAt(0)}
                                                </div>
                                                <div className="flex-1">
                                                    <p className="font-bold text-white text-sm">
                                                        {apt.client?.first_name} {apt.client?.last_name}
                                                    </p>
                                                    <p className="text-xs text-slate-400">
                                                        {format(new Date(apt.scheduled_start), 'HH:mm')} ({apt.duration_minutes}min)
                                                    </p>
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => setSelectedAptToReschedule(apt)}
                                                className="px-3 py-1.5 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/20 text-indigo-400 text-[10px] font-bold uppercase tracking-wider transition-all"
                                            >
                                                Reschedule
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="p-6 border-t border-white/5 bg-white/[0.02] flex flex-col gap-3">
                                <button
                                    onClick={() => toggleBreakDay(breakConflictData.brk, breakConflictData.dayIdx, { force: true, action: 'transfer' })}
                                    className="w-full py-4 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white font-bold transition-all flex items-center justify-center gap-2 text-sm shadow-lg shadow-indigo-500/20"
                                >
                                    <Users size={18} />
                                    <span>Move to Admin</span>
                                </button>
                                <button
                                    onClick={() => setBreakConflictData(null)}
                                    className="w-full py-3 rounded-xl border border-white/10 hover:bg-white/5 text-slate-400 font-bold transition-all text-sm"
                                >
                                    Cancel & Keep Appointment
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Individual Reschedule Modal */}
            <AddAppointmentModal
                isOpen={!!selectedAptToReschedule}
                onClose={() => setSelectedAptToReschedule(null)}
                onRefresh={async () => {
                    await fetchData(true)
                    setSelectedAptToReschedule(null)

                    // Critical: Re-check conflicts for the existing modal
                    if (breakConflictData) {
                        const updated = await checkBreakConflicts(breakConflictData.brk, breakConflictData.dayIdx)
                        if (updated.length === 0) {
                            // Amazing! The user manually moved everyone. 
                            // We can now safely turn the break ON.
                            await toggleBreakDay(breakConflictData.brk, breakConflictData.dayIdx, { force: true })
                            setBreakConflictData(null)
                            showToast('Break activated - conflicts resolved!', 'success')
                        } else {
                            setBreakConflictData({ ...breakConflictData, conflicts: updated })
                        }
                    }
                }}
                editData={selectedAptToReschedule}
            />

            {/* Transfer Reminder Modal */}
            <AnimatePresence>
                {showTransferReminder && (
                    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setShowTransferReminder(false)}
                            className="absolute inset-0 bg-slate-950/80 backdrop-blur-md"
                        />
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            className="relative w-full max-w-md glass-card p-8 flex flex-col items-center text-center shadow-2xl border border-indigo-500/30"
                        >
                            <div className="w-20 h-20 rounded-2xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 mb-6">
                                <ArrowRight size={40} />
                            </div>

                            <h3 className="text-2xl font-bold text-white mb-2">Transfers are Disabled</h3>
                            <p className="text-slate-400 mb-8">
                                You've activated a working day, but your <span className="text-indigo-400 font-bold">Accept Transfers</span> setting is currently off. You won't receive clients from other providers until you turn it back on.
                            </p>

                            <div className="flex flex-col w-full gap-3">
                                <button
                                    onClick={async () => {
                                        try {
                                            await updateProfile({ accepts_transfers: true });
                                            showToast('Transfers reactivated!', 'success');
                                            setShowTransferReminder(false);
                                        } catch (err) {
                                            console.error('Failed to reactivate transfers:', err);
                                            // Fallback
                                            await supabase.from('profiles')
                                                .update({ accepts_transfers: true })
                                                .eq('id', user.id);
                                            showToast('Transfers reactivated!', 'success');
                                            setShowTransferReminder(false);
                                        }
                                    }}
                                    className="w-full py-4 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white font-bold transition-all shadow-lg shadow-indigo-500/20"
                                >
                                    Reactivate Transfers Now
                                </button>
                                <button
                                    onClick={() => setShowTransferReminder(false)}
                                    className="w-full py-4 rounded-xl bg-white/5 border border-white/10 text-slate-400 font-bold hover:text-white transition-all"
                                >
                                    Keep Transfers Disabled
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Working Hours Section */}
            <section className="space-y-6">
                <div className="flex justify-between items-end">
                    <div>
                        <h3 className="text-2xl font-bold text-white mb-1">Shift Management</h3>
                        <p className="text-slate-500 text-sm">Define your availability from morning to evening</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {days.map((day, idx) => (
                        <DayHoursRow
                            key={day}
                            day={day}
                            idx={idx}
                            initialHours={workingHours.find(h => h.day_of_week === idx)}
                            onCommit={handleCommitHours}
                            saveStatus={saveStatus}
                        />
                    ))}
                </div>
            </section>

            {/* Buffer Settings */}
            <section className="space-y-6">
                <div>
                    <h3 className="text-2xl font-bold text-white mb-1">Appointment Efficiency</h3>
                    <p className="text-slate-500 text-sm">Configure automatic gaps between sessions</p>
                </div>

                <div className="glass-card p-6 flex flex-col md:flex-row md:items-center justify-between gap-6 border-indigo-500/20 bg-indigo-500/5">
                    <div className="flex items-start gap-4">
                        <div className={`p-3 rounded-xl border ${bufferSettings.enabled ? 'bg-indigo-500/20 border-indigo-500' : 'bg-slate-800/50 border-white/5'}`}>
                            <Clock size={24} className={bufferSettings.enabled ? 'text-indigo-400' : 'text-slate-500'} />
                        </div>
                        <div>
                            <h4 className="font-bold text-white mb-1">Buffer Time</h4>
                            <p className="text-xs text-slate-400 max-w-sm">
                                Adding a buffer creates a small recovery gap after every appointment.
                                This helps with cleaning, notes, or short breaks.
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-6">
                        <div className={`transition-opacity ${!bufferSettings.enabled ? 'opacity-40 pointer-events-none' : ''}`}>
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1">Duration (min)</label>
                            <div className="relative">
                                <input
                                    type="number"
                                    className="glass-input h-10 w-24 text-center"
                                    value={bufferSettings.duration}
                                    step="5"
                                    min="0"
                                    max="60"
                                    onChange={(e) => handleUpdateBuffer(bufferSettings.enabled, e.target.value)}
                                />
                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-500">m</span>
                            </div>
                        </div>

                        <div className="h-10 w-px bg-white/10 hidden md:block" />

                        <div className="flex items-center gap-3">
                            <span className={`text-xs font-bold ${!bufferSettings.enabled ? 'text-slate-500' : 'text-white'}`}>
                                {bufferSettings.enabled ? 'Enabled' : 'Disabled'}
                            </span>
                            <button
                                onClick={() => handleUpdateBuffer(!bufferSettings.enabled, bufferSettings.duration)}
                                className={`w-12 h-6 rounded-full relative transition-colors ${bufferSettings.enabled ? 'bg-indigo-500' : 'bg-slate-700'}`}
                            >
                                <motion.div
                                    animate={{ x: bufferSettings.enabled ? 26 : 2 }}
                                    className="absolute top-1 w-4 h-4 rounded-full bg-white shadow-sm"
                                />
                            </button>
                        </div>
                    </div>
                </div>
            </section>

            {/* Breaks Section */}
            <section className="space-y-6">
                <div className="flex justify-between items-end">
                    <div>
                        <h3 className="text-2xl font-bold text-white mb-1">Break Slots</h3>
                        <p className="text-slate-500 text-sm">Manage scheduled downtime and recovery</p>
                    </div>
                    <button
                        onClick={() => setShowAddBreak(!showAddBreak)}
                        className="bg-primary hover:bg-indigo-600 text-white px-4 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2 transition-all shadow-lg shadow-primary/20"
                    >
                        {showAddBreak ? <X size={16} /> : <Plus size={16} />}
                        {showAddBreak ? 'Cancel' : 'Add Break'}
                    </button>
                </div>

                <AnimatePresence>
                    {showAddBreak && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="glass-card p-6 border-primary/20 bg-primary/5"
                        >
                            <form onSubmit={handleAddBreak} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Label</label>
                                    <input className="glass-input h-12 w-full" value={newBreak.label} onChange={e => setNewBreak({ ...newBreak, label: e.target.value })} required />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Start Time (24H: e.g. 13:00)</label>
                                    <input
                                        type="text"
                                        placeholder="HH:mm"
                                        className={`glass-input h-12 w-full text-center ${!/^([01]\d|2[0-3]):[0-5]\d$/.test(newBreak.startTime) && newBreak.startTime ? 'border-red-500/50 text-red-400' : ''}`}
                                        value={newBreak.startTime}
                                        maxLength={5}
                                        onChange={e => {
                                            let val = e.target.value.replace(/[^\d:]/g, '');
                                            if (val.length === 2 && !val.includes(':') && e.nativeEvent.inputType !== 'deleteContentBackward') {
                                                val += ':';
                                            }
                                            setNewBreak({ ...newBreak, startTime: val });
                                        }}
                                        required
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Duration (min)</label>
                                    <input type="number" className="glass-input h-12 w-full" value={newBreak.duration} onChange={e => setNewBreak({ ...newBreak, duration: e.target.value })} required />
                                </div>
                                <button disabled={isSubmitting} className="bg-primary h-12 rounded-xl font-bold text-white hover:bg-indigo-600 transition-all">
                                    {isSubmitting ? <Loader2 className="animate-spin mx-auto" size={20} /> : 'Save Break'}
                                </button>
                            </form>
                        </motion.div>
                    )}
                </AnimatePresence>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {Object.values(breaks.reduce((acc, brk) => {
                        const key = `${brk.label}-${brk.start_time}-${brk.duration_minutes}`;
                        if (!acc[key]) acc[key] = { ...brk, days: [] };
                        acc[key].days.push(brk.day_of_week);
                        return acc;
                    }, {})).map(brk => (
                        <div key={`${brk.label}-${brk.start_time}`} className="glass-card p-5 group flex flex-col justify-between hover:border-orange-500/30 transition-all">
                            <div className="flex justify-between items-start mb-4">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center text-orange-500 border border-orange-500/20">
                                        <Coffee size={20} />
                                    </div>
                                    <div className="flex gap-1">
                                        {[0, 1, 2, 3, 4, 5, 6].map(d => {
                                            const isActive = brk.days.includes(d);
                                            const isUpdating = isUpdatingBreak === `${brk.label}-${brk.start_time}-${d}`;
                                            const dayLabels = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

                                            return (
                                                <button
                                                    key={d}
                                                    disabled={isUpdating}
                                                    onClick={() => toggleBreakDay(brk, d)}
                                                    className={`w-5 h-5 rounded flex items-center justify-center text-[8px] font-black transition-all border ${isActive
                                                        ? 'bg-orange-500 border-orange-400 text-slate-900 shadow-[0_0_10px_rgba(249,115,22,0.5)]'
                                                        : 'bg-slate-800/50 border-white/5 text-slate-500 hover:border-white/20'
                                                        } ${isUpdating ? 'animate-pulse opacity-50' : ''}`}
                                                >
                                                    {dayLabels[d]}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                                <button onClick={() => deleteBreak(brk)} className="p-2 -mr-2 text-slate-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <Trash2 size={16} />
                                </button>
                            </div>
                            <div className="flex flex-col gap-0.5 mb-3">
                                <h4 className="font-bold text-white text-sm">{brk.label}</h4>
                                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-tight">
                                    {brk.days.length === 7 ? 'Daily' : brk.days.length === 5 && !brk.days.includes(0) && !brk.days.includes(6) ? 'Weekdays' : `${brk.days.length} Days Active`}
                                </p>
                            </div>
                            <div className="flex items-center gap-2 text-[10px] font-bold">
                                <span className="bg-slate-800 text-slate-400 px-2 py-1 rounded border border-white/5">{brk.start_time.slice(0, 5)}</span>
                                <span className="text-slate-500">→</span>
                                <span className="bg-slate-800 text-slate-400 px-2 py-1 rounded border border-white/5">{brk.duration_minutes} min</span>
                            </div>
                        </div>
                    ))}
                </div>
            </section>
        </div>
    )
}

export default ScheduleSettings
