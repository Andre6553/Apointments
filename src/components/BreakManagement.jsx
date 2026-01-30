import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { Plus, Trash2, Clock, Coffee, Calendar as CalendarIcon, Loader2, X } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

const BreakManagement = () => {
    const [breaks, setBreaks] = useState([])
    const [loading, setLoading] = useState(true)
    const [showAdd, setShowAdd] = useState(false)
    const [newBreak, setNewBreak] = useState({ label: 'Lunch Break', startTime: '13:00', duration: 60 })
    const [isSubmitting, setIsSubmitting] = useState(false)

    const fetchBreaks = async () => {
        setLoading(true)
        try {
            // Mock data fallback if connection fails or is very slow
            const mockBreaks = [
                { id: 1, label: 'Morning Coffee', start_time: '10:30', duration_minutes: 15 },
                { id: 2, label: 'Lunch', start_time: '13:00', duration_minutes: 60 },
                { id: 3, label: 'Afternoon Break', start_time: '15:45', duration_minutes: 15 }
            ];

            const { data: { user } } = await supabase.auth.getUser()

            if (!user) {
                // If auth fails/timeouts, use mock data for UI demo
                console.warn('Auth failed/timeout, using mock data');
                setBreaks(mockBreaks)
                setLoading(false)
                return;
            }

            const { data, error } = await supabase
                .from('breaks')
                .select('*')
                .eq('profile_id', user.id)
                .order('start_time', { ascending: true })

            if (data) setBreaks(data)
            if (error) throw error

        } catch (error) {
            console.error('Error fetching breaks:', error)
            // Fallback to mock data on error so UI can be seen
            setBreaks([
                { id: 1, label: 'Morning Coffee (Offline)', start_time: '10:30', duration_minutes: 15 },
                { id: 2, label: 'Lunch (Offline)', start_time: '13:00', duration_minutes: 60 }
            ])
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchBreaks()
    }, [])

    const handleAddBreak = async (e) => {
        e.preventDefault()
        setIsSubmitting(true)
        try {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) throw new Error('You must be logged in');

            // For demo consistency, we add the break for all 7 days
            const allDaysBreaks = []
            for (let d = 0; d < 7; d++) {
                allDaysBreaks.push({
                    profile_id: user.id,
                    label: newBreak.label,
                    start_time: newBreak.startTime,
                    duration_minutes: parseInt(newBreak.duration),
                    day_of_week: d
                })
            }

            const { error } = await supabase.from('breaks').insert(allDaysBreaks)

            if (error) throw error;

            setShowAdd(false)
            fetchBreaks()
        } catch (error) {
            alert('Could not add break (Connection Issue): ' + error.message)
        } finally {
            setIsSubmitting(false)
        }
    }

    const deleteBreak = async (breakToCancel) => {
        if (!confirm(`Cancel this scheduled break (${breakToCancel.label}) for all days?`)) return
        try {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) throw new Error('Not logged in')

            await supabase.from('breaks').delete()
                .eq('profile_id', user.id)
                .eq('label', breakToCancel.label)
                .eq('start_time', breakToCancel.start_time)
                .eq('duration_minutes', breakToCancel.duration_minutes)

            fetchBreaks()
        } catch (e) {
            console.error(e)
        }
    }

    return (
        <div className="space-y-10">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
                <div>
                    <h2 className="text-3xl font-heading font-bold text-white tracking-tight">Time Breaks</h2>
                    <p className="text-slate-500 mt-1 font-medium">Manage your downtime and recovery slots</p>
                </div>
                <button
                    onClick={() => setShowAdd(!showAdd)}
                    className={`
                        w-full md:w-auto flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-bold transition-all shadow-lg active:scale-95 text-sm uppercase tracking-wide
                        ${showAdd
                            ? 'bg-slate-800 text-slate-300 border border-white/5 hover:bg-slate-700'
                            : 'bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-orange-500/20 hover:shadow-orange-500/40'
                        }
                    `}
                >
                    {showAdd ? <><X size={18} /> Cancel</> : <><Plus size={18} /> Add Break Slot</>}
                </button>
            </div>

            <AnimatePresence>
                {showAdd && (
                    <motion.div
                        initial={{ opacity: 0, height: 0, y: -20 }}
                        animate={{ opacity: 1, height: 'auto', y: 0 }}
                        exit={{ opacity: 0, height: 0, y: -20 }}
                        className="glass-card p-8"
                    >
                        <h3 className="text-lg font-bold mb-6 flex items-center gap-3 text-white border-b border-white/10 pb-4">
                            <Clock className="text-orange-500" size={20} />
                            Slot Configuration
                        </h3>
                        <form onSubmit={handleAddBreak} className="grid grid-cols-1 md:grid-cols-12 gap-6">
                            <div className="md:col-span-5 space-y-1">
                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Label</label>
                                <input
                                    placeholder="e.g. Staff Lunch"
                                    className="glass-input w-full"
                                    value={newBreak.label}
                                    onChange={e => setNewBreak({ ...newBreak, label: e.target.value })}
                                    required
                                />
                            </div>
                            <div className="md:col-span-3 space-y-1">
                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Start Time</label>
                                <input
                                    type="time"
                                    className="glass-input w-full"
                                    value={newBreak.startTime}
                                    onChange={e => setNewBreak({ ...newBreak, startTime: e.target.value })}
                                    required
                                />
                            </div>
                            <div className="md:col-span-2 space-y-1">
                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Mins</label>
                                <input
                                    type="number"
                                    className="glass-input w-full"
                                    value={newBreak.duration}
                                    onChange={e => setNewBreak({ ...newBreak, duration: e.target.value })}
                                    required
                                />
                            </div>
                            <div className="md:col-span-2 flex items-end">
                                <button
                                    disabled={isSubmitting}
                                    className="w-full bg-orange-500 hover:bg-orange-600 shadow-lg shadow-orange-500/20 py-3.5 rounded-xl font-bold text-white transition-all active:scale-95 flex items-center justify-center gap-2 h-[46px]"
                                >
                                    {isSubmitting ? <Loader2 className="animate-spin w-5 h-5" /> : 'Save'}
                                </button>
                            </div>
                        </form>
                    </motion.div>
                )}
            </AnimatePresence>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {loading ? (
                    <div className="col-span-full flex flex-col items-center py-20 text-slate-500">
                        <Loader2 className="w-10 h-10 animate-spin mb-4 text-orange-500" />
                        <p className="font-medium animate-pulse">Loading break slots...</p>
                    </div>
                ) : Object.values(breaks.reduce((acc, brk) => {
                    const key = `${brk.label}-${brk.start_time}-${brk.duration_minutes}`;
                    if (!acc[key]) acc[key] = { ...brk, days: [] };
                    acc[key].days.push(brk.day_of_week);
                    return acc;
                }, {})).map(brk => (
                    <motion.div
                        layout
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        key={`${brk.label}-${brk.start_time}`}
                        className="glass-card group hover:border-orange-500/30 p-6 transition-all hover:shadow-glow hover:shadow-orange-500/10"
                    >
                        <div className="flex justify-between items-start mb-6">
                            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-orange-500/10 to-amber-500/10 flex items-center justify-center text-orange-500 border border-orange-500/20 group-hover:scale-110 transition-transform duration-300">
                                <Coffee size={24} />
                            </div>
                            <button
                                onClick={() => deleteBreak(brk)}
                                className="p-2 text-slate-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all hover:bg-red-400/10 rounded-lg"
                            >
                                <Trash2 size={16} />
                            </button>
                        </div>

                        <div className="flex flex-col gap-0.5 mb-4">
                            <h3 className="text-lg font-bold text-white group-hover:text-orange-400 transition-colors">{brk.label}</h3>
                            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-tight">
                                {brk.days.length === 7 ? 'Daily' : brk.days.length === 5 && !brk.days.includes(0) && !brk.days.includes(6) ? 'Weekdays' : `${brk.days.length} Days`}
                            </p>
                        </div>

                        <div className="flex items-center gap-3 mt-auto">
                            <div className="flex items-center gap-1.5 text-slate-400 bg-white/5 px-2.5 py-1 rounded-md text-xs font-bold border border-white/5">
                                <Clock size={12} className="text-orange-400" /> {brk.start_time.slice(0, 5)}
                            </div>
                            <div className="flex items-center gap-1.5 text-slate-400 bg-white/5 px-2.5 py-1 rounded-md text-xs font-bold border border-white/5">
                                <Timer size={12} className="text-slate-400" /> {brk.duration_minutes}m
                            </div>
                        </div>
                    </motion.div>
                ))}
            </div>
        </div>
    )
}

const Timer = ({ size, className }) => (
    <svg
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
    >
        <line x1="10" y1="2" x2="14" y2="2" />
        <line x1="12" y1="14" x2="15" y2="11" />
        <circle cx="12" cy="14" r="8" />
    </svg>
)

export default BreakManagement
