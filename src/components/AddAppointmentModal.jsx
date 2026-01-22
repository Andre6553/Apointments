import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { X, Calendar, Clock, User, MessageCircle, ArrowRight, Loader2 } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { format } from 'date-fns'

const AddAppointmentModal = ({ isOpen, onClose, onRefresh }) => {
    const [clients, setClients] = useState([])
    const [formData, setFormData] = useState({
        clientId: '',
        date: format(new Date(), 'yyyy-MM-dd'),
        time: '09:00',
        duration: 30,
        notes: ''
    })
    const [loading, setLoading] = useState(false)
    const [fetchingClients, setFetchingClients] = useState(false)

    useEffect(() => {
        if (isOpen) {
            fetchClients()
        }
    }, [isOpen])

    const fetchClients = async () => {
        setFetchingClients(true)
        const { data } = await supabase.from('clients').select('*').order('first_name')
        if (data) setClients(data)
        setFetchingClients(false)
    }

    const handleSubmit = async (e) => {
        e.preventDefault()
        setLoading(true)

        const { data: { user } } = await supabase.auth.getUser()
        const scheduledStart = new Date(`${formData.date}T${formData.time}:00`).toISOString()

        const { error } = await supabase.from('appointments').insert([{
            client_id: formData.clientId,
            assigned_profile_id: user.id,
            scheduled_start: scheduledStart,
            duration_minutes: parseInt(formData.duration),
            notes: formData.notes,
            status: 'pending'
        }])

        if (!error) {
            onRefresh()
            onClose()
        } else {
            alert(error.message)
        }
        setLoading(false)
    }

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="absolute inset-0 bg-black/80 backdrop-blur-md"
                    />

                    <motion.div
                        initial={{ opacity: 0, scale: 0.9, y: 30 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.9, y: 30 }}
                        className="relative w-full max-w-xl bg-slate-900 border border-white/10 rounded-[2.5rem] shadow-3xl overflow-hidden"
                    >
                        <div className="p-8 border-b border-white/5 flex justify-between items-center bg-slate-800/30">
                            <div>
                                <h3 className="text-2xl font-black text-white flex items-center gap-3">
                                    <div className="p-2.5 rounded-2xl bg-blue-600/20 border border-blue-500/20">
                                        <Calendar className="text-blue-400" size={24} />
                                    </div>
                                    Book Session
                                </h3>
                                <p className="text-slate-500 text-sm mt-1 ml-12">Confirm your next appointment slot</p>
                            </div>
                            <button onClick={onClose} className="p-3 hover:bg-white/10 rounded-2xl transition-all"><X size={20} /></button>
                        </div>

                        <form onSubmit={handleSubmit} className="p-10 space-y-8">
                            <div className="space-y-3">
                                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest ml-1">Select Client</label>
                                <div className="relative group">
                                    <User size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-blue-400 transition-colors" />
                                    <select
                                        className="w-full bg-slate-800/50 border border-slate-700 p-4 pl-12 rounded-2xl outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all text-white appearance-none h-[60px]"
                                        value={formData.clientId}
                                        onChange={e => setFormData({ ...formData, clientId: e.target.value })}
                                        required
                                    >
                                        <option value="" className="bg-slate-900">Choose from directory...</option>
                                        {clients.map(c => (
                                            <option key={c.id} value={c.id} className="bg-slate-900">{c.first_name} {c.last_name}</option>
                                        ))}
                                    </select>
                                    {fetchingClients && <Loader2 className="absolute right-10 top-1/2 -translate-y-1/2 animate-spin text-blue-500" size={18} />}
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                <div className="space-y-3">
                                    <label className="text-xs font-bold text-slate-500 uppercase tracking-widest ml-1">Target Date</label>
                                    <div className="relative group">
                                        <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-blue-400 transition-colors" size={20} />
                                        <input
                                            type="date"
                                            className="w-full bg-slate-800/50 border border-slate-700 p-4 pl-12 rounded-2xl outline-none focus:border-blue-500 transition-all text-white h-[60px]"
                                            value={formData.date}
                                            onChange={e => setFormData({ ...formData, date: e.target.value })}
                                            required
                                        />
                                    </div>
                                </div>
                                <div className="space-y-3">
                                    <label className="text-xs font-bold text-slate-500 uppercase tracking-widest ml-1">Start Time</label>
                                    <div className="relative group">
                                        <Clock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-blue-400 transition-colors" size={20} />
                                        <input
                                            type="time"
                                            className="w-full bg-slate-800/50 border border-slate-700 p-4 pl-12 rounded-2xl outline-none focus:border-blue-500 transition-all text-white h-[60px]"
                                            value={formData.time}
                                            onChange={e => setFormData({ ...formData, time: e.target.value })}
                                            required
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                <div className="space-y-3">
                                    <label className="text-xs font-bold text-slate-500 uppercase tracking-widest ml-1">Duration (min)</label>
                                    <input
                                        type="number"
                                        step="15"
                                        className="w-full bg-slate-800/50 border border-slate-700 p-4 rounded-2xl outline-none focus:border-blue-500 transition-all text-white h-[60px]"
                                        value={formData.duration}
                                        onChange={e => setFormData({ ...formData, duration: e.target.value })}
                                        required
                                    />
                                </div>
                                <div className="space-y-3">
                                    <label className="text-xs font-bold text-slate-500 uppercase tracking-widest ml-1">Notes</label>
                                    <div className="relative group">
                                        <MessageCircle className="absolute left-4 top-[22px] text-slate-500 group-focus-within:text-blue-400 transition-colors" size={20} />
                                        <textarea
                                            className="w-full bg-slate-800/50 border border-slate-700 p-4 pl-12 rounded-2xl outline-none focus:border-blue-500 transition-all text-white h-[60px] resize-none pt-4"
                                            placeholder="Service details..."
                                            value={formData.notes}
                                            onChange={e => setFormData({ ...formData, notes: e.target.value })}
                                        />
                                    </div>
                                </div>
                            </div>

                            <button
                                disabled={loading}
                                className="w-full group bg-gradient-to-r from-blue-600 to-emerald-600 p-5 rounded-2xl font-bold hover:shadow-2xl hover:shadow-blue-500/20 active:scale-[0.98] transition-all flex items-center justify-center gap-3 mt-4"
                            >
                                {loading ? (
                                    <Loader2 className="animate-spin" />
                                ) : (
                                    <>
                                        <span className="text-lg">Confirm Appointment Slot</span>
                                        <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
                                    </>
                                )}
                            </button>
                        </form>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    )
}

export default AddAppointmentModal
