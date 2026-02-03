import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { motion, AnimatePresence } from 'framer-motion';
import { format, isSameDay } from 'date-fns';
import { useAuth } from '../hooks/useAuth';
import AddAppointmentModal from './AddAppointmentModal';
import { Edit2, Play, Square, AlertCircle, Clock, ArrowRight, Plus, Timer, Calendar as CalendarIcon, Loader2, CheckCircle2, Trash2, Sparkles } from 'lucide-react';
import TransferModal from './TransferModal';
import CancelAppointmentModal from './CancelAppointmentModal';
import AppointmentDetailsModal from './AppointmentDetailsModal';
import { calculateAndApplyDelay } from '../lib/delayEngine';
import { getCache, setCache, CACHE_KEYS } from '../lib/cache';
import { logAppointment } from '../lib/logger';
import { startAppointmentAction, endAppointmentAction } from '../lib/appointmentService';

const SessionTimer = ({ startTime, duration }) => {
    const calculateTime = (startStr, dur) => {
        if (!startStr) return { minutes: dur, seconds: 0, isOvertime: false };
        const start = new Date(startStr).getTime();
        const now = new Date().getTime();
        const end = start + dur * 60000;
        const diff = end - now;

        if (diff <= 0) {
            const over = Math.abs(diff);
            return { minutes: Math.floor(over / 60000), seconds: Math.floor((over % 60000) / 1000), isOvertime: true };
        } else {
            return { minutes: Math.floor(diff / 60000), seconds: Math.floor((diff % 60000) / 1000), isOvertime: false };
        }
    };

    const [state, setState] = useState(() => calculateTime(startTime, duration));

    useEffect(() => {
        const timer = setInterval(() => setState(calculateTime(startTime, duration)), 1000);
        return () => clearInterval(timer);
    }, [startTime, duration]);

    return (
        <div className={`flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-widest py-2 rounded-lg border ${state.isOvertime ? 'bg-red-500/10 text-red-500 border-red-500/20 animate-pulse' : 'bg-primary/10 text-primary border-primary/20'}`}>
            <Timer size={12} className={state.isOvertime ? 'animate-bounce' : ''} />
            <span>{state.isOvertime ? '+' : ''}{String(state.minutes).padStart(2, '0')}:{String(state.seconds).padStart(2, '0')}{state.isOvertime ? ' Over' : ' Left'}</span>
        </div>
    );
};

/**
 * NextAppointmentCountdown - Shows live countdown to next pending appointment
 * Helps providers see their available gap time in manual mode
 */
const NextAppointmentCountdown = ({ nextAppointment }) => {
    const [timeLeft, setTimeLeft] = useState({ minutes: 0, isOverdue: false });

    useEffect(() => {
        if (!nextAppointment) return;

        const calculate = () => {
            const now = new Date().getTime();
            const scheduledStart = new Date(nextAppointment.scheduled_start).getTime();
            const diff = scheduledStart - now;

            if (diff <= 0) {
                return { minutes: Math.abs(Math.floor(diff / 60000)), isOverdue: true };
            }
            return { minutes: Math.floor(diff / 60000), isOverdue: false };
        };

        setTimeLeft(calculate());
        const timer = setInterval(() => setTimeLeft(calculate()), 10000); // Update every 10 seconds
        return () => clearInterval(timer);
    }, [nextAppointment]);

    if (!nextAppointment) return null;

    const { minutes, isOverdue } = timeLeft;

    // Color coding based on urgency
    let colorClass = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'; // >15 min
    if (minutes <= 5 || isOverdue) {
        colorClass = 'bg-red-500/10 text-red-400 border-red-500/20 animate-pulse';
    } else if (minutes <= 15) {
        colorClass = 'bg-amber-500/10 text-amber-400 border-amber-500/20';
    }

    return (
        <div className={`flex items-center gap-3 px-4 py-2.5 rounded-xl border ${colorClass}`}>
            <Clock size={16} />
            <div className="flex flex-col">
                <span className="text-[9px] font-bold uppercase tracking-widest opacity-70">
                    {isOverdue ? 'Overdue' : 'Next Appointment'}
                </span>
                <span className="text-sm font-bold tabular-nums">
                    {isOverdue ? '+' : ''}{minutes} min {isOverdue ? 'ago' : 'away'}
                </span>
            </div>
            <div className="ml-auto text-right">
                <span className="text-[10px] opacity-70">{nextAppointment.client?.first_name}</span>
                <div className="text-xs font-bold">{format(new Date(nextAppointment.scheduled_start), 'HH:mm')}</div>
            </div>
        </div>
    );
};


const AppointmentList = ({ virtualAssistantEnabled, assistantCountdown, isAssistantLeader }) => {
    const { user, profile } = useAuth();
    const [viewDate, setViewDate] = useState(new Date());
    const [appointments, setAppointments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isTransferOpen, setIsTransferOpen] = useState(false);
    const [isCancelOpen, setIsCancelOpen] = useState(false);
    const [editData, setEditData] = useState(null);
    const [selectedApt, setSelectedApt] = useState(null);
    const [selectedCancelApt, setSelectedCancelApt] = useState(null);
    const [selectedAptDetails, setSelectedAptDetails] = useState(null);
    const [isDetailsOpen, setIsDetailsOpen] = useState(false);
    const [now, setNow] = useState(new Date());
    const appointmentsRef = useRef(appointments);

    // Derive busy providers for UI state
    const busyProviderIds = new Set(
        appointments
            .filter(a => a.status === 'active')
            .map(a => a.assigned_profile_id)
    );

    // Find the NEXT pending appointment for current user (earliest by scheduled_start)
    // Filter out appointments that are more than 4 hours overdue (old forgotten appointments)
    const MAX_OVERDUE_MS = 4 * 60 * 60 * 1000; // 4 hours
    const myNextAppointment = appointments
        .filter(a => {
            if (a.status !== 'pending' || a.assigned_profile_id !== user?.id) return false;
            const scheduledTime = new Date(a.scheduled_start).getTime();
            const overdueBy = Date.now() - scheduledTime;
            return overdueBy < MAX_OVERDUE_MS; // Only show if not too old
        })
        .sort((a, b) => new Date(a.scheduled_start).getTime() - new Date(b.scheduled_start).getTime())[0] || null;

    // Check if current user is busy (has an active appointment)
    const isCurrentUserBusy = busyProviderIds.has(user?.id);

    // Keep appointmentsRef in sync
    useEffect(() => { appointmentsRef.current = appointments; }, [appointments]);

    // Clock for UI (isOverdue checks)
    useEffect(() => {
        const timer = setInterval(() => setNow(new Date()), 10000);
        return () => clearInterval(timer);
    }, []);

    // VIRTUAL ASSISTANT LOGIC: Now handled globally by Dashboard.jsx
    // This component now only listens to realtime updates.

    const getDayRange = (date) => {
        const start = new Date(date);
        start.setHours(0, 0, 0, 0);
        const end = new Date(date);
        end.setHours(23, 59, 59, 999);
        return { start, end };
    };

    const fetchAppointments = async (silent = false) => {
        if (!silent) setLoading(true);

        // Strategy: Always fetch a window around viewDate.
        // Adjusted per user: 1 day back, 7 days forward.
        const windowStart = new Date(viewDate);
        windowStart.setDate(windowStart.getDate() - 1); // 1 day back
        windowStart.setHours(0, 0, 0, 0);

        const windowEnd = new Date(viewDate);
        windowEnd.setDate(windowEnd.getDate() + 7); // 7 days forward
        windowEnd.setHours(23, 59, 59, 999);

        const cacheKey = `${CACHE_KEYS.APPOINTMENTS}_window_${windowStart.toISOString().split('T')[0]}`;
        const cached = getCache(cacheKey);

        // Local filter for display
        const filterToSelectedDay = (allDocs) => {
            const { start, end } = getDayRange(viewDate);
            return allDocs.filter(a => {
                const d = new Date(a.scheduled_start);
                return d >= start && d <= end;
            });
        };

        if (cached && !silent) {
            setAppointments(filterToSelectedDay(cached));
        }

        let query = supabase
            .from('appointments')
            .select(`*, 
                client:clients(first_name, last_name, phone), 
                provider:profiles!appointments_assigned_profile_id_fkey(full_name, skills, role), 
                transfer_requests(id, status, receiver_id, sender_id)
            `)
            .or(`status.eq.active,status.eq.pending`)
            .gte('scheduled_start', windowStart.toISOString())
            .lte('scheduled_start', windowEnd.toISOString())
            .order('scheduled_start', { ascending: true });

        if (profile?.role?.toLowerCase() !== 'admin') {
            query = query.eq('assigned_profile_id', user?.id);
        }

        const { data } = await query;
        if (data) {
            setCache(cacheKey, data);
            setAppointments(filterToSelectedDay(data));
        }
        setLoading(false);
    };

    useEffect(() => {
        if (!user || !profile) return;
        fetchAppointments();
        const channel = supabase.channel(`list-updates-${user.id}`).on('postgres_changes', { event: '*', schema: 'public', table: 'appointments', filter: profile?.role?.toLowerCase() !== 'admin' ? `assigned_profile_id=eq.${user.id}` : undefined }, () => fetchAppointments(true)).subscribe();
        return () => supabase.removeChannel(channel);
    }, [user, profile, viewDate]);

    const navigateDay = (direction) => {
        const newDate = new Date(viewDate);
        newDate.setDate(viewDate.getDate() + direction);
        setViewDate(newDate);
    };

    const setToday = () => {
        setViewDate(new Date());
    };

    const startAppointment = async (id) => {
        // Optimistic Update
        const startTime = new Date().toISOString();
        setAppointments(prev => prev.map(a => a.id === id ? { ...a, status: 'active', actual_start: startTime, delay_minutes: 0 } : a));

        const res = await startAppointmentAction(id, profile, () => fetchAppointments(true));
        if (res.error && !res.aborted) {
            alert('Failed to start session: ' + res.error.message);
            fetchAppointments(true);
        }
    };

    const endAppointment = async (id) => {
        // Optimistic Update
        const endTime = new Date().toISOString();
        setAppointments(prev => prev.map(a => a.id === id ? { ...a, status: 'completed', actual_end: endTime } : a));

        const res = await endAppointmentAction(id, profile, () => fetchAppointments(true));
        if (res.error && !res.aborted) {
            fetchAppointments(true);
        }
    };

    return (
        <div className="space-y-8">
            <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-6">
                <div className="flex items-center gap-4 w-full md:w-auto bg-surface/50 p-1.5 rounded-2xl border border-white/5 shadow-inner">
                    <button onClick={() => navigateDay(-1)} className="p-3 hover:bg-white/10 rounded-xl text-slate-400 hover:text-white transition-all active:scale-90"><ArrowRight size={20} className="rotate-180" /></button>
                    <div className="flex flex-col items-center flex-1 px-4 cursor-pointer" onClick={setToday}>
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-0.5">Current View</span>
                        <div className="flex items-center gap-2 font-heading font-bold text-white whitespace-nowrap">
                            <CalendarIcon size={16} className="text-primary" />
                            {isSameDay(viewDate, new Date()) ? 'Today' : format(viewDate, 'EEEE, MMM d')}
                        </div>
                    </div>
                    <button onClick={() => navigateDay(1)} className="p-3 hover:bg-white/10 rounded-xl text-slate-400 hover:text-white transition-all active:scale-90"><ArrowRight size={20} /></button>
                </div>
                {virtualAssistantEnabled && (
                    <div className="hidden md:flex items-center gap-3 px-4 py-2 bg-indigo-500/10 border border-indigo-500/20 rounded-xl text-indigo-400">
                        <div className={`w-2 h-2 rounded-full bg-indigo-500 ${isAssistantLeader ? 'animate-pulse' : 'opacity-40'}`} />
                        <span className="text-xs font-bold uppercase tracking-widest flex items-center gap-2">
                            Global Assistant {isAssistantLeader ? 'Active' : 'Standby'}
                            <span className="px-1.5 py-0.5 rounded-md bg-indigo-500/20 border border-indigo-500/30 text-[10px] tabular-nums">{assistantCountdown}s</span>
                            {isAssistantLeader && <span className="text-[8px] bg-indigo-500/20 px-1 rounded border border-indigo-500/30 ml-1">CONTROLLER</span>}
                        </span>
                    </div>
                )}
                {/* Next Appointment Countdown - Always shows upcoming appointment */}
                {myNextAppointment && profile?.role?.toLowerCase() !== 'admin' && (
                    <div className="hidden md:block">
                        <NextAppointmentCountdown nextAppointment={myNextAppointment} />
                    </div>
                )}
                <div className="flex items-center gap-4 w-full md:w-auto">
                    <button onClick={() => setIsModalOpen(true)} className="w-full sm:w-auto bg-primary hover:bg-indigo-600 text-white px-6 py-4 rounded-xl font-bold transition-all shadow-lg shadow-primary/20 hover:shadow-primary/40 active:scale-95 flex items-center justify-center gap-2 text-sm group">
                        <div className="bg-white/20 p-1 rounded-lg group-hover:scale-110 transition-transform"><Plus size={16} /></div>New Appointment
                    </button>
                </div>
            </div>

            <AddAppointmentModal isOpen={isModalOpen} onClose={() => { setIsModalOpen(false); setEditData(null); }} onRefresh={fetchAppointments} editData={editData} />
            {selectedApt && <TransferModal isOpen={isTransferOpen} onClose={() => { setIsTransferOpen(false); setSelectedApt(null); }} appointment={selectedApt} onComplete={fetchAppointments} />}
            {selectedCancelApt && <CancelAppointmentModal isOpen={isCancelOpen} onClose={() => { setIsCancelOpen(false); setSelectedCancelApt(null); }} appointment={selectedCancelApt} onRefresh={fetchAppointments} />}
            <AppointmentDetailsModal isOpen={isDetailsOpen} onClose={() => { setIsDetailsOpen(false); setSelectedAptDetails(null); }} appointment={selectedAptDetails} onStart={startAppointment} />

            <div className="space-y-4">
                {loading ? (
                    <div className="flex flex-col items-center py-32 text-slate-500">
                        <div className="relative"><div className="absolute inset-0 bg-primary/20 blur-xl rounded-full animate-pulse" /><Loader2 className="w-12 h-12 animate-spin relative z-10 text-primary" /></div>
                        <p className="text-sm font-bold tracking-widest uppercase mt-6 opacity-70">Loading Schedule...</p>
                    </div>
                ) : appointments.length === 0 ? (
                    <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="glass-card border-dashed border-white/10 p-20 text-center relative overflow-hidden group">
                        <div className="absolute inset-0 bg-gradient-to-b from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                        <div className="relative z-10 flex flex-col items-center">
                            <div className="w-20 h-20 bg-surface rounded-3xl flex items-center justify-center mb-6 shadow-inner border border-white/5 group-hover:scale-110 transition-transform duration-500"><CalendarIcon size={40} className="text-slate-600 group-hover:text-primary transition-colors duration-300" /></div>
                            <h3 className="text-2xl font-heading font-bold text-white mb-2">Schedule Empty</h3>
                            <p className="text-slate-400 max-w-sm mx-auto">No appointments scheduled for today. Click the button above to add your first client session.</p>
                        </div>
                    </motion.div>
                ) : (
                    <div className="grid gap-4">
                        {appointments.filter(apt => apt.status !== 'pending' || (new Date().getTime() - new Date(apt.scheduled_start).getTime()) / 60000 < 240).map((apt, index) => {
                            const isProviderAvailable = apt.status === 'pending' && !busyProviderIds.has(apt.assigned_profile_id);
                            const isAdmin = profile?.role?.toLowerCase() === 'admin';
                            const showGreenHighlight = isAdmin && isProviderAvailable && !apt.requires_attention;
                            return (
                                <motion.div
                                    initial={{ opacity: 0, y: 15 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: Math.min(index * 0.03, 0.5), duration: 0.3 }}
                                    key={apt.id}
                                    onClick={() => { setSelectedAptDetails(apt); setIsDetailsOpen(true); }}
                                    className={`relative glass-card group overflow-hidden transition-all duration-300 hover:border-white/10 hover:translate-x-1 cursor-pointer active:scale-[0.99] optimize-gpu ${index > 5 ? 'content-auto' : ''} ${apt.status === 'active' ? 'border-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.3)] bg-emerald-500/5' : ''} ${apt.requires_attention ? 'border-amber-500/50 shadow-[0_0_15px_rgba(245,158,11,0.2)] bg-amber-500/5' : ''} ${showGreenHighlight ? 'bg-emerald-500/20 border-emerald-500/30' : ''}`}
                                >
                                    {/* Green stripe for available provider - Admin only */}
                                    {showGreenHighlight && <div className="absolute top-0 left-0 bottom-0 w-1 bg-emerald-500/50" />}
                                    {apt.status === 'active' && <div className="absolute top-0 left-0 bottom-0 w-1 bg-primary shadow-[0_0_15px_rgba(99,102,241,0.6)]" />}
                                    {apt.requires_attention && <div className="absolute top-0 left-0 bottom-0 w-1 bg-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.6)]" />}
                                    {apt.requires_attention && <div className="absolute top-4 right-4 px-2 py-0.5 rounded bg-amber-500/20 border border-amber-500/30 text-amber-400 text-[8px] font-bold uppercase tracking-widest flex items-center gap-1 z-20"><AlertCircle size={10} />Needs Attention</div>}
                                    {isSameDay(new Date(apt.scheduled_start), new Date()) && apt.status === 'pending' && !apt.requires_attention && <div className="absolute top-4 right-4 px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 text-amber-500 text-[8px] font-bold uppercase tracking-widest">Today</div>}
                                    {(() => {
                                        const transferredAway = apt.shifted_from_id === user?.id;
                                        const pendingTransfer = (apt.transfer_requests || []).some(r => r.status === 'pending' && (r.sender_id === user?.id || r.receiver_id === user?.id));
                                        if (transferredAway) return <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-[1px] z-10 flex items-center justify-center"><div className="px-4 py-2 bg-indigo-500/20 border border-indigo-500/30 rounded-xl text-indigo-300 font-bold flex items-center gap-2 shadow-xl"><ArrowRight size={16} />Transferred to {apt.provider?.full_name}</div></div>;
                                        if (pendingTransfer) return <div className="absolute top-4 right-16 px-2 py-0.5 rounded bg-blue-500/10 border border-blue-500/20 text-blue-400 text-[8px] font-bold uppercase tracking-widest flex items-center gap-1"><Loader2 size={8} className="animate-spin" />Transfer Pending</div>;
                                        return null;
                                    })()}
                                    <div className="p-6 flex flex-col md:flex-row md:items-center gap-6 md:gap-8">
                                        <div className="flex flex-col items-center gap-4 min-w-[120px]">
                                            {(() => {
                                                const isOverdue = apt.status === 'pending' && now > new Date(apt.scheduled_start);
                                                return (
                                                    <div className={`w-20 h-20 rounded-2xl flex flex-col items-center justify-center border transition-all duration-300 relative overflow-hidden ${apt.status === 'active' ? 'bg-gradient-to-br from-primary to-indigo-600 border-primary/50 text-white shadow-lg' : isOverdue ? 'bg-red-500/10 border-red-500/40 text-red-500 animate-pulse' : 'bg-surface border-white/5 text-slate-400 group-hover:border-white/10 group-hover:bg-surface/80'}`}>
                                                        <span className="text-[10px] font-bold uppercase tracking-widest opacity-60 mb-0.5">Start</span>
                                                        <span className="text-2xl font-heading font-bold tracking-tight">{format(new Date(apt.scheduled_start), 'HH:mm')}</span>
                                                        {isOverdue && <div className="absolute inset-0 bg-red-500/5 animate-pulse pointer-events-none" />}
                                                    </div>
                                                );
                                            })()}
                                            <div className="hidden md:flex flex-col gap-1.5 w-full items-center">
                                                <div className="text-[9px] font-black text-white/80 bg-white/5 px-2 py-1 rounded-lg border border-white/10 uppercase tracking-[0.1em] text-center w-full truncate max-w-[110px]">
                                                    {apt.provider?.full_name || 'Unassigned'}
                                                </div>
                                                {apt.assigned_profile_id && (
                                                    <div className={`text-[8px] font-bold uppercase tracking-[0.2em] px-2 py-0.5 rounded-md border flex items-center gap-1 ${busyProviderIds.has(apt.assigned_profile_id)
                                                        ? 'bg-red-500/10 text-red-500 border-red-500/20'
                                                        : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'}`}>
                                                        <div className={`w-1 h-1 rounded-full ${busyProviderIds.has(apt.assigned_profile_id) ? 'bg-red-500 animate-pulse' : 'bg-emerald-500'}`} />
                                                        {busyProviderIds.has(apt.assigned_profile_id) ? 'Busy' : 'Available'}
                                                    </div>
                                                )}
                                            </div>
                                            <div className="md:hidden text-center"><h4 className="font-heading font-bold text-white text-xl">{apt.client?.first_name} {apt.client?.last_name}</h4><div className="flex items-center justify-center gap-2 mt-2"><span className={`text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-lg border ${apt.status === 'completed' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : apt.status === 'active' ? 'bg-primary/10 text-primary border-primary/20' : 'bg-slate-800 text-slate-500 border-slate-700'}`}>{apt.status}</span></div></div>
                                        </div>
                                        <div className="hidden md:block flex-grow space-y-4">
                                            <div className="flex items-center gap-4"><h4 className="font-heading font-bold text-2xl text-white group-hover:text-primary transition-colors">{apt.client?.first_name} {apt.client?.last_name}</h4>{apt.delay_minutes > 0 && <span className="bg-red-500/10 text-red-400 text-[10px] font-bold px-2 py-0.5 rounded-full border border-red-500/20 flex items-center gap-1"><AlertCircle size={12} className="stroke-[3]" /> +{apt.delay_minutes}m Delay</span>}</div>
                                            <div className="space-y-3">
                                                <div className="flex flex-col gap-2">
                                                    <div className="flex items-center flex-wrap gap-2"><div className="flex items-center gap-2 text-[11px] font-bold text-primary uppercase tracking-wider bg-primary/5 border border-primary/10 px-3 py-1.5 rounded-xl w-fit"><Sparkles size={12} /> {apt.treatment_name || 'Standard Session'}</div>{apt.required_skills?.map((skill, si) => <span key={si} className="text-[9px] font-black text-white/80 bg-white/5 px-2 py-1 rounded-lg border border-white/10 uppercase tracking-[0.1em]">{skill}</span>)}</div>
                                                    <div className="flex items-center gap-4 text-xs text-white/80 font-medium ml-1"><span className="flex items-center gap-2 text-[10px] uppercase font-black tracking-widest">Duration: <span className="text-white">{apt.duration_minutes} min</span></span><div className="h-1 w-1 bg-white/10 rounded-full" /><span className="flex items-center gap-2 text-primary font-bold"><ArrowRight size={14} className="opacity-40" />Ends {format(new Date((apt.status === 'active' ? new Date(apt.actual_start).getTime() : new Date(apt.scheduled_start).getTime() + (apt.delay_minutes || 0) * 60000) + apt.duration_minutes * 60000), 'HH:mm')}</span></div>
                                                </div>
                                                {apt.notes && <p className="text-xs text-white/80 italic line-clamp-1 border-l-2 border-primary/30 pl-3 py-0.5 bg-white/[0.01]">{apt.notes}</p>}
                                            </div>
                                        </div>
                                        <div className="flex items-center justify-end md:min-w-[180px] pt-4 md:pt-0 border-t border-white/5 md:border-0 relative z-20" onClick={(e) => e.stopPropagation()}>
                                            {apt.status === 'pending' && (
                                                <div className="flex items-center gap-2">
                                                    <button
                                                        onClick={() => startAppointment(apt.id)}
                                                        disabled={
                                                            (apt.transfer_requests || []).some(r => r.status === 'pending' && r.sender_id === user?.id) ||
                                                            busyProviderIds.has(apt.assigned_profile_id)
                                                        }
                                                        className={`w-full md:w-auto h-12 px-6 rounded-xl bg-surface hover:bg-primary text-slate-300 hover:text-white border border-white/5 hover:border-primary/50 transition-all duration-300 font-bold flex items-center justify-center gap-2 group/btn shadow-lg ${(apt.transfer_requests || []).some(r => r.status === 'pending' && r.sender_id === user?.id) || busyProviderIds.has(apt.assigned_profile_id) ? 'opacity-50 cursor-not-allowed grayscale' : ''}`}
                                                        title={busyProviderIds.has(apt.assigned_profile_id) ? 'Provider is currently in another session' : 'Start Session'}
                                                    >
                                                        <Play size={16} className="fill-current group-hover/btn:scale-110 transition-transform" />
                                                        <span>Start</span>
                                                    </button>
                                                    <button onClick={() => { setEditData(apt); setIsModalOpen(true); }} className="p-3 rounded-xl bg-surface hover:bg-white/5 text-slate-500 hover:text-amber-400 border border-white/5 transition-all group" title="Edit Appointment"><Edit2 size={18} /></button>
                                                    <button onClick={() => { setSelectedApt(apt); setIsTransferOpen(true); }} className="p-3 rounded-xl bg-surface hover:bg-white/5 text-slate-500 hover:text-primary border border-white/5 transition-all group" title="Transfer Appointment"><ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" /></button>
                                                    <button onClick={() => { setSelectedCancelApt(apt); setIsCancelOpen(true); }} className="p-3 rounded-xl bg-surface hover:bg-red-500/10 text-slate-500 hover:text-red-400 border border-white/5 transition-all group" title="Cancel Appointment"><Trash2 size={18} /></button>
                                                </div>
                                            )}
                                            {apt.status === 'active' && (
                                                <div className="flex flex-col gap-2 w-full md:w-auto items-end">
                                                    <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-primary/20 border border-primary/20 text-primary text-[10px] font-bold uppercase tracking-widest animate-pulse mb-1"><div className="w-2 h-2 rounded-full bg-primary" />Live Session</div>
                                                    <button onClick={() => endAppointment(apt.id)} className="w-full md:w-auto h-12 px-8 rounded-xl bg-gradient-to-r from-red-500 to-red-600 hover:from-red-400 hover:to-red-500 text-white font-bold transition-all shadow-lg shadow-red-500/20 active:scale-95 flex items-center justify-center gap-2"><Square size={16} className="fill-current animate-pulse" /><span>End Session</span></button>
                                                    <SessionTimer startTime={apt.actual_start} duration={apt.duration_minutes} />
                                                </div>
                                            )}
                                            {apt.status === 'completed' && <div className="flex items-center gap-2 text-emerald-400 font-bold bg-emerald-500/10 border border-emerald-500/20 px-6 py-3 rounded-xl shadow-[0_0_15px_rgba(16,185,129,0.1)]"><CheckCircle2 size={18} className="stroke-[3]" /><span className="text-sm">Completed</span></div>}
                                        </div>
                                    </div>
                                </motion.div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
};

export default AppointmentList;
