import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { motion, AnimatePresence } from 'framer-motion'
import { useAvailability } from '../hooks/useAvailability'
import { useAuth } from '../hooks/useAuth'
import { X, User, Clock, ArrowRight, Loader2, CheckCircle2, AlertTriangle, Calendar } from 'lucide-react'
import { format, parseISO, isWithinInterval } from 'date-fns'
import { logTransfer } from '../lib/logger'

const TransferModal = ({ isOpen, onClose, appointment, onComplete }) => {
    const { profile } = useAuth()
    const [providers, setProviders] = useState([])
    const [selectedProvider, setSelectedProvider] = useState(null)
    const [availability, setAvailability] = useState({ status: 'idle', slots: [] })
    const [loading, setLoading] = useState(false)
    const [submitting, setSubmitting] = useState(false)
    const [showConfirm, setShowConfirm] = useState(false) // Toggle for conflict confirm
    const [transferDate, setTransferDate] = useState('')
    const [transferTime, setTransferTime] = useState('')
    const [reason, setReason] = useState('')

    useEffect(() => {
        if (isOpen) {
            fetchProviders()
            setAvailability({ status: 'idle', slots: [] })
            setSelectedProvider(null)
            setShowConfirm(false)
            setTransferDate(format(parseISO(appointment.scheduled_start), 'yyyy-MM-dd'))
            setTransferTime(format(parseISO(appointment.scheduled_start), 'HH:mm'))
            setReason('')
        }
    }, [isOpen])

    const fetchProviders = async () => {
        setLoading(true)
        try {
            if (!profile?.business_id) return

            const { data, error } = await supabase
                .from('profiles')
                .select('*')
                .neq('id', profile.id)
                .eq('business_id', profile.business_id)
                .eq('accepts_transfers', true)
                .order('full_name')

            if (error) throw error
            setProviders(data || [])
        } catch (error) {
            console.error('Error fetching providers:', error)
        } finally {
            setLoading(false)
        }
    }

    const { checkAvailability, checking } = useAvailability()

    const handleSelectProvider = async (provider) => {
        setSelectedProvider(provider)
        const result = await checkAvailability(provider.id, transferDate, transferTime, appointment.duration_minutes)
        setAvailability({ status: result.status, slots: [] })
        setShowConfirm(false)
    }


    const onTransferClick = () => {
        if (!selectedProvider) return
        if (availability.status === 'available') {
            handleTransfer()
        } else {
            setShowConfirm(true)
        }
    }

    const handleTransfer = async () => {
        setSubmitting(true)
        try {
            const { data: { user } } = await supabase.auth.getUser()

            // 1. Create transfer request
            const { data: request, error: reqError } = await supabase
                .from('transfer_requests')
                .insert({
                    appointment_id: appointment.id,
                    sender_id: user.id,
                    receiver_id: selectedProvider.id,
                    status: 'pending'
                })
                .select()
                .single()

            if (reqError) throw reqError

            // 2. Create notification for receiver
            const { error: notifError } = await supabase
                .from('notifications')
                .insert({
                    user_id: selectedProvider.id,
                    type: 'transfer_request',
                    title: 'New Transfer Request',
                    message: `${appointment.client?.first_name} ${appointment.client?.last_name} transfer requested.`,
                    data: {
                        transfer_request_id: request.id,
                        appointment_id: appointment.id,
                        sender_id: user.id,
                        new_scheduled_start: `${transferDate}T${transferTime}:00`,
                        reason: reason
                    }
                })

            if (notifError) throw notifError

            // --- Audit Logging ---
            try {
                const requiredSkills = appointment.required_skills || [];
                const providerSkills = selectedProvider.skills || [];
                const hasSkills = requiredSkills.every(req => providerSkills.includes(req));

                await logTransfer('TRANSFER_REQUEST', {
                    senderName: profile.full_name || profile.email,
                    receiverName: selectedProvider.full_name || selectedProvider.email,
                    clientName: `${appointment.client?.first_name || ''} ${appointment.client?.last_name || ''}`.trim(),
                    reason: reason,
                    hasSkills: hasSkills,
                    newTime: `${transferDate} ${transferTime}`
                }, profile);
            } catch (logErr) {
                console.warn('Transfer logging failed:', logErr);
            }

            onComplete && onComplete()
            onClose()
        } catch (error) {
            console.error('Error during transfer:', error)
            alert('Transfer failed: ' + error.message)
        } finally {
            setSubmitting(false)
        }
    }

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
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
                        className="relative w-full max-w-lg glass-card p-0 overflow-hidden shadow-2xl border border-white/10 flex flex-col max-h-[90vh]"
                    >
                        {/* Header */}
                        <div className="p-6 border-b border-white/5 bg-white/[0.02] flex items-center justify-between shrink-0">
                            <div className="flex items-center gap-3">
                                <div className="p-2.5 rounded-xl bg-primary/20 border border-primary/20 text-primary">
                                    <ArrowRight size={20} />
                                </div>
                                <div>
                                    <h3 className="text-xl font-heading font-bold text-white leading-none">Transfer Client</h3>
                                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1.5">REASSIGN APPOINTMENT</p>
                                </div>
                            </div>
                            <button onClick={onClose} className="p-2 text-slate-500 hover:text-white hover:bg-white/5 rounded-xl transition-all">
                                <X size={20} />
                            </button>
                        </div>

                        {showConfirm ? (
                            <div className="p-8 flex flex-col items-center text-center space-y-6 flex-grow justify-center">
                                <div className="w-20 h-20 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mb-2 animate-pulse">
                                    <AlertTriangle size={40} className="text-amber-500" />
                                </div>
                                <div>
                                    <h4 className="text-xl font-bold text-white mb-2">
                                        Provider is {availability.status === 'off' ? 'Off Duty' : 'Busy'}
                                    </h4>
                                    <p className="text-slate-400 text-sm max-w-xs mx-auto">
                                        {selectedProvider?.full_name} is marked as
                                        <span className="text-white font-bold"> {availability.status === 'off' ? 'Off Duty' : 'Busy'} </span>
                                        at this time. Do you want to proceed with the transfer request anyway?
                                    </p>
                                </div>
                                <div className="flex gap-3 w-full pt-4">
                                    <button
                                        onClick={() => setShowConfirm(false)}
                                        className="flex-1 py-3 rounded-xl bg-surface border border-white/5 text-slate-400 font-bold hover:text-white hover:bg-white/5 transition-all"
                                    >
                                        No, Cancel
                                    </button>
                                    <button
                                        onClick={handleTransfer}
                                        className="flex-1 py-3 rounded-xl bg-amber-500 text-white font-bold hover:bg-amber-600 shadow-lg shadow-amber-500/20 transition-all"
                                    >
                                        Yes, Continue
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <>
                                <div className="p-6 space-y-6 overflow-y-auto flex-grow scrollbar-hide">
                                    {/* Appointment Summary */}
                                    <div className="p-4 rounded-2xl bg-surface border border-white/5 relative overflow-hidden group shrink-0">
                                        <div className="absolute inset-y-0 left-0 w-1 bg-primary/50" />
                                        <div className="flex items-center gap-4">
                                            <div className="w-12 h-12 rounded-xl bg-slate-900 border border-white/5 flex items-center justify-center font-bold text-slate-500">
                                                <User size={20} />
                                            </div>
                                            <div>
                                                <p className="text-sm font-bold text-white">{appointment.client?.first_name} {appointment.client?.last_name}</p>
                                                <div className="flex items-center gap-3 mt-1 underline-none">
                                                    <span className="flex items-center gap-1.5 text-[10px] text-slate-400 font-bold">
                                                        <Calendar size={12} className="text-primary" />
                                                        {format(parseISO(appointment.scheduled_start), 'MMM do')}
                                                    </span>
                                                    <span className="flex items-center gap-1.5 text-[10px] text-slate-400 font-bold">
                                                        <Clock size={12} className="text-primary" />
                                                        {format(parseISO(appointment.scheduled_start), 'HH:mm')}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Provider Selection */}
                                    <div className="space-y-4">
                                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Select Receiver Provider</label>
                                        <div className="grid gap-3">
                                            {loading ? (
                                                <div className="p-12 flex flex-col items-center justify-center text-slate-500">
                                                    <Loader2 className="w-8 h-8 animate-spin mb-3 text-primary" />
                                                    <span className="text-xs font-bold uppercase tracking-widest">Searching providers...</span>
                                                </div>
                                            ) : providers.map(p => (
                                                <button
                                                    key={p.id}
                                                    onClick={() => handleSelectProvider(p)}
                                                    className={`flex items-center justify-between p-4 rounded-2xl border transition-all duration-300 group
                                                    ${selectedProvider?.id === p.id
                                                            ? 'bg-primary/10 border-primary/40 shadow-glow shadow-primary/5'
                                                            : p.is_online
                                                                ? 'bg-emerald-500/5 border-emerald-500/30 hover:border-emerald-500/50 hover:bg-emerald-500/10'
                                                                : 'bg-surface/50 border-white/5 hover:border-white/10 hover:bg-surface'}
                                                `}
                                                >
                                                    <div className="flex items-center gap-4">
                                                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center font-bold text-sm border transition-colors
                                                        ${selectedProvider?.id === p.id ? 'bg-primary border-primary text-white' : 'bg-slate-900 border-white/5 text-slate-500'}
                                                    `}>
                                                            {p.full_name?.charAt(0) || p.email?.charAt(0).toUpperCase()}
                                                        </div>
                                                        <div className="text-left">
                                                            <div className="flex items-center gap-2">
                                                                <p className={`text-sm font-bold transition-colors ${selectedProvider?.id === p.id ? 'text-white' : 'text-slate-300 group-hover:text-white'}`}>
                                                                    {p.full_name || p.email}
                                                                </p>
                                                                {p.is_online && (
                                                                    <span className="flex h-2 w-2 relative">
                                                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                                                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <p className="text-[10px] text-slate-500 font-medium">{p.role || 'Staff'}</p>
                                                        </div>
                                                    </div>

                                                    {selectedProvider?.id === p.id && (
                                                        <div className="flex items-center gap-2">
                                                            {availability.status === 'checking' && <Loader2 size={16} className="animate-spin text-slate-500" />}
                                                            {availability.status === 'available' && <span className="text-[10px] font-bold text-emerald-400 bg-emerald-400/10 px-2 py-1 rounded-lg border border-emerald-400/20">AVAILABLE</span>}
                                                            {availability.status === 'busy' && <span className="text-[10px] font-bold text-rose-400 bg-rose-400/10 px-2 py-1 rounded-lg border border-rose-400/20">BUSY</span>}
                                                            {availability.status === 'off' && <span className="text-[10px] font-bold text-slate-500 bg-slate-500/10 px-2 py-1 rounded-lg border border-slate-500/20">OFF DUTY</span>}
                                                        </div>
                                                    )}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Reason for Transfer */}
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Reason for Transfer</label>
                                        <textarea
                                            value={reason}
                                            onChange={(e) => setReason(e.target.value)}
                                            placeholder="Why are you transferring this client? (e.g., rescheduling, specialist required...)"
                                            className="glass-input w-full min-h-[80px] py-3 text-sm resize-none"
                                            required
                                        />
                                    </div>

                                    {/* Reschedule Options */}
                                    <div className="space-y-4 pt-4 border-t border-white/5">
                                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Proposed Time</label>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                                <label className="text-xs font-bold text-slate-400 ml-1">Date</label>
                                                <input
                                                    type="date"
                                                    value={transferDate}
                                                    onChange={(e) => {
                                                        setTransferDate(e.target.value)
                                                        if (selectedProvider) checkProviderAvailability(selectedProvider.id, e.target.value, transferTime)
                                                    }}
                                                    className="glass-input w-full"
                                                    min={new Date().toISOString().split('T')[0]}
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-xs font-bold text-slate-400 ml-1">Time</label>
                                                <input
                                                    type="time"
                                                    value={transferTime}
                                                    onChange={(e) => {
                                                        setTransferTime(e.target.value)
                                                        if (selectedProvider) checkProviderAvailability(selectedProvider.id, transferDate, e.target.value)
                                                    }}
                                                    className="glass-input w-full"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Footer */}
                                <div className="p-6 bg-white/[0.02] border-t border-white/5 flex gap-3 shrink-0">
                                    <button
                                        onClick={onClose}
                                        className="flex-1 px-6 py-4 rounded-xl bg-surface text-slate-400 hover:text-white border border-white/5 transition-all font-bold text-sm"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={onTransferClick}
                                        disabled={!selectedProvider || availability.status === 'checking' || submitting}
                                        className={`flex-[2] px-6 py-4 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2
                                    ${!selectedProvider || availability.status === 'checking' || submitting
                                                ? 'bg-slate-800 text-slate-500 cursor-not-allowed opacity-50'
                                                : 'bg-primary text-white hover:bg-indigo-600 shadow-lg shadow-primary/20 active:scale-[0.98]'
                                            }
                                `}
                                    >
                                        {submitting ? <Loader2 size={18} className="animate-spin" /> : <ArrowRight size={18} />}
                                        {submitting ? 'Sending Request...' : 'Send Transfer Request'}
                                    </button>
                                </div>
                            </>
                        )}
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    )
}

export default TransferModal
