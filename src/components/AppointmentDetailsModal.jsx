import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, User, Calendar, Clock, Sparkles, CheckCircle2, AlertTriangle, Phone, ChevronRight, Activity, TrendingUp } from 'lucide-react';
import { format } from 'date-fns';
import { supabase } from '../lib/supabase';

const AppointmentDetailsModal = ({ isOpen, onClose, appointment, onStart, onEdit }) => {
    const [clientStats, setClientStats] = useState({ totalVisits: 0, lastVisit: null });
    const [loadingStats, setLoadingStats] = useState(false);

    useEffect(() => {
        if (isOpen && appointment?.client_id) {
            fetchClientStats();
        }
    }, [isOpen, appointment]);

    const fetchClientStats = async () => {
        setLoadingStats(true);
        try {
            const { data, count, error } = await supabase
                .from('appointments')
                .select('scheduled_start', { count: 'exact' })
                .eq('client_id', appointment.client_id)
                .eq('status', 'completed')
                .order('scheduled_start', { ascending: false });

            if (!error) {
                setClientStats({
                    totalVisits: count || 0,
                    lastVisit: data?.[0]?.scheduled_start || null
                });
            }
        } catch (e) {
            console.error('Stats fetch error:', e);
        } finally {
            setLoadingStats(false);
        }
    };

    if (!isOpen || !appointment) return null;

    const providerSkills = (appointment.provider?.skills || []).map(s => typeof s === 'object' ? s.code : s);
    const requiredSkills = appointment.required_skills || [];
    const skillMatches = requiredSkills.map(skill => ({
        name: skill,
        matched: providerSkills.includes(skill)
    }));

    const isPerfectMatch = skillMatches.every(s => s.matched);
    const hasGap = skillMatches.some(s => !s.matched);

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={onClose}
                    className="absolute inset-0 bg-slate-950/80 backdrop-blur-md"
                />

                <motion.div
                    initial={{ opacity: 0, scale: 0.9, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.9, y: 20 }}
                    className="relative w-full max-w-2xl bg-slate-900 border border-white/10 rounded-[2.5rem] shadow-2xl overflow-hidden"
                >
                    {/* Header Image/Pattern */}
                    <div className="absolute top-0 left-0 right-0 h-32 bg-gradient-to-br from-indigo-500/20 to-primary/5 pointer-events-none" />

                    <div className="relative p-8">
                        {/* Top Bar */}
                        <div className="flex justify-between items-start mb-8">
                            <div className="flex items-center gap-4">
                                <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center text-primary border border-primary/20 shadow-inner">
                                    <User size={32} />
                                </div>
                                <div>
                                    <h2 className="text-3xl font-heading font-bold text-white tracking-tight">
                                        {appointment.client?.first_name} {appointment.client?.last_name}
                                    </h2>
                                    <div className="flex items-center gap-2 text-slate-400 font-medium">
                                        <Phone size={14} className="text-primary" />
                                        <span className="text-sm">{appointment.client?.phone}</span>
                                    </div>
                                </div>
                            </div>
                            <button
                                onClick={onClose}
                                className="p-3 hover:bg-white/5 rounded-2xl text-slate-500 hover:text-white transition-colors"
                            >
                                <X size={24} />
                            </button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* Left Column: Client Insights */}
                            <div className="space-y-6">
                                <section className="bg-white/5 rounded-3xl p-6 border border-white/5">
                                    <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                                        <TrendingUp size={14} /> Client History
                                    </h3>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="text-center p-3 rounded-2xl bg-surface/50 border border-white/5">
                                            <p className="text-2xl font-black text-white">{loadingStats ? '...' : clientStats.totalVisits}</p>
                                            <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest">Total Visits</p>
                                        </div>
                                        <div className="text-center p-3 rounded-2xl bg-surface/50 border border-white/5">
                                            <p className="text-sm font-bold text-white truncate">
                                                {loadingStats ? '...' : clientStats.lastVisit ? format(new Date(clientStats.lastVisit), 'MMM d') : 'New'}
                                            </p>
                                            <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest">Last Visit</p>
                                        </div>
                                    </div>
                                    {clientStats.totalVisits > 5 && (
                                        <div className="mt-4 flex items-center gap-2 px-3 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400 text-xs font-bold">
                                            <Sparkles size={14} /> Loyalty: Premium Client
                                        </div>
                                    )}
                                </section>

                                <section className="bg-white/5 rounded-3xl p-6 border border-white/5">
                                    <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                                        <Activity size={14} /> Session Timeline
                                    </h3>
                                    <div className="space-y-4">
                                        <div className="flex items-center justify-between">
                                            <span className="text-xs text-slate-400">Scheduled Start</span>
                                            <span className="text-sm font-bold text-white">{format(new Date(appointment.scheduled_start), 'HH:mm')}</span>
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <span className="text-xs text-slate-400">Treatment</span>
                                            <span className="text-sm font-bold text-primary">{appointment.treatment_name || 'Standard Session'}</span>
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <span className="text-xs text-slate-400">Duration</span>
                                            <span className="text-sm font-bold text-white">{appointment.duration_minutes} min</span>
                                        </div>
                                        {appointment.delay_minutes > 0 && (
                                            <div className="flex items-center justify-between text-red-400">
                                                <span className="text-xs">Current Delay</span>
                                                <span className="text-sm font-bold">+{appointment.delay_minutes} min</span>
                                            </div>
                                        )}
                                    </div>
                                </section>
                            </div>

                            {/* Right Column: Doctor & Skills */}
                            <div className="space-y-6">
                                <section className={`rounded-3xl p-6 border transition-colors ${hasGap ? 'bg-red-500/5 border-red-500/20' : 'bg-white/5 border-white/5'}`}>
                                    <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                                        <User size={14} /> Assigned Provider
                                    </h3>
                                    <div className="flex items-center gap-4 mb-6">
                                        <div className="w-12 h-12 rounded-xl bg-slate-800 flex items-center justify-center font-bold text-lg text-primary">
                                            {appointment.provider?.full_name?.charAt(0)}
                                        </div>
                                        <div>
                                            <p className="font-bold text-white">{appointment.provider?.full_name}</p>
                                            <p className="text-[10px] text-slate-500 uppercase font-black">{appointment.provider?.role || 'Staff'}</p>
                                        </div>
                                    </div>

                                    <div className="space-y-3">
                                        <p className="text-[10px] font-black uppercase text-slate-500 tracking-[0.2em] mb-2">Skill Verification</p>
                                        {skillMatches.length === 0 ? (
                                            <p className="text-xs text-slate-500 italic">No specific skills required.</p>
                                        ) : (
                                            <div className="flex flex-wrap gap-2">
                                                {skillMatches.map((skill, i) => (
                                                    <div
                                                        key={i}
                                                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[10px] font-bold uppercase tracking-wider ${skill.matched
                                                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                                            : 'bg-red-500/10 text-red-400 border-red-500/40 animate-pulse'
                                                            }`}
                                                    >
                                                        {skill.matched ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />}
                                                        {skill.name}
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        {hasGap && (
                                            <div className="mt-4 p-3 rounded-2xl bg-red-500/10 border border-red-500/20">
                                                <p className="text-[10px] text-red-500 font-bold leading-normal">
                                                    ⚠️ WARNING: Provider lacks one or more required skills for this clinical treatment. Reassignment recommended.
                                                </p>
                                            </div>
                                        )}
                                        {isPerfectMatch && skillMatches.length > 0 && (
                                            <div className="mt-4 p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20">
                                                <p className="text-[10px] text-emerald-400 font-bold leading-normal flex items-center gap-2">
                                                    <CheckCircle2 size={12} /> Optimal Match: Provider is fully qualified.
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                </section>

                                {appointment.notes && (
                                    <section className="bg-white/5 rounded-3xl p-6 border border-white/5">
                                        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">Session Notes</h3>
                                        <p className="text-sm text-slate-400 leading-relaxed italic border-l-2 border-primary/30 pl-4">
                                            "{appointment.notes}"
                                        </p>
                                    </section>
                                )}
                            </div>
                        </div>

                        {/* Footer / Actions */}
                        <div className="mt-8 pt-8 border-t border-white/5 flex gap-4">
                            {appointment.status === 'pending' && (
                                <button
                                    onClick={() => {
                                        onEdit?.(appointment);
                                        onClose();
                                    }}
                                    className="px-6 py-4 bg-surface hover:bg-indigo-500/10 text-slate-400 hover:text-indigo-400 font-bold rounded-2xl transition-all text-sm flex items-center gap-2 border border-white/5"
                                >
                                    <Edit2 size={16} /> Edit
                                </button>
                            )}

                            {appointment.status === 'pending' && (
                                <div className="flex-1 flex gap-3">
                                    <button
                                        onClick={() => {
                                            onStart(appointment.id);
                                            onClose();
                                        }}
                                        className="flex-1 py-4 bg-primary text-white font-bold rounded-2xl shadow-glow shadow-primary/20 hover:scale-[1.02] active:scale-95 transition-all text-sm"
                                    >
                                        Start Session
                                    </button>
                                </div>
                            )}
                            <button
                                onClick={onClose}
                                className="px-8 py-4 bg-white/5 hover:bg-white/10 text-white font-bold rounded-2xl transition-all text-sm ml-auto"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
};

export default AppointmentDetailsModal;
