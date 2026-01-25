import { useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { parseISO, format, addMinutes, isAfter, setHours, setMinutes, startOfMinute } from 'date-fns'

export const useAvailability = () => {
    const [checking, setChecking] = useState(false)

    const checkAvailability = useCallback(async (providerId, checkDate, checkTime, durationMinutes = 30) => {
        setChecking(true)
        try {
            const dateStr = checkDate
            const timeStr = checkTime
            const fullStart = parseISO(`${dateStr}T${timeStr}`)
            const fullEnd = addMinutes(fullStart, durationMinutes)
            const dayOfWeek = fullStart.getDay()

            // 1. Fetch Working Hours
            const { data: hours } = await supabase
                .from('working_hours')
                .select('*')
                .eq('profile_id', providerId)
                .eq('day_of_week', dayOfWeek)
                .maybeSingle()

            if (!hours || !hours.is_active) {
                return { status: 'off', conflict: 'Outside working hours or off duty' }
            }

            // Check if time is within start/end
            const [startH, startM] = hours.start_time.split(':').map(Number)
            const [endH, endM] = hours.end_time.split(':').map(Number)

            const workStart = setMinutes(setHours(new Date(fullStart), startH), startM)
            const workEnd = setMinutes(setHours(new Date(fullStart), endH), endM)

            if (fullStart < workStart || fullEnd > workEnd) {
                return { status: 'off', conflict: 'Outside working hours' }
            }

            // 2. Fetch Existing Appointments
            const { data: apts } = await supabase
                .from('appointments')
                .select('scheduled_start, duration_minutes')
                .eq('assigned_profile_id', providerId)
                .neq('status', 'cancelled')
                .gte('scheduled_start', `${dateStr}T00:00:00`)
                .lte('scheduled_start', `${dateStr}T23:59:59`)

            // 3. Fetch Breaks
            const { data: breaks } = await supabase
                .from('breaks')
                .select('start_time, duration_minutes')
                .eq('profile_id', providerId)
                .eq('day_of_week', dayOfWeek)

            // Overlap Check
            const hasConflict = (apts || []).some(a => {
                const s = parseISO(a.scheduled_start)
                const e = addMinutes(s, a.duration_minutes)
                return (fullStart < e && fullEnd > s)
            }) || (breaks || []).some(b => {
                const [bh, bm] = b.start_time.split(':').map(Number)
                const s = setMinutes(setHours(new Date(fullStart), bh), bm)
                const e = addMinutes(s, b.duration_minutes)
                return (fullStart < e && fullEnd > s)
            })

            return { status: hasConflict ? 'busy' : 'available' }
        } catch (error) {
            console.error('Availability check failed:', error)
            return { status: 'error', error }
        } finally {
            setChecking(false)
        }
    }, [])

    const findNextSlot = useCallback(async (providerId, startDate, duration = 30) => {
        let current = new Date(startDate)
        // Try next 24 hours
        // Round to next 15 min
        const remainder = 15 - (current.getMinutes() % 15)
        current = addMinutes(current, remainder)

        for (let i = 0; i < 48; i++) { // Check up to 12 hours ahead in 15min increments
            const dateStr = format(current, 'yyyy-MM-dd')
            const timeStr = format(current, 'HH:mm')

            const result = await checkAvailability(providerId, dateStr, timeStr, duration)
            if (result.status === 'available') {
                return { available: true, date: dateStr, time: timeStr, full: `${dateStr}T${timeStr}:00` }
            }
            current = addMinutes(current, 15)
        }
        return { available: false }
    }, [checkAvailability])

    return { checkAvailability, findNextSlot, checking }
}
