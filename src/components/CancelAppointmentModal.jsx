
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, AlertTriangle, UserMinus, Clock, CalendarX, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useToast } from '../contexts/ToastContext';
import { logAppointment } from '../lib/logger';
import { useAuth } from '../hooks/useAuth';

const CancelAppointmentModal = ({ isOpen, onClose, appointment, onRefresh }) => {
    const { profile } = useAuth();
    const [loading, setLoading] = useState(false);
    const [reason, setReason] = useState('Client cancel');
    const showToast = useToast();

    if (!appointment) return null;

    const reasons = [
        { id: 'cancelled', label: 'Client cancel', icon: UserMinus, color: 'text-red-400', bg: 'bg-red-400/10' },
        { id: 'noshow', label: 'Client did not show up', icon: Clock, color: 'text-amber-400', bg: 'bg-amber-400/10' },
        { id: 'shifted', label: 'Client postponed', icon: CalendarX, color: 'text-blue-400', bg: 'bg-blue-400/10' },
    ];

    const handleCancel = async () => {
        setLoading(true);
        try {
            const selectedReason = reasons.find(r => r.label === reason);
            const status = selectedReason ? selectedReason.id : 'cancelled';

            const { error } = await supabase
                .from('appointments')
                .update({
                    status,
                    cancellation_reason: reason
                })
                .eq('id', appointment.id);

            if (error) throw error;

            // Audit Logging
            try {
                await logAppointment(
                    appointment,
                    appointment.provider || profile,
                    appointment.client,
                    profile,
                    status.toUpperCase(),
                    { reason: reason }
                );
            } catch (logErr) {
                console.warn('[CancelModal] Logging failed:', logErr);
            }

            showToast(`Appointment ${status === 'noshow' ? 'marked as no-show' : 'cancelled'}`, 'success');
            onRefresh && onRefresh();
            onClose();
        } catch (error) {
            console.error('Error cancelling appointment:', error);
            showToast('Failed to cancel appointment', 'error');
        } finally {
            setLoading(false);
        }
    };

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
                        className="relative w-full max-w-md glass-card p-0 overflow-hidden shadow-2xl border border-white/10"
                    >
                        {/* Header */}
                        <div className="p-6 border-b border-white/5 bg-white/[0.02] flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="p-2.5 rounded-xl bg-red-500/20 border border-red-500/20 text-red-500">
                                    <AlertTriangle size={20} />
                                </div>
                                <div>
                                    <h3 className="text-xl font-heading font-bold text-white leading-none">Cancel Session</h3>
                                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1.5">REASON REQUIRED</p>
                                </div>
                            </div>
                            <button onClick={onClose} className="p-2 text-slate-500 hover:text-white hover:bg-white/5 rounded-xl transition-all">
                                <X size={20} />
                            </button>
                        </div>

                        <div className="p-6 space-y-6">
                            <div className="bg-surface/50 p-4 rounded-2xl border border-white/5">
                                <p className="text-sm text-slate-400 mb-1">Appointment for:</p>
                                <p className="text-lg font-bold text-white">
                                    {appointment.client?.first_name} {appointment.client?.last_name}
                                </p>
                            </div>

                            <div className="space-y-3">
                                <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">Select Reason</label>
                                <div className="grid gap-2">
                                    {reasons.map((r) => (
                                        <button
                                            key={r.id}
                                            onClick={() => setReason(r.label)}
                                            className={`
                                                flex items-center gap-4 p-4 rounded-xl border transition-all text-left
                                                ${reason === r.label
                                                    ? `border-${r.id === 'cancelled' ? 'red' : r.id === 'noshow' ? 'amber' : 'blue'}-500/50 bg-${r.id === 'cancelled' ? 'red' : r.id === 'noshow' ? 'amber' : 'blue'}-500/10`
                                                    : 'border-white/5 bg-slate-900/50 hover:bg-white/5 hover:border-white/10'}
                                            `}
                                        >
                                            <div className={`p-2 rounded-lg ${r.bg} ${r.color}`}>
                                                <r.icon size={18} />
                                            </div>
                                            <span className={`font-bold text-sm ${reason === r.label ? 'text-white' : 'text-slate-400'}`}>
                                                {r.label}
                                            </span>
                                            {reason === r.label && (
                                                <div className="ml-auto w-2 h-2 rounded-full bg-current" style={{ color: r.color.includes('red') ? '#f87171' : r.color.includes('amber') ? '#fbbf24' : '#60a5fa' }} />
                                            )}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="flex gap-3 pt-2">
                                <button
                                    onClick={onClose}
                                    className="flex-1 py-3 rounded-xl bg-surface border border-white/5 text-slate-400 font-bold hover:text-white transition-all text-sm"
                                >
                                    Go Back
                                </button>
                                <button
                                    onClick={handleCancel}
                                    disabled={loading}
                                    className="flex-[2] py-3 rounded-xl bg-red-500 hover:bg-red-600 text-white font-bold transition-all flex items-center justify-center gap-2 shadow-lg shadow-red-500/20 text-sm"
                                >
                                    {loading ? <Loader2 size={18} className="animate-spin" /> : <CalendarX size={18} />}
                                    Confirm Cancellation
                                </button>
                            </div>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
};

export default CancelAppointmentModal;
