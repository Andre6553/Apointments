import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { motion, AnimatePresence } from 'framer-motion'
import { X, User, Clock, ArrowRight, Loader2, CheckCircle2, AlertTriangle, Calendar } from 'lucide-react'
import { format, parseISO, isWithinInterval } from 'date-fns'

const TransferModal = ({ isOpen, onClose, appointment, onComplete }) => {
    const [providers, setProviders] = useState([])
    const [selectedProvider, setSelectedProvider] = useState(null)
    const [availability, setAvailability] = useState({ status: 'idle', slots: [] })
    const [loading, setLoading] = useState(false)
    const [submitting, setSubmitting] = useState(false)

    useEffect(() => {
        if (isOpen) {
            fetchProviders()
        }
    }, [isOpen])

    const fetchProviders = async () => {
        setLoading(true)
        try {
            const { data: { user } } = await supabase.auth.getUser()
            const { data, error } = await supabase
                .from('profiles')
                .select('*')
                .neq('id', user.id)

            if (error) throw error
            setProviders(data || [])
        } catch (error) {
            console.error('Error fetching providers:', error)
        } finally {
            setLoading(false)
        }
    }

    const checkProviderAvailability = async (providerId) => {
        setAvailability({ status: 'checking', slots: [] })
        try {
            const dateStr = format(parseISO(appointment.scheduled_start), 'yyyy-MM-dd')
            const dayOfWeek = parseISO(appointment.scheduled_start).getDay()

            // 1. Fetch Working Hours
            const { data: hours } = await supabase
                .from('working_hours')
                .select('*')
                .eq('profile_id', providerId)
                .eq('day_of_week', dayOfWeek)
                .maybeSingle()

            if (!hours || !hours.is_active) {
                setAvailability({ status: 'off', slots: [] })
                return
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

            // Simplistic check for the specific slot
            const aptStart = parseISO(appointment.scheduled_start)
            const aptEnd = new Date(aptStart.getTime() + appointment.duration_minutes * 60000)

            const hasConflict = (apts || []).some(a => {
                const s = parseISO(a.scheduled_start)
                const e = new Date(s.getTime() + a.duration_minutes * 60000)
                return (aptStart < e && aptEnd > s)
            }) || (breaks || []).some(b => {
                const [bh, bm] = b.start_time.split(':').map(Number)
                const s = new Date(aptStart)
                s.setHours(bh, bm, 0, 0)
                const e = new Date(s.getTime() + b.duration_minutes * 60000)
                return (aptStart < e && aptEnd > s)
            })

            setAvailability({ status: hasConflict ? 'busy' : 'available', slots: [] })
        } catch (error) {
            console.error('Error checking availability:', error)
            setAvailability({ status: 'error', slots: [] })
        }
    }

    const handleSelectProvider = (provider) => {
        setSelectedProvider(provider)
        checkProviderAvailability(provider.id)
    }

    const handleTransfer = async () => {
        if (!selectedProvider) return
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
                        sender_id: user.id
                    }
                })

            if (notifError) throw notifError

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
                        className="relative w-full max-w-lg glass-card p-0 overflow-hidden shadow-2xl border border-white/10"
                    >
                        {/* Header */}
                        <div className="p-6 border-b border-white/5 bg-white/[0.02] flex items-center justify-between">
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

                        <div className="p-8 space-y-8">
                            {/* Appointment Summary */}
                            <div className="p-4 rounded-2xl bg-surface border border-white/5 relative overflow-hidden group">
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
                                                    <p className={`text-sm font-bold transition-colors ${selectedProvider?.id === p.id ? 'text-white' : 'text-slate-300 group-hover:text-white'}`}>
                                                        {p.full_name || p.email}
                                                    </p>
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
                        </div>

                        {/* Footer */}
                        <div className="p-6 bg-white/[0.02] border-t border-white/5 flex gap-3">
                            <button
                                onClick={onClose}
                                className="flex-1 px-6 py-4 rounded-xl bg-surface text-slate-400 hover:text-white border border-white/5 transition-all font-bold text-sm"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleTransfer}
                                disabled={!selectedProvider || availability.status !== 'available' || submitting}
                                className={`flex-[2] px-6 py-4 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2
                                    ${!selectedProvider || availability.status !== 'available' || submitting
                                        ? 'bg-slate-800 text-slate-500 cursor-not-allowed opacity-50'
                                        : 'bg-primary text-white hover:bg-indigo-600 shadow-lg shadow-primary/20 active:scale-[0.98]'
                                    }
                                `}
                            >
                                {submitting ? <Loader2 size={18} className="animate-spin" /> : <ArrowRight size={18} />}
                                {submitting ? 'Sending Request...' : 'Send Transfer Request'}
                            </button>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    )
}

export default TransferModal
