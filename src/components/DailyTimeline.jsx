import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { format, startOfDay, endOfDay, addMinutes, isWithinInterval, parseISO, isSameDay } from 'date-fns'
import { motion, AnimatePresence } from 'framer-motion'
import { Edit2, Clock, Coffee, User, Calendar as CalendarIcon, Loader2, Moon, AlertTriangle, ArrowRight, Trash2 } from 'lucide-react'
import AddAppointmentModal from './AddAppointmentModal'
import TransferModal from './TransferModal'
import CancelAppointmentModal from './CancelAppointmentModal'
import { getCache, setCache, CACHE_KEYS } from '../lib/cache'

const DailyTimeline = ({ selectedDate = new Date() }) => {
    const { user, profile } = useAuth()
    const [events, setEvents] = useState(() => getCache(CACHE_KEYS.TIMELINE) || [])
    const [rawAppointments, setRawAppointments] = useState([])
    const [workingHours, setWorkingHours] = useState(() => getCache(CACHE_KEYS.DAILY_WORKING_HOURS) || null)
    const [loading, setLoading] = useState(!getCache(CACHE_KEYS.TIMELINE))
    const [bufferSettings, setBufferSettings] = useState({ enabled: false, duration: 0 })
    const [now, setNow] = useState(new Date())
    const [selectedApt, setSelectedApt] = useState(null)
    const [isTransferOpen, setIsTransferOpen] = useState(false)
    const [isCancelOpen, setIsCancelOpen] = useState(false)
    const [isEditOpen, setIsEditOpen] = useState(false)
    const [editData, setEditData] = useState(null)
    const [selectedCancelApt, setSelectedCancelApt] = useState(null)

    useEffect(() => {
        const timer = setInterval(() => setNow(new Date()), 60000)
        return () => clearInterval(timer)
    }, [])

    const fetchData = async (silent = false, useOptimistic = false) => {
        if (useOptimistic) {
            const cachedEvents = getCache(CACHE_KEYS.TIMELINE);
            const cachedHours = getCache(CACHE_KEYS.DAILY_WORKING_HOURS);
            if (cachedEvents) setEvents(cachedEvents);
            if (cachedHours) setWorkingHours(cachedHours);
        }
        if (!user) return
        if (!silent) setLoading(true)

        // Safety timeout to ensure loading doesn't get stuck
        const timeout = setTimeout(() => {
            setLoading(false)
        }, 5000)

        try {
            const dateStr = format(selectedDate, 'yyyy-MM-dd')
            const dayOfWeek = selectedDate.getDay()

            // Parallel fetching
            let aptQuery = supabase
                .from('appointments')
                .select(`
                    *,
                    client:clients(first_name, last_name),
                    provider:profiles!appointments_assigned_profile_id_fkey(full_name)
                `)
                .in('status', ['pending', 'active', 'completed'])
                .gte('scheduled_start', `${dateStr}T00:00:00`)
                .lte('scheduled_start', `${dateStr}T23:59:59`)

            if (profile?.role !== 'Admin') {
                aptQuery = aptQuery.eq('assigned_profile_id', user.id)
            }

            const [hoursRes, aptsRes, breaksRes, profileRes] = await Promise.all([
                supabase.from('working_hours').select('*').eq('profile_id', user.id).eq('day_of_week', dayOfWeek).maybeSingle(),
                aptQuery,
                supabase.from('breaks').select('*').eq('profile_id', user.id).eq('day_of_week', dayOfWeek),
                supabase.from('profiles').select('enable_buffer, buffer_minutes').eq('id', user.id).single()
            ])

            setWorkingHours(hoursRes.data || null)
            setRawAppointments(aptsRes.data || [])
            setCache(CACHE_KEYS.DAILY_WORKING_HOURS, hoursRes.data || null)
            setBufferSettings({
                enabled: profileRes.data?.enable_buffer || false,
                duration: profileRes.data?.buffer_minutes || 0
            })

            const timelineEvents = [
                ...(aptsRes.data?.map(a => {
                    const start = new Date((a.status === 'active' || a.status === 'completed') && a.actual_start ? a.actual_start : a.scheduled_start)
                    const aptStartMins = start.getHours() * 60 + start.getMinutes()
                    const duration = parseInt(a.duration_minutes) || 0
                    const aptEndMins = aptStartMins + duration

                    const shiftStartMins = hoursRes.data?.start_time ? timeToMinutes(hoursRes.data.start_time) : 0
                    const shiftEndMins = hoursRes.data?.end_time ? timeToMinutes(hoursRes.data.end_time) : 1440
                    const isClosed = hoursRes.data?.is_active === false
                    const isOutOfBounds = isClosed || aptStartMins < shiftStartMins || aptEndMins > (shiftEndMins + 1)

                    return {
                        id: a.id,
                        type: 'appointment',
                        start,
                        duration,
                        label: profile?.role === 'Admin'
                            ? `${a.client?.first_name} ${a.client?.last_name} (${a.provider?.full_name || 'Unassigned'})`
                            : `${a.client?.first_name} ${a.client?.last_name}`,
                        status: a.status,
                        isOutOfBounds
                    }
                }) || []),
                ...(breaksRes.data?.map(b => {
                    const [h, m] = b.start_time.split(':').map(Number)
                    const start = new Date(selectedDate)
                    start.setHours(h, m, 0, 0)

                    const breakStartMins = h * 60 + m
                    const duration = parseInt(b.duration_minutes) || 0
                    const breakEndMins = breakStartMins + duration

                    const shiftStartMins = hoursRes.data?.start_time ? timeToMinutes(hoursRes.data.start_time) : 0
                    const shiftEndMins = hoursRes.data?.end_time ? timeToMinutes(hoursRes.data.end_time) : 1440

                    // If shifts are active, check bounds. If inactive or missing, everything is "OOO" unless it's a 24h setup
                    const isClosed = hoursRes.data?.is_active === false
                    const isOutOfBounds = isClosed || breakStartMins < shiftStartMins || breakEndMins > (shiftEndMins + 1) // +1 for 23:59 edge cases

                    return {
                        id: b.id,
                        type: 'break',
                        start,
                        duration,
                        label: b.label,
                        isOutOfBounds
                    }
                }) || [])
            ]

            setEvents(timelineEvents)
            setCache(CACHE_KEYS.TIMELINE, timelineEvents)
        } catch (error) {
            console.error("Error fetching timeline data:", error)
        } finally {
            clearTimeout(timeout)
            setLoading(false)
        }
    }

    const dateKey = format(selectedDate, 'yyyy-MM-dd')

    useEffect(() => {
        if (!user) return;
        const hasCache = getCache(CACHE_KEYS.TIMELINE);
        fetchData(!!hasCache)

        // Realtime Subscription
        const aptFilter = profile?.role === 'Admin' ? undefined : `assigned_profile_id=eq.${user?.id}`

        const channel = supabase.channel(`timeline-${user?.id}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments', ...(aptFilter ? { filter: aptFilter } : {}) }, () => fetchData(true))
            .on('postgres_changes', { event: '*', schema: 'public', table: 'breaks', filter: `profile_id=eq.${user?.id}` }, () => fetchData(true))
            .on('postgres_changes', { event: '*', schema: 'public', table: 'working_hours', filter: `profile_id=eq.${user?.id}` }, () => fetchData(true))
            .subscribe()

        return () => {
            supabase.removeChannel(channel)
        }
    }, [dateKey, user?.id, profile?.role])

    const timeToMinutes = (timeStr) => {
        if (!timeStr || typeof timeStr !== 'string') return 0
        const [h, m] = timeStr.split(':').map(Number)
        return (h || 0) * 60 + (m || 0)
    }

    const isToday = isSameDay(selectedDate, new Date())

    // 1. Calculate the start of our timeline viewport (Past time is hidden)
    const baseStartMinutes = (workingHours && !Array.isArray(workingHours)) ? timeToMinutes(workingHours.start_time) : 8 * 60
    const startMinutes = isToday
        ? now.getHours() * 60 + now.getMinutes()
        : baseStartMinutes

    const endMinutes = (workingHours && !Array.isArray(workingHours)) ? timeToMinutes(workingHours.end_time) : 17 * 60
    const totalMinutes = Math.max(60, endMinutes - startMinutes)

    const getPosition = (dateValue) => {
        const date = dateValue instanceof Date ? dateValue : new Date(dateValue)
        if (isNaN(date.getTime())) return 0
        const mins = date.getHours() * 60 + date.getMinutes()
        const pos = ((mins - startMinutes) / totalMinutes) * 100
        return Math.max(0, pos)
    }

    const getDurationHeight = (duration) => {
        return (duration / totalMinutes) * 100
    }

    const timelineHours = []
    // Add 'Now' marker if today
    if (isToday) timelineHours.push(startMinutes)

    // Add subsequent full hours
    const firstFullHour = Math.ceil(startMinutes / 60) * 60
    for (let m = firstFullHour; m <= endMinutes; m += 60) {
        if (m > startMinutes) timelineHours.push(m)
    }

    return (
        <div className="glass-card p-0 overflow-hidden">
            <div className="p-6 border-b border-white/5 bg-white/[0.02] flex justify-between items-center">
                <div className="flex items-center gap-3">
                    <Clock className="text-primary" size={20} />
                    <h3 className="font-bold text-white">Daily Timeline</h3>
                </div>
                <div className="flex flex-col items-end gap-0.5">
                    <div className="text-2xl font-black text-white leading-none tracking-tight">
                        {format(now, 'HH:mm')}
                    </div>
                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest leading-none">
                        {format(selectedDate, 'EEEE, MMM do')}
                    </div>
                </div>
            </div>

            <div className="relative p-6 h-[600px] overflow-y-auto scrollbar-hide">
                {loading ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/50 backdrop-blur-sm z-50 text-slate-500">
                        <Loader2 className="w-8 h-8 animate-spin mb-2" />
                        <span className="text-sm font-medium">Syncing timeline...</span>
                    </div>
                ) : (
                    <div className="relative h-[1200px] mt-4 ml-12">
                        {/* Hour Grid */}
                        {timelineHours.map(m => (
                            <div
                                key={m}
                                className={`absolute left-0 right-0 border-t flex items-center transition-colors duration-500 ${m === startMinutes && isToday ? 'border-primary/40' : 'border-white/[0.03]'}`}
                                style={{ top: `${((m - startMinutes) / totalMinutes) * 100}%` }}
                            >
                                <span className={`absolute -left-12 text-[9px] font-black w-10 text-right tracking-tighter ${m === startMinutes && isToday ? 'text-primary' : 'text-slate-700'}`}>
                                    {Math.floor(m / 60).toString().padStart(2, '0')}:{Math.floor(m % 60).toString().padStart(2, '0')}
                                </span>
                            </div>
                        ))}

                        {/* Working Hours Background */}
                        {workingHours?.is_active !== false && workingHours?.start_time ? (
                            <div
                                className="absolute left-0 right-0 bg-primary/5 border-l-2 border-primary/20"
                                style={{
                                    top: `${getPosition(new Date(selectedDate).setHours(...workingHours.start_time.split(':').map(Number), 0, 0))}%`,
                                    height: `${getDurationHeight(timeToMinutes(workingHours.end_time) - timeToMinutes(workingHours.start_time))}%`
                                }}
                            />
                        ) : (
                            <div className="absolute inset-x-0 top-0 bottom-0 bg-slate-950/40 backdrop-blur-[2px] z-0 flex items-center justify-center border border-white/5 rounded-xl pointer-events-none">
                                <div className="flex flex-col items-center gap-2 group">
                                    <div className="p-4 rounded-full bg-slate-900 border border-white/10 shadow-xl group-hover:scale-110 transition-transform">
                                        <Moon className="text-slate-500" size={32} />
                                    </div>
                                    <span className="text-lg font-bold text-slate-500 uppercase tracking-[0.3em]">{workingHours?.is_active === false ? 'Shop Closed' : 'No Hours Set'}</span>
                                </div>
                            </div>
                        )}

                        {/* Empty State Message if no events */}
                        {!loading && events.length === 0 && (
                            <div className="absolute inset-x-8 top-1/4 flex flex-col items-center justify-center text-center p-8 glass-card border-dashed border-white/10 opacity-60">
                                <CalendarIcon size={32} className="text-slate-600 mb-3" />
                                <h4 className="text-sm font-bold text-slate-400">Empty Schedule</h4>
                                <p className="text-[10px] text-slate-500 max-w-[200px] mt-1">No sessions or breaks are currently scheduled for this day.</p>
                            </div>
                        )}

                        {(() => {
                            const filtered = events
                                .filter(event => {
                                    if (!isToday) return true;
                                    const startDate = new Date(event.start);
                                    const eventEnd = new Date(startDate.getTime() + event.duration * 60000);
                                    return eventEnd > now;
                                })
                                .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

                            // 2. Column Distribution Logic (Standard Calendar Slotting)
                            const columns = [];
                            filtered.forEach(event => {
                                const start = new Date(event.start).getTime();
                                let placed = false;
                                for (let i = 0; i < columns.length; i++) {
                                    const lastInCol = columns[i][columns[i].length - 1];
                                    const lastEnd = new Date(lastInCol.start).getTime() + lastInCol.duration * 60000;
                                    if (start >= lastEnd) {
                                        columns[i].push(event);
                                        event.colIndex = i;
                                        placed = true;
                                        break;
                                    }
                                }
                                if (!placed) {
                                    event.colIndex = columns.length;
                                    columns.push([event]);
                                }
                            });

                            const maxCols = columns.length || 1;

                            return filtered.map((event, idx) => {
                                const colWidth = 100 / maxCols;
                                const left = event.colIndex * colWidth;
                                const isActive = event.status === 'active';

                                return (
                                    <motion.div
                                        key={event.id}
                                        onClick={() => {
                                            if (event.type === 'appointment') {
                                                // Find the full raw appointment object
                                                const raw = rawAppointments.find(a => a.id === event.id);
                                                if (raw) {
                                                    setEditData(raw);
                                                    setIsEditOpen(true);
                                                }
                                            }
                                        }}
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        whileHover={{ zIndex: 50, scale: 1.01 }}
                                        className={`absolute rounded-xl border flex flex-col shadow-xl transition-all cursor-pointer group backdrop-blur-sm overflow-hidden optimize-gpu
                                        ${event.isOutOfBounds ? 'opacity-20 saturate-0 grayscale border-white/5' : 'opacity-100 border-white/10'}
                                        ${isActive ? 'ring-2 ring-primary/40 shadow-glow shadow-primary/20' : ''}
                                        ${event.type === 'appointment' ? 'bg-slate-900/95' : 'bg-slate-900/70'}
                                        `}
                                        style={{
                                            top: `${getPosition(event.start)}%`,
                                            height: `${getDurationHeight(
                                                isToday && new Date(event.start) < now ? Math.max(15, event.duration - (now - new Date(event.start)) / 60000) : event.duration
                                            )}%`,
                                            left: `${left}%`,
                                            width: `${colWidth - 0.5}%`,
                                            minHeight: '35px',
                                            zIndex: isActive ? 40 : 10
                                        }}
                                    >
                                        <div className={`absolute left-0 top-0 bottom-0 w-1 ${event.type === 'appointment' ? 'bg-indigo-500' : 'bg-amber-500'} ${isActive ? 'animate-pulse' : ''}`} />

                                        <div className="flex flex-col h-full p-2 relative z-10">
                                            <div className="flex items-start justify-between gap-1 overflow-hidden">
                                                <div className="flex flex-col min-w-0">
                                                    <span className={`font-black uppercase tracking-tight leading-none truncate ${maxCols > 2 ? 'text-[8px]' : 'text-[10px] sm:text-xs'} ${isActive ? 'text-primary' : 'text-white'}`}>
                                                        {event.label}
                                                    </span>
                                                    <div className={`flex items-center gap-1.5 mt-1 opacity-60 font-bold ${maxCols > 3 ? 'text-[7px]' : 'text-[9px]'}`}>
                                                        <span>{format(event.start, 'HH:mm')}</span>
                                                        <span>•</span>
                                                        <span>{event.duration}m</span>
                                                    </div>
                                                </div>

                                                {isActive && (
                                                    <div className="w-1.5 h-1.5 rounded-full bg-primary animate-ping shrink-0" />
                                                )}
                                            </div>

                                            {/* Minimal Buffer Indicator in card footer */}
                                            {event.type === 'appointment' && bufferSettings.enabled && bufferSettings.duration > 0 && event.duration > 20 && (
                                                <div className="mt-auto pt-1 flex items-center gap-1 opacity-30">
                                                    <div className="h-[1px] flex-grow bg-emerald-500/20" />
                                                    <span className="text-[6px] font-black text-emerald-400 uppercase tracking-widest whitespace-nowrap">+{bufferSettings.duration}m</span>
                                                </div>
                                            )}
                                        </div>
                                    </motion.div>
                                );
                            });
                        })()}

                        {/* Current Time Indicator */}
                        {format(now, 'yyyy-MM-dd') === format(selectedDate, 'yyyy-MM-dd') && (
                            <div
                                className="absolute left-0 right-0 border-t-2 border-rose-500 z-20 flex items-center"
                                style={{ top: `${getPosition(now)}%` }}
                            >
                                <div className="absolute -left-14 bg-rose-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded shadow-lg">
                                    {format(now, 'HH:mm')}
                                </div>
                                <div className="w-2 h-2 rounded-full bg-rose-500 absolute -left-1 shadow-glow shadow-rose-500/50" />
                            </div>
                        )}
                    </div>
                )}

                {selectedApt && (
                    <TransferModal
                        isOpen={isTransferOpen}
                        onClose={() => { setIsTransferOpen(false); setSelectedApt(null); }}
                        appointment={selectedApt}
                        onComplete={() => fetchData(true)}
                    />
                )}

                {selectedCancelApt && (
                    <CancelAppointmentModal
                        isOpen={isCancelOpen}
                        onClose={() => { setIsCancelOpen(false); setSelectedCancelApt(null); }}
                        appointment={selectedCancelApt}
                        onRefresh={() => fetchData(true)}
                    />
                )}

                {isEditOpen && editData && (
                    <AddAppointmentModal
                        isOpen={isEditOpen}
                        onClose={() => { setIsEditOpen(false); setEditData(null); }}
                        onRefresh={() => fetchData(true)}
                        editData={editData}
                    />
                )}
            </div>
        </div>
    )
}

export default DailyTimeline
