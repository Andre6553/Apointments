import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { motion, AnimatePresence } from 'framer-motion'
import { X, User, Clock, Check, Loader2, AlertCircle, Calendar } from 'lucide-react'
import { format, parseISO } from 'date-fns'

const TransferResponseModal = ({ isOpen, onClose, notification, onComplete }) => {
    const [request, setRequest] = useState(null)
    const [appointment, setAppointment] = useState(null)
    const [loading, setLoading] = useState(true)
    const [submitting, setSubmitting] = useState(false)

    useEffect(() => {
        if (isOpen && notification?.data?.transfer_request_id) {
            fetchDetails()
        }
    }, [isOpen, notification])

    const fetchDetails = async () => {
        setLoading(true)
        try {
            // 1. Fetch Transfer Request
            const { data: req, error: reqError } = await supabase
                .from('transfer_requests')
                .select('*, sender:profiles!transfer_requests_sender_id_fkey(full_name, email)')
                .eq('id', notification.data.transfer_request_id)
                .single()

            if (reqError) throw reqError
            setRequest(req)

            // 2. Fetch Appointment Details
            const { data: apt, error: aptError } = await supabase
                .from('appointments')
                .select('*, client:clients(first_name, last_name, phone)')
                .eq('id', req.appointment_id)
                .single()

            if (aptError) throw aptError
            setAppointment(apt)
        } catch (error) {
            console.error('Error fetching transfer details:', error)
        } finally {
            setLoading(false)
        }
    }

    const handleAccept = async () => {
        setSubmitting(true)
        try {
            const { data: { user } } = await supabase.auth.getUser()

            // 1. Update Appointment
            const { error: aptError } = await supabase
                .from('appointments')
                .update({
                    assigned_profile_id: user.id,
                    shifted_from_id: request.sender_id,
                    status: 'pending' // Ensure it's pending for the new provider
                })
                .eq('id', appointment.id)

            if (aptError) throw aptError

            // 2. Update Transfer Request
            const { error: reqError } = await supabase
                .from('transfer_requests')
                .update({ status: 'accepted' })
                .eq('id', request.id)

            if (reqError) throw reqError

            // 3. Notify Sender
            await supabase.from('notifications').insert({
                user_id: request.sender_id,
                type: 'transfer_accepted',
                title: 'Transfer Accepted',
                message: `Transfer of ${appointment.client.first_name} was accepted by ${user.email}.`,
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
                            ) : !request || !appointment ? (
                                <div className="p-12 text-center">
                                    <AlertCircle className="mx-auto text-rose-500 mb-4" size={48} />
                                    <p className="text-white font-bold">Transfer request no longer available.</p>
                                </div>
                            ) : (
                                <div className="space-y-8">
                                    {/* Request Message */}
                                    <div className="flex items-start gap-4 p-4 rounded-2xl bg-primary/5 border border-primary/10">
                                        <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold shrink-0">
                                            {request.sender?.full_name?.charAt(0) || '?'}
                                        </div>
                                        <div>
                                            <p className="text-sm text-slate-300">
                                                <span className="text-white font-bold">{request.sender?.full_name || request.sender?.email}</span> wants to transfer a client to you.
                                            </p>
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
                                                        {format(parseISO(appointment.scheduled_start), 'EEEE, MMM do')}
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <Clock size={14} className="text-primary" />
                                                    <span className="text-xs font-bold text-slate-300">
                                                        {format(parseISO(appointment.scheduled_start), 'HH:mm')}
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
                            <button
                                onClick={handleReject}
                                disabled={submitting || request?.status !== 'pending'}
                                className="flex-1 px-6 py-4 rounded-xl bg-surface hover:bg-rose-500/10 text-slate-400 hover:text-rose-400 border border-white/5 hover:border-rose-500/20 transition-all font-bold text-sm"
                            >
                                Decline
                            </button>
                            <button
                                onClick={handleAccept}
                                disabled={submitting || request?.status !== 'pending'}
                                className="flex-[2] px-6 py-4 rounded-xl bg-primary hover:bg-indigo-600 text-white font-bold text-sm transition-all flex items-center justify-center gap-2 shadow-lg shadow-primary/20 active:scale-[0.98]"
                            >
                                {submitting ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />}
                                {submitting ? 'Processing...' : 'Accept Transfer'}
                            </button>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    )
}

export default TransferResponseModal
