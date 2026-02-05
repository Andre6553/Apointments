import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { motion, AnimatePresence } from 'framer-motion'
import { X, User, Clock, Check, Loader2, AlertCircle, Calendar } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { useAvailability } from '../hooks/useAvailability'
import { logTransfer } from '../lib/logger'
import { useAuth } from '../hooks/useAuth'

const TransferResponseModal = ({ isOpen, onClose, notification, onComplete }) => {
    const { profile } = useAuth()
    const [request, setRequest] = useState(null)
    const [appointment, setAppointment] = useState(null)
    const [loading, setLoading] = useState(true)
    const [submitting, setSubmitting] = useState(false)
    const { checkAvailability, findNextSlot, checking } = useAvailability()
    const [conflict, setConflict] = useState(null) // { originalTime, nextTime }

    useEffect(() => {
        if (isOpen && (notification?.data?.transfer_request_id || notification?.data?.appointment_id)) {
            fetchDetails()
        }
    }, [isOpen, notification])

    const fetchDetails = async () => {
        setLoading(true)
        try {
            let aptId = notification.data.appointment_id;

            // 1. Fetch Transfer Request (if any)
            if (notification.data.transfer_request_id) {
                const { data: req, error: reqError } = await supabase
                    .from('transfer_requests')
                    .select('*, sender:profiles!transfer_requests_sender_id_fkey(full_name, email)')
                    .eq('id', notification.data.transfer_request_id)
                    .maybeSingle()

                if (req) {
                    setRequest(req)
                    if (!aptId) aptId = req.appointment_id;
                }
            }

            // 2. Fetch Appointment Details
            if (aptId) {
                const { data: apt, error: aptError } = await supabase
                    .from('appointments')
                    .select('*, client:clients(first_name, last_name, phone)')
                    .eq('id', aptId)
                    .single()

                if (aptError) throw aptError
                setAppointment(apt)
            }
        } catch (error) {
            console.error('Error fetching transfer details:', error)
        } finally {
            setLoading(false)
        }
    }

    const handleAccept = async (overrideTime = null) => {
        setSubmitting(true)
        try {
            const { data: { user } } = await supabase.auth.getUser()

            if (!user) throw new Error('You are not logged in.')
            if (!request) throw new Error('Transfer request data is missing.')
            if (!appointment) throw new Error('Appointment data is missing.')

            // 0. Availability Check (if not overriding)
            const targetTime = overrideTime || (notification.data?.new_scheduled_start || appointment.scheduled_start)

            if (!overrideTime && !conflict) { // Only check if not already resolving a conflict
                const dateStr = targetTime.split('T')[0]
                const timeStr = targetTime.split('T')[1].slice(0, 5)

                const status = await checkAvailability(user.id, dateStr, timeStr, appointment.duration_minutes)

                if (status.status !== 'available') {
                    // Find next slot
                    const next = await findNextSlot(user.id, targetTime, appointment.duration_minutes)

                    if (next.available) {
                        setConflict({
                            originalTime: targetTime,
                            nextTime: next.full,
                            reason: status.status === 'off' ? 'You are off duty' : 'You have another appointment'
                        })
                        setSubmitting(false)
                        return // Stop here to show UI
                    } else {
                        if (!confirm(`You are ${status.status} at this time, and no immediate openings were found. Force accept anyway?`)) {
                            setSubmitting(false)
                            return
                        }
                    }
                }
            }

            // 1. Update Appointment
            const { error: aptError } = await supabase
                .from('appointments')
                .update({
                    assigned_profile_id: user.id,
                    shifted_from_id: request.sender_id,
                    status: 'pending', // Ensure it's pending for the new provider
                    scheduled_start: targetTime // Apply the validated time
                })
                .eq('id', appointment.id)

            if (aptError) throw aptError

            // --- Audit Logging ---
            try {
                await logTransfer('TRANSFER_ACCEPT', {
                    receiverName: profile?.full_name || user.email,
                    clientName: `${appointment.client?.first_name || ''} ${appointment.client?.last_name || ''}`.trim(),
                    senderName: request.sender?.full_name || request.sender?.email,
                    finalTime: targetTime
                }, profile);
            } catch (logErr) {
                console.warn('Accept logging failed:', logErr);
            }

            // 2. Update Transfer Request
            const { error: reqError } = await supabase
                .from('transfer_requests')
                .update({ status: 'accepted' })
                .eq('id', request.id)

            if (reqError) throw reqError

            // 2.5 Resolve all other pending transfers for this appointment
            await supabase
                .from('transfer_requests')
                .update({ status: 'rejected' })
                .eq('appointment_id', appointment.id)
                .eq('status', 'pending')
                .neq('id', request.id);

            // 3. Notify Sender
            await supabase.from('notifications').insert({
                user_id: request.sender_id,
                type: 'transfer_accepted',
                title: 'Transfer Accepted',
                message: `Transfer of ${appointment.client?.first_name || 'Client'} was accepted by ${user.email}${overrideTime ? ' (Rescheduled due to conflict)' : ''}.`,
                data: { appointment_id: appointment.id, receiver_id: user.id }
            })

            onComplete && onComplete()
            onClose()
        } catch (error) {
            console.error('Error accepting transfer:', error)
            alert('Action failed: ' + error.message)
        } finally {
            setSubmitting(false)
        }
    }

    const handleReject = async () => {
        setSubmitting(true)
        try {
            const { data: { user } } = await supabase.auth.getUser()

            // 1. Update Transfer Request
            const { error: reqError } = await supabase
                .from('transfer_requests')
                .update({ status: 'rejected' })
                .eq('id', request.id)

            if (reqError) throw reqError

            // 2. Notify Sender
            await supabase.from('notifications').insert({
                user_id: request.sender_id,
                type: 'transfer_rejected',
                title: 'Transfer Rejected',
                message: `Transfer of ${appointment.client.first_name} was declined.`,
                data: { appointment_id: appointment.id, receiver_id: user.id }
            })

            onComplete && onComplete()
            onClose()
        } catch (error) {
            console.error('Error rejecting transfer:', error)
            alert('Action failed: ' + error.message)
        } finally {
            setSubmitting(false)
        }
    }

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="absolute inset-0 bg-slate-950/80 backdrop-blur-md"
                    />

                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        className="relative w-full max-w-lg glass-card p-0 overflow-hidden shadow-2xl border border-white/10"
                    >
                        {/* Header */}
                        <div className="p-6 border-b border-white/5 bg-white/[0.02] flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="p-2.5 rounded-xl bg-primary/20 border border-primary/20 text-primary">
                                    <Check size={20} />
                                </div>
                                <div>
                                    <h3 className="text-xl font-heading font-bold text-white leading-none">Accept Transfer</h3>
                                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1.5">REVIEW REQUEST</p>
                                </div>
                            </div>
                            <button onClick={onClose} className="p-2 text-slate-500 hover:text-white hover:bg-white/5 rounded-xl transition-all">
                                <X size={20} />
                            </button>
                        </div>

                        <div className="p-8">
                            {loading ? (
                                <div className="p-12 flex flex-col items-center justify-center text-slate-500">
                                    <Loader2 className="w-10 h-10 animate-spin mb-4 text-primary" />
                                    <span className="text-xs font-bold uppercase tracking-widest">Loading details...</span>
                                </div>
                            ) : !appointment ? (
                                <div className="p-12 text-center">
                                    <AlertCircle className="mx-auto text-rose-500 mb-4" size={48} />
                                    <p className="text-white font-bold">Transfer request no longer available.</p>
                                </div>
                            ) : (
                                <div className="space-y-8">
                                    {/* Request Message */}
                                    <div className="flex items-start gap-4 p-4 rounded-2xl bg-primary/5 border border-primary/10">
                                        <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold shrink-0">
                                            {request ? (request.sender?.full_name?.charAt(0) || '?') : 'A'}
                                        </div>
                                        <div>
                                            {request ? (
                                                <p className="text-sm text-slate-300">
                                                    <span className="text-white font-bold">{request.sender?.full_name || request.sender?.email}</span> wants to transfer a client to you.
                                                </p>
                                            ) : (
                                                <p className="text-sm text-slate-300">
                                                    <span className="text-white font-bold">Admin/System</span> has assigned a client to your schedule via Workload Balancing.
                                                </p>
                                            )}
                                        </div>
                                    </div>

                                    {/* Client Box */}
                                    <div className="space-y-3">
                                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Appointment Details</label>
                                        <div className="p-6 rounded-2xl bg-surface border border-white/5 space-y-4">
                                            <div className="flex items-center gap-4">
                                                <div className="w-12 h-12 rounded-xl bg-slate-900 border border-white/5 flex items-center justify-center font-bold text-slate-500">
                                                    <User size={24} />
                                                </div>
                                                <div>
                                                    <p className="text-lg font-heading font-bold text-white leading-tight">
                                                        {appointment.client?.first_name} {appointment.client?.last_name}
                                                    </p>
                                                    <p className="text-xs text-slate-500">{appointment.client?.phone}</p>
                                                </div>
                                            </div>

                                            <div className="flex flex-wrap gap-4 pt-4 border-t border-white/5">
                                                <div className="flex items-center gap-2">
                                                    <Calendar size={14} className="text-primary" />
                                                    <span className="text-xs font-bold text-slate-300">
                                                        {format(parseISO(notification.data?.new_scheduled_start || appointment.scheduled_start), 'EEEE, MMM do')}
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <Clock size={14} className="text-primary" />
                                                    <span className="text-xs font-bold text-slate-300">
                                                        {format(parseISO(notification.data?.new_scheduled_start || appointment.scheduled_start), 'HH:mm')}
                                                        {notification.data?.new_scheduled_start && notification.data.new_scheduled_start !== appointment.scheduled_start && (
                                                            <span className="ml-2 text-[10px] text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20 uppercase tracking-wide">New Time</span>
                                                        )}
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <div className="w-2 h-2 rounded-full bg-indigo-500" />
                                                    <span className="text-xs font-bold text-slate-300">
                                                        {appointment.duration_minutes} min
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {request.status !== 'pending' && (
                                        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-bold flex items-center gap-2">
                                            <AlertCircle size={16} />
                                            This request has already been {request.status}.
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Footer */}
                        <div className="p-6 bg-white/[0.02] border-t border-white/5 flex gap-3">
                            {request && (
                                <button
                                    onClick={handleReject}
                                    disabled={submitting || !request || !appointment}
                                    className="flex-1 px-6 py-4 rounded-xl bg-surface hover:bg-rose-500/10 text-slate-400 hover:text-rose-400 border border-white/5 hover:border-rose-500/20 transition-all font-bold text-sm"
                                >
                                    Decline
                                </button>
                            )}
                            <button
                                onClick={() => request ? handleAccept() : onClose()}
                                disabled={submitting || !appointment || (request && request.status !== 'pending')}
                                className={`${request ? 'flex-[2]' : 'flex-1'} px-6 py-4 rounded-xl bg-primary hover:bg-indigo-600 text-white font-bold text-sm transition-all flex items-center justify-center gap-2 shadow-lg shadow-primary/20 active:scale-[0.98]`}
                            >
                                {submitting ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />}
                                {submitting ? 'Processing...' : (request ? 'Accept Transfer' : 'Acknowledge Receipt')}
                            </button>
                        </div>

                        {/* Conflict Resolution UI */}
                        {conflict && (
                            <div className="absolute inset-0 bg-slate-950 z-[130] flex flex-col items-center justify-center p-8 text-center animate-in fade-in zoom-in-95 duration-200">
                                <div className="w-16 h-16 rounded-full bg-amber-500/10 flex items-center justify-center mb-6 animate-pulse">
                                    <AlertCircle size={32} className="text-amber-500" />
                                </div>
                                <h3 className="text-2xl font-bold text-white mb-2">Schedule Conflict</h3>
                                <p className="text-slate-400 mb-6 max-w-xs">
                                    {conflict.reason}. Allowing this would double-book you.
                                </p>

                                <div className="bg-surface border border-white/5 p-4 rounded-xl w-full mb-6">
                                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">PROPOSED NEW TIME</p>
                                    <p className="text-xl font-bold text-emerald-400 flex items-center justify-center gap-2">
                                        {format(parseISO(conflict.nextTime), 'HH:mm')}
                                        <span className="text-sm text-slate-500 font-normal">
                                            ({format(parseISO(conflict.nextTime), 'EEE, MMM do')})
                                        </span>
                                    </p>
                                </div>

                                <div className="flex gap-3 w-full">
                                    <button
                                        onClick={() => setConflict(null)}
                                        className="flex-1 py-3 rounded-xl bg-surface border border-white/5 text-slate-400 font-bold hover:text-white"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={() => handleAccept(conflict.nextTime)}
                                        className="flex-1 py-3 rounded-xl bg-emerald-500 text-white font-bold hover:bg-emerald-600 shadow-lg shadow-emerald-500/20"
                                    >
                                        Accept @ {format(parseISO(conflict.nextTime), 'HH:mm')}
                                    </button>
                                </div>
                            </div>
                        )}
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    )
}

export default TransferResponseModal
