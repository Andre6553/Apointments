import { supabase } from './supabase'
import { sendWhatsApp } from './notifications'

/**
 * Calculates and applies delays to subsequent appointments.
 * @param {string} appointmentId - The ID of the appointment that just started/ended.
 * @param {string} actualTime - ISO string of the actual start/end time.
 */
export const calculateAndApplyDelay = async (appointmentId, actualTime) => {
    // 1. Get the current appointment details
    const { data: currentApt, error: fetchError } = await supabase
        .from('appointments')
        .select('*')
        .eq('id', appointmentId)
        .single()

    if (fetchError || !currentApt) return

    const scheduledStart = new Date(currentApt.scheduled_start)
    const actualStart = new Date(actualTime)

    // Calculate delay in minutes
    const delayMinutes = Math.max(0, Math.floor((actualStart - scheduledStart) / 60000))

    if (delayMinutes <= 5) return // Ignore small delays

    // 2. Find all subsequent PENDING appointments for this provider today
    const { data: subsequentApts, error: subError } = await supabase
        .from('appointments')
        .select('*, client:clients(first_name, phone)')
        .eq('assigned_profile_id', currentApt.assigned_profile_id)
        .eq('status', 'pending')
        .gt('scheduled_start', currentApt.scheduled_start)
        .order('scheduled_start', { ascending: true })

    if (subError || !subsequentApts.length) return

    // 3. Update delays in Database
    const updates = subsequentApts.map(apt => ({
        id: apt.id,
        delay_minutes: delayMinutes
    }))

    const { error: updateError } = await supabase
        .from('appointments')
        .upsert(updates)

    if (updateError) console.error('Error updating subsequent delays:', updateError)

    // 4. Notify Clients (Triggering the "Link" Phase - Twilio)
    // In a production app, this should be done via Edge Functions for security.
    // We will call a "notify" utility here.
    for (const apt of subsequentApts) {
        await sendDelayNotification(apt.client, delayMinutes, apt.scheduled_start)
    }
}

const sendDelayNotification = async (client, delayMinutes, scheduledStart) => {
    const originalTime = new Date(scheduledStart).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    const newTime = new Date(new Date(scheduledStart).getTime() + delayMinutes * 60000)
        .toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

    const message = `Hi ${client.first_name}, friendly reminder from Tracker! We are running about ${delayMinutes} mins late today. Your ${originalTime} appointment is now scheduled for ${newTime}. Sorry for the wait!`

    return await sendWhatsApp(client?.phone, message)
}
