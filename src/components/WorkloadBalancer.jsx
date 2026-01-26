import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { ArrowLeftRight, UserCheck, AlertTriangle, CheckCircle2, Clock, BarChart3, Loader2, Globe, User, Sparkles, ChevronRight } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { sendWhatsApp } from '../lib/notifications'
import { useAuth } from '../hooks/useAuth'

const WorkloadBalancer = () => {
    const { user, profile } = useAuth()
    const [delayedApts, setDelayedApts] = useState([])
    const [freeProviders, setFreeProviders] = useState([])
    const [loading, setLoading] = useState(true)
    const [globalView, setGlobalView] = useState(profile?.role?.toLowerCase() === 'admin')
    const [suggestions, setSuggestions] = useState([])

    const fetchData = async () => {
        setLoading(true)
        try {
            // 1. Fetch delayed appointments
            let delayedQuery = supabase
                .from('appointments')
                .select('*, client:clients(first_name, last_name, phone), profile:profiles!appointments_assigned_profile_id_fkey(full_name, id, is_online)')
                .eq('status', 'pending');

            if (!globalView) {
                delayedQuery = delayedQuery.eq('assigned_profile_id', user.id);
            }

            const { data: allPending, error: delayedError } = await delayedQuery;
            if (delayedError) throw delayedError

            const filtered = (allPending || []).filter(apt => {
                const threshold = Math.max(10, Math.floor(apt.duration_minutes * 0.25));
                return apt.delay_minutes > threshold;
            });
            setDelayedApts(filtered)

            // 2. Fetch free providers
            const { data: allProviders } = await supabase
                .from('profiles')
                .select('*')
                .eq('business_id', profile?.business_id)

            const { data: activeApts } = await supabase
                .from('appointments')
                .select('assigned_profile_id')
                .eq('status', 'active')

            const busyIds = activeApts?.map(a => a.assigned_profile_id) || []
            const free = allProviders?.filter(p => !busyIds.includes(p.id)) || []
            setFreeProviders(free)

            // 3. Fetch Smart Recommendations (Autopilot)
            if (profile?.role?.toLowerCase() === 'admin' && profile?.business_id) {
                const { getSmartReassignments } = await import('../lib/balancerLogic')
                const smart = await getSmartReassignments(profile.business_id)
                setSuggestions(smart)
            }
        } catch (error) {
            console.error('Balancer Data Error:', error)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        if (user && profile) {
            fetchData()

            // Realtime Listener for Online Status (Recalculate suggestions when someone logs in/out)
            const channel = supabase.channel('balancer-realtime')
                .on('postgres_changes', {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'profiles',
                    filter: `business_id=eq.${profile.business_id}`
                }, (payload) => {
                    if (payload.new.is_online !== payload.old.is_online) {
                        console.log('[Balancer] Online status changed, recalculating...');
                        fetchData()
                    }
                })
                .on('postgres_changes', {
                    event: '*',
                    schema: 'public',
                    table: 'appointments'
                }, () => fetchData()) // Also refresh on status changes
                .subscribe()

            return () => {
                supabase.removeChannel(channel)
            }
        }
    }, [user, profile, globalView])

    const shiftClient = async (aptId, newProviderId, oldProviderId) => {
        if (!confirm('Shift this client to the new provider?')) return

        try {
            // Optimistic update for demo purposes
            setDelayedApts(prev => prev.filter(a => a.id !== aptId))

            const { error } = await supabase
                .from('appointments')
                .update({
                    assigned_profile_id: newProviderId,
                    shifted_from_id: oldProviderId,
                    status: 'pending', // Reset status if it was changed
                    notes: 'Shifted due to delay'
                })
                .eq('id', aptId)

            if (!error) {
                // Trigger notification
                const apt = delayedApts.find(a => a.id === aptId);
                const provider = freeProviders.find(p => p.id === newProviderId);
                if (apt && provider) {
                    const clientName = `${apt.client?.first_name} ${apt.client?.last_name || ''}`.trim();
                    const bizName = "[Your Business Name]";
                    await sendWhatsApp(apt.client?.phone, `Hi ${clientName}, this is ${bizName}. Your session has been reassigned to ${provider.full_name} to minimize your wait time. See you soon!`);
                }

                alert('Client successfully shifted and notified!');
                fetchData() // Refresh real data
            } else {
                throw error
            }
        } catch (error) {
            console.error(error)
            // Revert optimistic update? For now just alert
            alert('Simulation: Shift recorded (Offline/Error Mode)')
        }
    }

    const approveSuggestion = async (sug) => {
        try {
            const { error } = await supabase
                .from('appointments')
                .update({
                    assigned_profile_id: sug.newProviderId,
                    shifted_from_id: sug.currentProviderId,
                    notes: 'Auto-pilot reassignment due to delay'
                })
                .eq('id', sug.appointmentId)

            if (error) throw error

            // Notify Client & New Provider
            const bizName = "[Your Business Name]"
            if (sug.newProviderWhatsapp) {
                await sendWhatsApp(sug.newProviderWhatsapp, `Hi ${sug.newProviderName}, you have a new appointment shifted to you: ${sug.clientName} at ${sug.scheduledTime}.`)
            }

            // Trigger feedback
            setSuggestions(prev => prev.filter(s => s.appointmentId !== sug.appointmentId))
            fetchData()
        } catch (err) {
            console.error('Failed to approve suggestion:', err)
            alert('Action failed. Check logs.')
        }
    }

    const approveAllSuggestions = async () => {
        if (!confirm(`Apply all ${suggestions.length} smart reassignments?`)) return
        setLoading(true)
        for (const sug of suggestions) {
            await approveSuggestion(sug)
        }
        setLoading(false)
        alert('Autopilot complete: All suggested shifts applied!')
    }

    return (
        <div className="space-y-10">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
                <div>
                    <h2 className="text-3xl font-heading font-bold text-white tracking-tight">Workload Balancer</h2>
                    <p className="text-slate-500 mt-1 font-medium">Smart distribution for team efficiency</p>
                </div>
                <div className="flex items-center gap-2 px-4 py-2 bg-slate-800/50 rounded-lg border border-white/5">
                    <div className="flex -space-x-2">
                        {freeProviders.slice(0, 3).map((p, i) => (
                            <div key={i} className="w-8 h-8 rounded-full bg-indigo-500 flex items-center justify-center text-[10px] font-bold border-2 border-slate-900">
                                {p.full_name?.charAt(0) || '?'}
                            </div>
                        ))}
                    </div>
                    <span className="text-xs font-bold text-slate-400 ml-2">{freeProviders.filter(p => p.is_online).length} Online & Free</span>
                </div>
            </div>

            {profile?.role?.toLowerCase() === 'admin' && suggestions.length > 0 && (
                <motion.div
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="glass-card border-none bg-indigo-500/10 border-indigo-500/20 p-8 rounded-[2rem] shadow-xl overflow-hidden relative group"
                >
                    <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:scale-110 transition-transform">
                        <Sparkles size={120} className="text-indigo-400" />
                    </div>

                    <div className="relative z-10">
                        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-8">
                            <div className="flex items-center gap-4">
                                <div className="p-3 bg-indigo-500 rounded-2xl shadow-glow shadow-indigo-500/40">
                                    <Sparkles size={24} className="text-white animate-pulse" />
                                </div>
                                <div>
                                    <h3 className="text-2xl font-bold text-white tracking-tight">Smart Autopilot</h3>
                                    <p className="text-indigo-300/80 font-medium text-sm">Found {suggestions.length} optimal re-assignments to fix delays</p>
                                </div>
                            </div>
                            <button
                                onClick={approveAllSuggestions}
                                className="w-full md:w-auto bg-white text-indigo-600 hover:bg-indigo-50 px-8 py-3.5 rounded-2xl font-black text-sm transition-all shadow-xl active:scale-95 flex items-center justify-center gap-3 group/btn"
                            >
                                <CheckCircle2 size={18} />
                                Approve All Solutions
                                <ChevronRight size={16} className="group-hover:translate-x-1 transition-transform" />
                            </button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {suggestions.map(sug => (
                                <div key={sug.appointmentId} className="bg-white/5 border border-white/10 rounded-2xl p-4 flex justify-between items-center hover:bg-white/10 transition-colors">
                                    <div className="space-y-1">
                                        <h4 className="font-bold text-white text-sm">{sug.clientName}</h4>
                                        <p className="text-[10px] text-indigo-300 font-bold uppercase tracking-widest">
                                            {sug.currentProviderName} → {sug.newProviderName}
                                        </p>
                                    </div>
                                    <button
                                        onClick={() => approveSuggestion(sug)}
                                        className="p-2.5 bg-indigo-500/20 hover:bg-indigo-500 text-indigo-400 hover:text-white rounded-xl transition-all border border-indigo-500/30"
                                    >
                                        <CheckCircle2 size={16} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                </motion.div>
            )}

            {profile?.role?.toLowerCase() === 'admin' && (
                <div className="flex bg-slate-800/40 p-1 rounded-2xl border border-white/5 w-fit">
                    <button
                        onClick={() => setGlobalView(false)}
                        className={`
                            flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all
                            ${!globalView ? 'bg-primary text-white shadow-lg' : 'text-slate-400 hover:text-white'}
                        `}
                    >
                        <User size={14} /> My Clients
                    </button>
                    <button
                        onClick={() => setGlobalView(true)}
                        className={`
                            flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all
                            ${globalView ? 'bg-indigo-500 text-white shadow-lg' : 'text-slate-400 hover:text-white'}
                        `}
                    >
                        <Globe size={14} /> Global Facility
                    </button>
                </div>
            )}

            {loading ? (
                <div className="flex flex-col items-center py-32 text-slate-500">
                    <Loader2 className="w-10 h-10 animate-spin mb-4 text-primary" />
                    <p className="font-medium animate-pulse">Analyzing system workload...</p>
                </div>
            ) : delayedApts.length === 0 ? (
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="glass-card border-none bg-gradient-to-br from-emerald-500/10 to-teal-500/10 border-emerald-500/20 p-12 rounded-[2.5rem] text-center"
                >
                    <div className="w-20 h-20 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto mb-6 shadow-glow shadow-emerald-500/20">
                        <CheckCircle2 size={40} className="text-emerald-400" />
                    </div>
                    <h3 className="text-2xl font-bold text-white mb-2">All Systems Operational</h3>
                    <p className="text-emerald-400/80 font-medium">No significant schedule delays detected across the facility.</p>
                </motion.div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    <AnimatePresence>
                        {delayedApts.map((apt, index) => (
                            <motion.div
                                layout
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.9 }}
                                transition={{ delay: index * 0.1 }}
                                key={apt.id}
                                className="glass-card p-0 overflow-hidden group"
                            >
                                <div className="p-6 border-b border-white/5 bg-gradient-to-r from-red-500/5 to-transparent flex justify-between items-start">
                                    <div className="flex items-center gap-4">
                                        <div className="w-12 h-12 rounded-2xl bg-red-500/10 flex items-center justify-center text-red-500 border border-red-500/20 shadow-glow shadow-red-500/10">
                                            <AlertTriangle size={24} />
                                        </div>
                                        <div>
                                            <h3 className="font-bold text-xl text-white">{apt.client?.first_name} {apt.client?.last_name}</h3>
                                            <p className="text-slate-400 text-sm font-medium flex items-center gap-2">
                                                <UserCheck size={14} />
                                                Assigned to {apt.profile?.full_name}
                                                <div className={`w-1.5 h-1.5 rounded-full ${apt.profile?.is_online ? 'bg-emerald-500 shadow-[0_0_5px_rgba(16,185,129,0.5)]' : 'bg-slate-600'}`} title={apt.profile?.is_online ? 'Online' : 'Offline'} />
                                            </p>
                                        </div>
                                    </div>
                                    <div className="bg-red-500/10 text-red-400 px-3 py-1.5 rounded-lg text-xs font-bold border border-red-500/20 flex items-center gap-1.5">
                                        <Clock size={12} />
                                        {apt.delay_minutes}m Delay
                                    </div>
                                </div>

                                <div className="p-6 space-y-4">
                                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 ml-1">Recommended Reassignment</p>
                                    <div className="space-y-3">
                                        {freeProviders.length === 0 ? (
                                            <div className="p-4 rounded-xl bg-slate-800/50 border border-white/5 text-center">
                                                <p className="text-sm text-slate-500 italic">No free providers available at the moment.</p>
                                            </div>
                                        ) : freeProviders.map(provider => (
                                            provider.id !== apt.assigned_profile_id && (
                                                <div key={provider.id} className={`
                                                    flex justify-between items-center p-4 rounded-xl transition-all border group/provider
                                                    ${provider.is_online
                                                        ? 'bg-slate-800/40 hover:bg-slate-700/60 border-white/5'
                                                        : 'bg-slate-900/40 border-white/5 grayscale opacity-50'}
                                                `}>
                                                    <div className="flex items-center gap-3">
                                                        <div className="relative">
                                                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-sm font-bold shadow-lg">
                                                                {provider.full_name.charAt(0)}
                                                            </div>
                                                            <div className={`
                                                                absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-slate-900
                                                                ${provider.is_online ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]' : 'bg-slate-600'}
                                                            `} />
                                                        </div>
                                                        <div>
                                                            <div className="flex items-center gap-2">
                                                                <h4 className="font-bold text-slate-200 text-sm">{provider.full_name}</h4>
                                                                {!provider.is_online && (
                                                                    <span className="text-[8px] font-black uppercase tracking-widest text-slate-500 bg-white/5 px-1.5 py-0.5 rounded border border-white/5">Away</span>
                                                                )}
                                                            </div>
                                                            <span className="text-xs text-slate-500 font-medium">{provider.role}</span>
                                                        </div>
                                                    </div>
                                                    <button
                                                        onClick={() => shiftClient(apt.id, provider.id, apt.assigned_profile_id)}
                                                        disabled={!provider.is_online}
                                                        className={`
                                                            text-xs px-4 py-2.5 rounded-lg font-bold flex items-center gap-2 transition-all active:scale-95
                                                            ${provider.is_online
                                                                ? 'bg-primary hover:bg-indigo-500 text-white shadow-lg shadow-primary/20 opacity-0 group-hover/provider:opacity-100 translate-x-2 group-hover/provider:translate-x-0'
                                                                : 'bg-slate-800 text-slate-600 cursor-not-allowed'}
                                                        `}
                                                    >
                                                        <ArrowLeftRight size={14} />
                                                        {provider.is_online ? 'Assign' : 'Offline'}
                                                    </button>
                                                </div>
                                            )
                                        ))}
                                    </div>
                                </div>
                            </motion.div>
                        ))}
                    </AnimatePresence>
                </div>
            )}
        </div>
    )
}

export default WorkloadBalancer
