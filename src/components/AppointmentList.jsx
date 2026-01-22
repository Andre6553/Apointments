import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { Play, Square, AlertCircle, Clock, ArrowRight, Plus, Timer, Calendar as CalendarIcon, Loader2 } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { format } from 'date-fns'
import AddAppointmentModal from './AddAppointmentModal'
import { calculateAndApplyDelay } from '../lib/delayEngine'

const AppointmentList = () => {
    const [appointments, setAppointments] = useState([])
    const [loading, setLoading] = useState(true)
    const [isModalOpen, setIsModalOpen] = useState(false)

    const fetchAppointments = async () => {
        setLoading(true)
        const { data, error } = await supabase
            .from('appointments')
            .select(`
                *,
                client:clients(first_name, last_name, phone)
            `)
            .order('scheduled_start', { ascending: true })

        if (data) setAppointments(data)
        setLoading(false)
    }

    useEffect(() => {
        fetchAppointments()
    }, [])

    const startAppointment = async (id) => {
        const startTime = new Date().toISOString()
        const { error } = await supabase
            .from('appointments')
            .update({ actual_start: startTime, status: 'active' })
            .eq('id', id)

        if (!error) {
            await calculateAndApplyDelay(id, startTime)
            fetchAppointments()
        }
    }

    const endAppointment = async (id) => {
        const { error } = await supabase
            .from('appointments')
            .update({ actual_end: new Date().toISOString(), status: 'completed' })
            .eq('id', id)
        if (!error) fetchAppointments()
    }

    return (
        <div className="space-y-10">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
                <div>
                    <h2 className="text-3xl font-extrabold text-white tracking-tight">Daily Schedule</h2>
                    <p className="text-slate-500 mt-1">Live occupancy and slot management</p>
                </div>
                <button
                    onClick={() => setIsModalOpen(true)}
                    className="w-full md:w-auto bg-blue-600 hover:bg-blue-500 text-white px-8 py-4 rounded-[1.5rem] font-bold transition-all shadow-xl shadow-blue-600/20 active:scale-95 flex items-center justify-center gap-2"
                >
                    <Plus size={20} /> Book Appointment
                </button>
            </div>

            <AddAppointmentModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onRefresh={fetchAppointments}
            />

            <div className="grid grid-cols-1 gap-6">
                {loading ? (
                    <div className="flex flex-col items-center py-20 text-slate-500">
                        <Loader2 className="w-10 h-10 animate-spin mb-4" />
                        <p>Synchronizing schedule...</p>
                    </div>
                ) : appointments.length === 0 ? (
                    <div className="bg-slate-900/50 border border-dashed border-white/10 p-20 rounded-[2.5rem] text-center">
                        <CalendarIcon size={64} className="mx-auto text-slate-700 mb-6" />
                        <h3 className="text-xl font-bold text-slate-400">Your schedule is empty</h3>
                        <p className="text-slate-500 mt-2">New appointments will appear here once booked.</p>
                    </div>
                ) : appointments.map((apt, index) => (
                    <motion.div
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.05 }}
                        key={apt.id}
                        className={`
                            relative group grid grid-cols-1 lg:grid-cols-4 items-center gap-6 p-6 rounded-[2rem] border transition-all
                            ${apt.status === 'active'
                                ? 'bg-blue-600/5 border-blue-500/30 shadow-2xl shadow-blue-500/10'
                                : 'bg-slate-900/40 border-white/5 hover:border-white/10 hover:bg-slate-800/40'
                            }
                        `}
                    >
                        {/* Status Badge (Mobile Top) */}
                        <div className="lg:hidden flex justify-between items-center w-full mb-2">
                            <span className={`text-[10px] font-bold uppercase tracking-widest px-3 py-1 rounded-full ${apt.status === 'active' ? 'bg-blue-500 text-white' :
                                    apt.status === 'completed' ? 'bg-emerald-500/20 text-emerald-400' :
                                        'bg-slate-800 text-slate-500'
                                }`}>
                                {apt.status}
                            </span>
                        </div>

                        {/* Column 1: Time */}
                        <div className="flex items-center gap-4">
                            <div className={`
                                w-20 h-20 rounded-2xl flex flex-col items-center justify-center border shadow-inner transition-colors
                                ${apt.status === 'active' ? 'bg-blue-600 border-blue-400 text-white' : 'bg-slate-800/80 border-slate-700 text-slate-300'}
                            `}>
                                <span className="text-[10px] font-bold uppercase tracking-tighter opacity-70">Start</span>
                                <span className="text-2xl font-black">{format(new Date(apt.scheduled_start), 'HH:mm')}</span>
                            </div>
                            <div className="h-10 w-px bg-white/5 hidden lg:block" />
                        </div>

                        {/* Column 2: Client Info */}
                        <div className="lg:col-span-1">
                            <div className="flex items-center gap-2">
                                <h4 className="font-bold text-xl text-white truncate">
                                    {apt.client?.first_name} {apt.client?.last_name}
                                </h4>
                                {apt.status === 'active' && (
                                    <span className="flex h-2.5 w-2.5 rounded-full bg-blue-500 animate-pulse border-2 border-white/20"></span>
                                )}
                            </div>
                            <div className="flex flex-wrap items-center gap-3 text-sm font-medium mt-1">
                                <span className="flex items-center gap-1.5 text-slate-400 bg-white/5 px-2.5 py-1 rounded-full">
                                    <Timer size={14} className="text-slate-500" /> {apt.duration_minutes}m
                                </span>
                                {apt.delay_minutes > 0 ? (
                                    <span className="flex items-center gap-1.5 text-red-400 bg-red-400/10 px-2.5 py-1 rounded-full">
                                        <AlertCircle size={14} /> +{apt.delay_minutes}m delay
                                    </span>
                                ) : (
                                    <span className="text-[10px] uppercase font-bold text-emerald-500/50">Scheduled</span>
                                )}
                            </div>
                        </div>

                        {/* Column 3: Live Status / Notes */}
                        <div className="hidden lg:flex items-center justify-center">
                            {apt.status === 'active' ? (
                                <div className="text-center">
                                    <p className="text-[10px] font-bold text-blue-400 uppercase tracking-[0.2em] mb-1">Live Now</p>
                                    <p className="text-sm text-slate-500 italic">Tracking performance...</p>
                                </div>
                            ) : apt.status === 'completed' ? (
                                <div className="text-center opacity-50">
                                    <p className="text-[10px] font-bold text-emerald-400 uppercase tracking-[0.2em] mb-1">Finished</p>
                                    <p className="text-sm text-slate-500 italic">Session documented</p>
                                </div>
                            ) : (
                                <p className="text-sm text-slate-600 truncate max-w-[150px]">{apt.notes || 'No notes'}</p>
                            )}
                        </div>

                        {/* Column 4: Actions */}
                        <div className="flex items-center justify-end w-full">
                            {apt.status === 'pending' && (
                                <button
                                    onClick={() => startAppointment(apt.id)}
                                    className="w-full lg:w-auto bg-white/5 hover:bg-blue-600 group/btn border border-white/5 hover:border-blue-400 hover:shadow-lg hover:shadow-blue-500/20 text-white flex items-center justify-center gap-3 px-8 py-3.5 rounded-2xl font-bold transition-all active:scale-95"
                                >
                                    <Play size={20} className="fill-blue-500 group-hover/btn:fill-white transition-colors" />
                                    <span>Start Session</span>
                                </button>
                            )}
                            {apt.status === 'active' && (
                                <button
                                    onClick={() => endAppointment(apt.id)}
                                    className="w-full lg:w-auto bg-red-600 hover:bg-red-500 text-white flex items-center justify-center gap-3 px-8 py-3.5 rounded-2xl font-bold animate-pulse shadow-xl shadow-red-500/20 active:scale-95"
                                >
                                    <Square size={20} className="fill-white" />
                                    <span>End Session</span>
                                </button>
                            )}
                            {apt.status === 'completed' && (
                                <div className="flex items-center gap-2 text-emerald-400 font-black bg-emerald-400/5 border border-emerald-400/20 px-6 py-3 rounded-2xl opacity-75">
                                    COMPLETED <ArrowRight size={18} />
                                </div>
                            )}
                        </div>
                    </motion.div>
                ))}
            </div>
        </div>
    )
}

export default AppointmentList
