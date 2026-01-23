import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { motion, AnimatePresence } from 'framer-motion';
import { format, isSameDay } from 'date-fns';
import { useAuth } from '../hooks/useAuth';
import AddAppointmentModal from './AddAppointmentModal';
import { Edit2, Play, Square, AlertCircle, Clock, ArrowRight, Plus, Timer, Calendar as CalendarIcon, Loader2, CheckCircle2 } from 'lucide-react';
import TransferModal from './TransferModal';
import { calculateAndApplyDelay } from '../lib/delayEngine';
import { getCache, setCache, CACHE_KEYS } from '../lib/cache';

const AppointmentList = () => {
    const { user, profile } = useAuth();
    const [appointments, setAppointments] = useState(() => getCache(CACHE_KEYS.APPOINTMENTS) || []);
    const [loading, setLoading] = useState(!getCache(CACHE_KEYS.APPOINTMENTS));
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isTransferOpen, setIsTransferOpen] = useState(false);
    const [editData, setEditData] = useState(null);
    const [selectedApt, setSelectedApt] = useState(null);

    const fetchAppointments = async (silent = false, useOptimistic = false) => {
        if (useOptimistic) {
            const cached = getCache(CACHE_KEYS.APPOINTMENTS);
            if (cached) setAppointments(cached);
        }
        if (!silent) setLoading(true);
        const { data, error } = await supabase
            .from('appointments')
            .select(`
                *,
                client:clients(first_name, last_name, phone),
                provider:profiles!appointments_assigned_profile_id_fkey(full_name)
            `)
            .or(`status.eq.active,status.eq.pending`)
            .order('scheduled_start', { ascending: true });

        if (data) {
            setAppointments(data);
            setCache(CACHE_KEYS.APPOINTMENTS, data);
        }
        setLoading(false);
    };

    useEffect(() => {
        if (!user) return;
        fetchAppointments();

        const channel = supabase.channel('list-updates')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments' }, () => fetchAppointments(true))
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [user]);

    const startAppointment = async (id) => {
        const startTime = new Date().toISOString();
        const { error } = await supabase
            .from('appointments')
            .update({ actual_start: startTime, status: 'active' })
            .eq('id', id);

        if (!error) {
            await calculateAndApplyDelay(id, startTime);
            fetchAppointments();
        }
    };

    const endAppointment = async (id) => {
        const { error } = await supabase
            .from('appointments')
            .update({ actual_end: new Date().toISOString(), status: 'completed' })
            .eq('id', id);
        if (!error) fetchAppointments();
    };

    return (
        <div className="space-y-8">
            {/* Actions Bar */}
            <div className="flex flex-col sm:flex-row justify-between items-end gap-4">
                <div className="flex items-center gap-2">
                    <div className="h-8 w-1 bg-gradient-to-b from-primary to-transparent rounded-full" />
                    <h3 className="text-xl font-heading font-bold text-white">Upcoming Sessions</h3>
                </div>
                <button
                    onClick={() => setIsModalOpen(true)}
                    className="w-full sm:w-auto bg-primary hover:bg-indigo-600 text-white px-6 py-3 rounded-xl font-bold transition-all shadow-lg shadow-primary/20 hover:shadow-primary/40 active:scale-95 flex items-center justify-center gap-2 text-sm group"
                >
                    <div className="bg-white/20 p-1 rounded-lg group-hover:scale-110 transition-transform">
                        <Plus size={16} />
                    </div>
                    New Appointment
                </button>
            </div>

            <AddAppointmentModal
                isOpen={isModalOpen}
                onClose={() => { setIsModalOpen(false); setEditData(null); }}
                onRefresh={fetchAppointments}
                editData={editData}
            />

            {selectedApt && (
                <TransferModal
                    isOpen={isTransferOpen}
                    onClose={() => { setIsTransferOpen(false); setSelectedApt(null); }}
                    appointment={selectedApt}
                    onComplete={fetchAppointments}
                />
            )}

            <div className="space-y-4">
                {loading ? (
                    <div className="flex flex-col items-center py-32 text-slate-500">
                        <div className="relative">
                            <div className="absolute inset-0 bg-primary/20 blur-xl rounded-full animate-pulse" />
                            <Loader2 className="w-12 h-12 animate-spin relative z-10 text-primary" />
                        </div>
                        <p className="text-sm font-bold tracking-widest uppercase mt-6 opacity-70">Loading Schedule...</p>
                    </div>
                ) : appointments.length === 0 ? (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="glass-card border-dashed border-white/10 p-20 text-center relative overflow-hidden group"
                    >
                        <div className="absolute inset-0 bg-gradient-to-b from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                        <div className="relative z-10 flex flex-col items-center">
                            <div className="w-20 h-20 bg-surface rounded-3xl flex items-center justify-center mb-6 shadow-inner border border-white/5 group-hover:scale-110 transition-transform duration-500">
                                <CalendarIcon size={40} className="text-slate-600 group-hover:text-primary transition-colors duration-300" />
                            </div>
                            <h3 className="text-2xl font-heading font-bold text-white mb-2">Schedule Empty</h3>
                            <p className="text-slate-400 max-w-sm mx-auto">No appointments scheduled for today. Click the button above to add your first client session.</p>
                        </div>
                    </motion.div>
                ) : (
                    <div className="grid gap-4">
                        {appointments.map((apt, index) => (
                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: index * 0.1 }}
                                key={apt.id}
                                className={`
                                    relative glass-card group overflow-hidden transition-all duration-300 hover:border-white/10 hover:translate-x-1
                                    ${apt.status === 'active' ? 'border-primary/50 bg-primary/5 shadow-glow' : ''}
                                `}
                            >
                                {/* Active Status Indicator */}
                                {apt.status === 'active' && (
                                    <>
                                        <div className="absolute top-0 left-0 bottom-0 w-1 bg-primary shadow-[0_0_15px_rgba(99,102,241,0.6)]" />
                                        <div className="absolute top-4 right-4 flex items-center gap-2 px-3 py-1 rounded-full bg-primary/20 border border-primary/20 text-primary text-[10px] font-bold uppercase tracking-widest animate-pulse">
                                            <div className="w-2 h-2 rounded-full bg-primary" />
                                            Live Session
                                        </div>
                                    </>
                                )}
                                {isSameDay(new Date(apt.scheduled_start), new Date()) && apt.status === 'pending' && (
                                    <div className="absolute top-4 right-4 px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 text-amber-500 text-[8px] font-bold uppercase tracking-widest">
                                        Today
                                    </div>
                                )}

                                <div className="p-6 flex flex-col md:flex-row md:items-center gap-6 md:gap-8">
                                    {/* Time Block */}
                                    <div className="flex items-center gap-6 min-w-[140px]">
                                        <div className={`
                                            w-20 h-20 rounded-2xl flex flex-col items-center justify-center border transition-all duration-300 relative overflow-hidden
                                            ${apt.status === 'active'
                                                ? 'bg-gradient-to-br from-primary to-indigo-600 border-primary/50 text-white shadow-lg'
                                                : 'bg-surface border-white/5 text-slate-400 group-hover:border-white/10 group-hover:bg-surface/80'}
                                        `}>
                                            <span className="text-[10px] font-bold uppercase tracking-widest opacity-60 mb-0.5">Start</span>
                                            <span className="text-2xl font-heading font-bold tracking-tight">{format(new Date(apt.scheduled_start), 'HH:mm')}</span>
                                        </div>

                                        <div className="md:hidden">
                                            <h4 className="font-heading font-bold text-white text-xl">
                                                {apt.client?.first_name} {apt.client?.last_name}
                                            </h4>
                                            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">
                                                By {apt.provider?.full_name || 'Unassigned'}
                                            </p>
                                            <div className="flex items-center gap-2 mt-2">
                                                <span className={`text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-lg border ${apt.status === 'completed' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                                                    apt.status === 'active' ? 'bg-primary/10 text-primary border-primary/20' :
                                                        'bg-slate-800 text-slate-500 border-slate-700'
                                                    }`}>
                                                    {apt.status}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Main Info */}
                                    <div className="hidden md:block flex-grow space-y-2">
                                        <div className="flex items-center gap-4">
                                            <h4 className="font-heading font-bold text-2xl text-white group-hover:text-primary/90 transition-colors">
                                                {apt.client?.first_name} {apt.client?.last_name}
                                            </h4>
                                            <span className="text-[10px] font-bold text-slate-500 bg-white/5 px-2 py-0.5 rounded border border-white/5 uppercase tracking-widest">
                                                {apt.provider?.full_name || 'Unassigned'}
                                            </span>
                                            {apt.delay_minutes > 0 && (
                                                <span className="bg-red-500/10 text-red-400 text-[10px] font-bold px-2 py-0.5 rounded-full border border-red-500/20 flex items-center gap-1">
                                                    <AlertCircle size={12} className="stroke-[3]" /> +{apt.delay_minutes}m Delay
                                                </span>
                                            )}
                                        </div>

                                        <div className="flex items-center gap-6 text-sm text-slate-400 font-medium">
                                            <span className="flex items-center gap-2 px-3 py-1 rounded-lg bg-surface/50 border border-white/5">
                                                <Timer size={14} className="text-primary" /> {apt.duration_minutes} min session
                                            </span>
                                            <span className="flex items-center gap-2">
                                                <ArrowRight size={14} className="text-slate-600" />
                                                Ends {format(new Date(new Date(apt.scheduled_start).getTime() + (apt.duration_minutes + (apt.delay_minutes || 0)) * 60000), 'HH:mm')}
                                            </span>
                                        </div>

                                        {apt.notes && (
                                            <p className="text-xs text-slate-500 italic line-clamp-1 border-l-2 border-slate-700 pl-3">
                                                {apt.notes}
                                            </p>
                                        )}
                                    </div>

                                    {/* Actions */}
                                    <div className="flex items-center justify-end md:min-w-[180px] pt-4 md:pt-0 border-t border-white/5 md:border-0">
                                        {apt.status === 'pending' && (
                                            <div className="flex items-center gap-2">
                                                <button
                                                    onClick={() => startAppointment(apt.id)}
                                                    className="w-full md:w-auto h-12 px-6 rounded-xl bg-surface hover:bg-primary text-slate-300 hover:text-white border border-white/5 hover:border-primary/50 transition-all duration-300 font-bold flex items-center justify-center gap-2 group/btn shadow-lg"
                                                >
                                                    <Play size={16} className="fill-current group-hover/btn:scale-110 transition-transform" />
                                                    <span>Start</span>
                                                </button>
                                                <button
                                                    onClick={() => { setEditData(apt); setIsModalOpen(true); }}
                                                    className="p-3 rounded-xl bg-surface hover:bg-white/5 text-slate-500 hover:text-amber-400 border border-white/5 transition-all group"
                                                    title="Edit Appointment"
                                                >
                                                    <Edit2 size={18} />
                                                </button>
                                                <button
                                                    onClick={() => { setSelectedApt(apt); setIsTransferOpen(true); }}
                                                    className="p-3 rounded-xl bg-surface hover:bg-white/5 text-slate-500 hover:text-primary border border-white/5 transition-all group"
                                                    title="Transfer Appointment"
                                                >
                                                    <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
                                                </button>
                                            </div>
                                        )}
                                        {apt.status === 'active' && (
                                            <button
                                                onClick={() => endAppointment(apt.id)}
                                                className="w-full md:w-auto h-12 px-8 rounded-xl bg-gradient-to-r from-red-500 to-red-600 hover:from-red-400 hover:to-red-500 text-white font-bold transition-all shadow-lg shadow-red-500/20 active:scale-95 flex items-center justify-center gap-2"
                                            >
                                                <Square size={16} className="fill-current animate-pulse" />
                                                <span>End Session</span>
                                            </button>
                                        )}
                                        {apt.status === 'completed' && (
                                            <div className="flex items-center gap-2 text-emerald-400 font-bold bg-emerald-500/10 border border-emerald-500/20 px-6 py-3 rounded-xl shadow-[0_0_15px_rgba(16,185,129,0.1)]">
                                                <CheckCircle2 size={18} className="stroke-[3]" />
                                                <span className="text-sm">Completed</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </motion.div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default AppointmentList;


