import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { X, Calendar, Clock, User, MessageCircle, ArrowRight, Loader2, Timer } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { format } from 'date-fns';

const AddAppointmentModal = ({ isOpen, onClose, onRefresh }) => {
    const [clients, setClients] = useState([]);
    const [formData, setFormData] = useState({
        clientId: '',
        date: format(new Date(), 'yyyy-MM-dd'),
        time: '09:00',
        duration: 30,
        notes: ''
    });
    const [loading, setLoading] = useState(false);
    const [fetchingClients, setFetchingClients] = useState(false);

    useEffect(() => {
        if (isOpen) {
            fetchClients();
        }
    }, [isOpen]);

    const fetchClients = async () => {
        setFetchingClients(true);
        const { data } = await supabase.from('clients').select('*').order('first_name');
        if (data) setClients(data);
        setFetchingClients(false);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);

        try {
            const { data: { user } } = await supabase.auth.getUser();

            if (!user) throw new Error('You must be logged in to create an appointment.');

            const scheduledStart = new Date(`${formData.date}T${formData.time}:00`).toISOString();

            const { error } = await supabase.from('appointments').insert([{
                client_id: formData.clientId,
                assigned_profile_id: user.id,
                scheduled_start: scheduledStart,
                duration_minutes: parseInt(formData.duration),
                notes: formData.notes,
                status: 'pending'
            }]);

            if (error) throw error;

            onRefresh();
            onClose();
        } catch (error) {
            console.error('Error creating appointment:', error);
            alert(error.message || 'Failed to create appointment');
        } finally {
            setLoading(false);
        }
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 overflow-y-auto">
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="absolute inset-0 bg-black/80 backdrop-blur-md"
                    />

                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        className="relative w-full max-w-xl glass-card border-white/10 shadow-2xl overflow-hidden my-8"
                    >
                        <div className="p-6 border-b border-white/5 flex justify-between items-center bg-white/[0.02]">
                            <div className="flex items-center gap-3">
                                <div className="p-2.5 rounded-xl bg-primary/10 border border-primary/20">
                                    <Calendar className="text-primary" size={20} />
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold text-white">New Booking</h3>
                                    <p className="text-slate-500 text-[10px] uppercase tracking-widest font-bold">Appointment Scheduling</p>
                                </div>
                            </div>
                            <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-xl transition-all"><X size={20} className="text-slate-500" /></button>
                        </div>

                        <form onSubmit={handleSubmit} className="p-8 space-y-6">
                            <div className="space-y-1">
                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Select Client</label>
                                <div className="relative group">
                                    <User size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-primary transition-colors" />
                                    <select
                                        className="glass-input w-full pl-12 h-14"
                                        value={formData.clientId}
                                        onChange={e => setFormData({ ...formData, clientId: e.target.value })}
                                        required
                                    >
                                        <option value="" className="bg-slate-900">Choose from directory...</option>
                                        {clients.map(c => (
                                            <option key={c.id} value={c.id} className="bg-slate-900">{c.first_name} {c.last_name}</option>
                                        ))}
                                    </select>
                                    {fetchingClients && <Loader2 className="absolute right-10 top-1/2 -translate-y-1/2 animate-spin text-primary" size={16} />}
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Target Date</label>
                                    <div className="relative group">
                                        <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-primary transition-colors" size={18} />
                                        <input
                                            type="date"
                                            className="glass-input w-full pl-12 h-14"
                                            value={formData.date}
                                            onChange={e => setFormData({ ...formData, date: e.target.value })}
                                            required
                                        />
                                    </div>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Start Time</label>
                                    <div className="relative group">
                                        <Clock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-primary transition-colors" size={18} />
                                        <input
                                            type="time"
                                            className="glass-input w-full pl-12 h-14"
                                            value={formData.time}
                                            onChange={e => setFormData({ ...formData, time: e.target.value })}
                                            required
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Duration (min)</label>
                                    <div className="relative group">
                                        <Timer className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-primary transition-colors" size={18} />
                                        <input
                                            type="number"
                                            step="15"
                                            className="glass-input w-full pl-12 h-14"
                                            value={formData.duration}
                                            onChange={e => setFormData({ ...formData, duration: e.target.value })}
                                            required
                                        />
                                    </div>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Notes</label>
                                    <div className="relative group">
                                        <MessageCircle className="absolute left-4 top-4 text-slate-500 group-focus-within:text-primary transition-colors" size={18} />
                                        <textarea
                                            className="glass-input w-full pl-12 h-14 resize-none"
                                            placeholder="Service details..."
                                            value={formData.notes}
                                            onChange={e => setFormData({ ...formData, notes: e.target.value })}
                                        />
                                    </div>
                                </div>
                            </div>

                            <button
                                disabled={loading}
                                className="w-full bg-primary hover:bg-indigo-600 text-white p-4 rounded-xl font-bold shadow-lg shadow-primary/20 active:scale-[0.98] transition-all flex items-center justify-center gap-3 mt-4 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {loading ? (
                                    <Loader2 className="animate-spin w-5 h-5" />
                                ) : (
                                    <>
                                        <span>Confirm Booking Slot</span>
                                        <ArrowRight size={18} />
                                    </>
                                )}
                            </button>
                        </form>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
};

export default AddAppointmentModal;
