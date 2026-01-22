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
        const { data: { user } } = await supabase.auth.getUser()
        const { data, error } = await supabase
            .from('breaks')
            .select('*')
            .eq('profile_id', user.id)
            .order('start_time', { ascending: true })

        if (data) setBreaks(data)
        setLoading(false)
    }

    useEffect(() => {
        fetchBreaks()
    }, [])

    const handleAddBreak = async (e) => {
        e.preventDefault()
        setIsSubmitting(true)
        const { data: { user } } = await supabase.auth.getUser()

        const { error } = await supabase.from('breaks').insert([{
            profile_id: user.id,
            label: newBreak.label,
            start_time: newBreak.startTime,
            duration_minutes: parseInt(newBreak.duration),
            day_of_week: new Date().getDay()
        }])

        if (!error) {
            setShowAdd(false)
            fetchBreaks()
        } else {
            alert(error.message)
        }
        setIsSubmitting(false)
    }

    const deleteBreak = async (id) => {
        if (!confirm('Cancel this scheduled break?')) return
        const { error } = await supabase.from('breaks').delete().eq('id', id)
        if (!error) fetchBreaks()
    }

    return (
        <div className="space-y-10">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
                <div>
                    <h2 className="text-3xl font-extrabold text-white tracking-tight">Time Breaks</h2>
                    <p className="text-slate-500 mt-1">Manage your downtime and recovery slots</p>
                </div>
                <button
                    onClick={() => setShowAdd(!showAdd)}
                    className={`
                        w-full md:w-auto flex items-center justify-center gap-3 px-8 py-4 rounded-[1.5rem] font-bold transition-all shadow-xl active:scale-95
                        ${showAdd
                            ? 'bg-slate-800 text-slate-300 border border-white/5'
                            : 'bg-orange-600/20 text-orange-400 border border-orange-500/20 hover:bg-orange-600/30 shadow-orange-500/10'
                        }
                    `}
                >
                    {showAdd ? <><X size={20} /> Close Form</> : <><Coffee size={20} /> Schedule Break</>}
                </button>
            </div>

            <AnimatePresence>
                {showAdd && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: -20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: -20 }}
                        className="bg-slate-900/50 backdrop-blur-xl border border-white/5 p-8 rounded-[2.5rem] shadow-2xl"
                    >
                        <h3 className="text-xl font-bold mb-8 flex items-center gap-3">
                            <Clock className="text-orange-400" size={24} />
                            Slot Configuration
                        </h3>
                        <form onSubmit={handleAddBreak} className="grid grid-cols-1 md:grid-cols-3 gap-8">
                            <div className="space-y-3">
                                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest ml-1">Label</label>
                                <input
                                    placeholder="e.g. Staff Lunch"
                                    className="w-full bg-slate-800/50 p-4 rounded-xl border border-slate-700 focus:border-orange-500 outline-none transition-all text-white"
                                    value={newBreak.label}
                                    onChange={e => setNewBreak({ ...newBreak, label: e.target.value })}
                                    required
                                />
                            </div>
                            <div className="space-y-3">
                                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest ml-1">Start Time</label>
                                <input
                                    type="time"
                                    className="w-full bg-slate-800/50 p-4 rounded-xl border border-slate-700 focus:border-orange-500 outline-none transition-all text-white"
                                    value={newBreak.startTime}
                                    onChange={e => setNewBreak({ ...newBreak, startTime: e.target.value })}
                                    required
                                />
                            </div>
                            <div className="space-y-3">
                                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest ml-1">Duration (min)</label>
                                <input
                                    type="number"
                                    className="w-full bg-slate-800/50 p-4 rounded-xl border border-slate-700 focus:border-orange-500 outline-none transition-all text-white"
                                    value={newBreak.duration}
                                    onChange={e => setNewBreak({ ...newBreak, duration: e.target.value })}
                                    required
                                />
                            </div>
                            <button
                                disabled={isSubmitting}
                                className="md:col-span-3 bg-orange-600 hover:bg-orange-500 shadow-lg shadow-orange-600/20 py-4 rounded-xl font-bold text-white transition-all active:scale-95 flex items-center justify-center gap-2"
                            >
                                {isSubmitting ? <Loader2 className="animate-spin" /> : 'Confirm Scheduled break'}
                            </button>
                        </form>
                    </motion.div>
                )}
            </AnimatePresence>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {loading ? (
                    <div className="col-span-full flex flex-col items-center py-20 text-slate-500">
                        <Loader2 className="w-10 h-10 animate-spin mb-4" />
                        <p>Loading break slots...</p>
                    </div>
                ) : breaks.length === 0 ? (
                    <div className="col-span-full border border-dashed border-white/10 rounded-[2.5rem] p-20 text-center">
                        <Coffee className="mx-auto text-slate-700 mb-6" size={48} />
                        <p className="text-slate-500 text-lg">You haven't scheduled any breaks today.</p>
                        <p className="text-slate-600 text-sm">Use the form above to reserve some downtime.</p>
                    </div>
                ) : breaks.map(brk => (
                    <motion.div
                        layout
                        key={brk.id}
                        className="group relative bg-slate-900/40 hover:bg-orange-500/5 border border-white/5 hover:border-orange-500/20 p-6 rounded-[2rem] transition-all hover:shadow-2xl"
                    >
                        <div className="flex justify-between items-start mb-6">
                            <div className="w-14 h-14 rounded-2xl bg-orange-600/10 flex items-center justify-center text-orange-400 border border-orange-500/10 group-hover:bg-orange-600/20 transition-all">
                                <Coffee size={24} />
                            </div>
                            <button
                                onClick={() => deleteBreak(brk.id)}
                                className="p-3 text-slate-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all hover:bg-red-400/5 rounded-xl"
                            >
                                <Trash2 size={18} />
                            </button>
                        </div>

                        <h3 className="text-xl font-bold mb-4 text-white group-hover:text-orange-400 transition-colors">{brk.label}</h3>

                        <div className="flex items-center gap-4">
                            <div className="flex items-center gap-2 text-slate-400 bg-white/5 px-3 py-1.5 rounded-full text-sm font-bold">
                                <Clock size={16} className="text-orange-400" /> {brk.start_time.slice(0, 5)}
                            </div>
                            <div className="flex items-center gap-2 text-slate-400 bg-white/5 px-3 py-1.5 rounded-full text-sm font-bold">
                                <Timer size={16} className="text-slate-500" /> {brk.duration_minutes}m
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
