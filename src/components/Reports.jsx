import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { FileText, Download, Users, History, TrendingUp, Clock, AlertTriangle, CheckCircle2, Loader2, Calendar, ArrowRight, Shield, ShieldOff, Lock } from 'lucide-react'
import { motion } from 'framer-motion'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from 'date-fns'
import { useAuth } from '../hooks/useAuth'
import ReportPasswordScreen from './ReportPasswordScreen'

const Reports = () => {
    const { user, profile, updateProfile } = useAuth()
    const [history, setHistory] = useState([])
    const [loading, setLoading] = useState(true)
    const [generating, setGenerating] = useState(false)
    const [stats, setStats] = useState({ total: 0, onTime: 0, delayed: 0, revenue: 0 })
    const [revenueBreakdown, setRevenueBreakdown] = useState({ today: 0, week: 0, month: 0 })
    const [isVerified, setIsVerified] = useState(false)
    const [togglingProtection, setTogglingProtection] = useState(false)

    // Default to current month
    const [dateRange, setDateRange] = useState({
        start: format(new Date(new Date().getFullYear(), new Date().getMonth(), 1), 'yyyy-MM-dd'),
        end: format(new Date(), 'yyyy-MM-dd')
    })

    const fetchHistory = async () => {
        setLoading(true)
        try {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return

            let query = supabase
                .from('appointments')
                .select(`
                    *,
                    client:clients(first_name, last_name, phone),
                    provider:profiles!appointments_assigned_profile_id_fkey(full_name)
                `)
                .gte('scheduled_start', `${dateRange.start}T00:00:00`)
                .lte('scheduled_start', `${dateRange.end}T23:59:59`)
                .order('scheduled_start', { ascending: false })

            // If not admin, only show own data
            if (profile?.role?.toLowerCase() !== 'admin') {
                query = query.eq('assigned_profile_id', user.id)
            }

            const { data, error } = await query
            if (error) throw error

            if (data) {
                setHistory(data)
                calculateStats(data)
            }

            // Also fetch the breakdown snapshots
            fetchBreakdown(user.id)
        } catch (error) {
            console.error('Error fetching reports:', error)
        } finally {
            setLoading(false)
        }
    }

    const fetchBreakdown = async (userId) => {
        try {
            const now = new Date()
            const dayStart = format(startOfDay(now), "yyyy-MM-dd'T'HH:mm:ss")
            const weekStart = format(startOfWeek(now, { weekStartsOn: 1 }), "yyyy-MM-dd'T'HH:mm:ss")
            const monthStart = format(startOfMonth(now), "yyyy-MM-dd'T'HH:mm:ss")

            const getRevenue = async (start) => {
                let query = supabase
                    .from('appointments')
                    .select('cost')
                    .in('status', ['completed', 'active'])
                    .gte('scheduled_start', start)

                if (profile?.role?.toLowerCase() !== 'admin') {
                    query = query.eq('assigned_profile_id', userId)
                }

                const { data } = await query
                return data?.reduce((sum, a) => sum + (parseFloat(a.cost) || 0), 0) || 0
            }

            const [todayRev, weekRev, monthRev] = await Promise.all([
                getRevenue(dayStart),
                getRevenue(weekStart),
                getRevenue(monthStart)
            ])

            setRevenueBreakdown({ today: todayRev, week: weekRev, month: monthRev })
        } catch (err) {
            console.error('Breakdown fetch failed:', err)
        }
    }

    const calculateStats = (data) => {
        const total = data.length
        const delayed = data.filter(a => a.delay_minutes > 5).length
        const onTime = total - delayed
        const revenue = data
            .filter(a => a.status === 'completed' || a.status === 'active')
            .reduce((sum, a) => sum + (parseFloat(a.cost) || 0), 0)
        setStats({ total, onTime, delayed, revenue })
    }

    useEffect(() => {
        fetchHistory()
    }, [dateRange])

    const generatePDF = async (data, reportTitle) => {
        setGenerating(true)
        try {
            const doc = new jsPDF()
            const totalWidth = doc.internal.pageSize.getWidth()

            // 1. Professional Header
            doc.setFillColor(30, 41, 59) // Slate-800
            doc.rect(0, 0, totalWidth, 50, 'F')

            doc.setTextColor(255, 255, 255)
            doc.setFontSize(24)
            doc.setFont('helvetica', 'bold')
            doc.text(reportTitle.toUpperCase(), 14, 25)

            doc.setFontSize(10)
            doc.setFont('helvetica', 'normal')
            doc.text(`DATE RANGE: ${format(new Date(dateRange.start), 'MMM dd, yyyy')} - ${format(new Date(dateRange.end), 'MMM dd, yyyy')}`, 14, 35)
            doc.text(`GENERATED BY: ${profile?.full_name || 'System'}`, 14, 42)

            // 2. Real-time Snapshots Summary (New section in PDF)
            doc.setDrawColor(226, 232, 240)
            doc.setFillColor(248, 250, 252)
            doc.rect(14, 60, totalWidth - 28, 15, 'F')
            doc.setTextColor(51, 65, 85)
            doc.setFontSize(8)
            doc.setFont('helvetica', 'bold')
            doc.text("CURRENT SNAPSHOTS:", 18, 70)
            doc.setFont('helvetica', 'normal')
            doc.text(`TODAY: ${profile?.currency_symbol || '$'}${revenueBreakdown.today.toFixed(2)}`, 60, 70)
            doc.text(`WEEKLY: ${profile?.currency_symbol || '$'}${revenueBreakdown.week.toFixed(2)}`, 110, 70)
            doc.text(`MONTHLY: ${profile?.currency_symbol || '$'}${revenueBreakdown.month.toFixed(2)}`, 160, 70)

            // 3. Performance Summary
            const delayedCount = data.filter(a => a.delay_minutes > 5).length
            const onTimeCount = data.length - delayedCount
            const onTimeRate = data.length > 0 ? Math.round((onTimeCount / data.length) * 100) : 100
            const totalRevenue = data
                .filter(a => a.status === 'completed' || a.status === 'active')
                .reduce((sum, a) => sum + (parseFloat(a.cost) || 0), 0)

            doc.setTextColor(30, 41, 59)
            doc.setFontSize(11)
            doc.setFont('helvetica', 'bold')
            doc.text("REPORT PERIOD PERFORMANCE", 14, 85)

            doc.setDrawColor(226, 232, 240)
            doc.rect(14, 90, 42, 25) // Total
            doc.rect(60, 90, 42, 25) // On Time
            doc.rect(106, 90, 42, 25) // Rate
            doc.rect(152, 90, 44, 25) // Revenue

            doc.setFontSize(7)
            doc.text("TOTAL SESSIONS", 18, 97)
            doc.text("ON-TIME SESSIONS", 64, 97)
            doc.text("ON-TIME RATE", 110, 97)
            doc.text("TOTAL REVENUE", 156, 97)
            doc.setFontSize(12)
            doc.text(String(data.length), 18, 108)
            doc.text(String(onTimeCount), 64, 108)
            doc.setTextColor(onTimeRate > 80 ? 16 : 244, onTimeRate > 80 ? 185 : 63, onTimeRate > 80 ? 129 : 94)
            doc.text(`${onTimeRate}%`, 110, 108)
            doc.setTextColor(16, 185, 129)
            doc.text(`${profile?.currency_symbol || '$'}${totalRevenue.toFixed(2)}`, 156, 108)

            doc.setTextColor(30, 41, 59)

            // 4. Provider Breakdown (Only for Global/Admin reports)
            let nextStartY = 125
            if (reportTitle.toLowerCase().includes('global')) {
                const providerStats = {}
                data.forEach(apt => {
                    const pName = apt.provider?.full_name || 'Unassigned'
                    if (!providerStats[pName]) providerStats[pName] = { sessions: 0, revenue: 0 }
                    providerStats[pName].sessions++
                    if (apt.status === 'completed' || apt.status === 'active') {
                        providerStats[pName].revenue += (parseFloat(apt.cost) || 0)
                    }
                })

                const providerRows = Object.entries(providerStats).map(([name, s]) => [
                    name,
                    s.sessions,
                    `${profile?.currency_symbol || '$'}${s.revenue.toFixed(2)}`
                ])

                doc.setFontSize(11)
                doc.setFont('helvetica', 'bold')
                doc.text("PROVIDER PERFORMANCE BREAKDOWN", 14, 130)

                autoTable(doc, {
                    startY: 135,
                    head: [['Provider Name', 'Sessions', 'Revenue']],
                    body: providerRows,
                    theme: 'striped',
                    headStyles: { fillColor: [51, 65, 85] },
                    margin: { left: 14, right: 14 }
                })
                nextStartY = doc.lastAutoTable.finalY + 15
            }

            // 5. Activity Table
            doc.setFontSize(11)
            doc.setFont('helvetica', 'bold')
            doc.text("DETAILED ACTIVITY LOG", 14, nextStartY - 5)

            const tableData = data.map(apt => [
                format(new Date(apt.scheduled_start), 'MMM dd, HH:mm'),
                `${apt.client?.first_name} ${apt.client?.last_name}`,
                apt.provider?.full_name || '-',
                apt.treatment_name || '-',
                `${profile?.currency_symbol || '$'}${apt.cost || 0}`,
                apt.status.toUpperCase(),
                apt.delay_minutes > 0 ? `+${apt.delay_minutes}m` : 'On Time'
            ])

            autoTable(doc, {
                startY: nextStartY,
                head: [['Date/Time', 'Client', 'Provider', 'Treatment', 'Cost', 'Status', 'Delay']],
                body: tableData,
                theme: 'grid',
                headStyles: {
                    fillColor: [99, 102, 241], // Indigo-500
                    textColor: 255,
                    fontSize: 9,
                    fontStyle: 'bold'
                },
                styles: { fontSize: 8, cellPadding: 3 },
                alternateRowStyles: { fillColor: [248, 250, 252] }, // Slate-50
                margin: { left: 14, right: 14 }
            })

            // 6. Footer
            const pageCount = doc.internal.getNumberOfPages()
            for (let i = 1; i <= pageCount; i++) {
                doc.setPage(i)
                doc.setFontSize(8)
                doc.setTextColor(148, 163, 184)
                doc.text(`Page ${i} of ${pageCount}`, totalWidth / 2, doc.internal.pageSize.getHeight() - 10, { align: 'center' })
            }

            doc.save(`Clinic_Report_${dateRange.start}_to_${dateRange.end}.pdf`)
        } catch (err) {
            console.error('PDF Generation failed:', err)
            alert('Failed to generate PDF. Please try again.')
        } finally {
            setGenerating(false)
        }
    }

    const exportMyReport = () => {
        const myData = history.filter(h => h.assigned_profile_id === user?.id)
        generatePDF(myData, `My Performance Report`)
    }

    const exportGlobalReport = () => {
        if (profile?.role !== 'Admin' && profile?.full_name !== 'Andre') {
            alert('Admin access required.')
            return
        }
        generatePDF(history, 'Global Activity Report')
    }

    const toggleProtection = async () => {
        setTogglingProtection(true)
        try {
            await updateProfile({ report_protection_enabled: !profile?.report_protection_enabled })
        } catch (error) {
            console.error('Toggle failed:', error)
        } finally {
            setTogglingProtection(false)
        }
    }

    if (profile?.report_protection_enabled && !isVerified) {
        return <ReportPasswordScreen onVerified={() => setIsVerified(true)} />
    }

    return (
        <div className="space-y-10">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
                <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shadow-lg shadow-primary/5">
                        <TrendingUp size={28} />
                    </div>
                    <div>
                        <h2 className="text-3xl font-heading font-bold text-white tracking-tight">Analytics & History</h2>
                        <div className="flex items-center gap-3 mt-1">
                            <p className="text-slate-500 font-medium">Performance metrics and activity logs</p>
                            <div className="h-4 w-[1px] bg-white/10" />
                            <button
                                onClick={toggleProtection}
                                disabled={togglingProtection}
                                className={`flex items-center gap-2 px-3 py-1 rounded-lg border transition-all text-[10px] font-black uppercase tracking-widest ${profile?.report_protection_enabled ?
                                    'bg-indigo-500/10 border-indigo-500/20 text-indigo-400 hover:bg-indigo-500/20' :
                                    'bg-slate-800 border-white/5 text-slate-500 hover:text-white'
                                    }`}
                            >
                                {togglingProtection ? <Loader2 size={10} className="animate-spin" /> : (profile?.report_protection_enabled ? <Shield size={10} /> : <ShieldOff size={10} />)}
                                {profile?.report_protection_enabled ? 'Protection: ON' : 'Remember Me: ON'}
                            </button>
                        </div>
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
                    {/* Date Filters */}
                    <div className="flex flex-wrap items-center gap-2 p-1 rounded-2xl bg-slate-900 border border-white/10 shadow-inner w-full sm:w-auto">
                        {/* Quick Presets */}
                        <div className="flex gap-1 p-1 bg-white/5 rounded-xl border border-white/5 mr-1">
                            {[
                                { id: 'today', label: 'Day' },
                                { id: 'week', label: 'Week' },
                                { id: 'month', label: 'Month' }
                            ].map(preset => (
                                <button
                                    key={preset.id}
                                    onClick={() => {
                                        const now = new Date()
                                        if (preset.id === 'today') {
                                            setDateRange({ start: format(now, 'yyyy-MM-dd'), end: format(now, 'yyyy-MM-dd') })
                                        } else if (preset.id === 'week') {
                                            setDateRange({ start: format(startOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd'), end: format(endOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd') })
                                        } else if (preset.id === 'month') {
                                            setDateRange({ start: format(startOfMonth(now), 'yyyy-MM-dd'), end: format(endOfMonth(now), 'yyyy-MM-dd') })
                                        }
                                    }}
                                    className="px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-white rounded-lg transition-all hover:bg-white/5"
                                >
                                    {preset.label}
                                </button>
                            ))}
                        </div>

                        <div className="flex items-center gap-2 px-3 py-2 bg-white/5 rounded-lg border border-white/5 group min-w-[130px]">
                            <Calendar size={14} className="text-primary" />
                            <input
                                type="date"
                                value={dateRange.start}
                                onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                                className="bg-transparent text-xs font-bold text-slate-100 border-0 focus:ring-0 p-0 w-full [color-scheme:dark]"
                                style={{ colorScheme: 'dark' }}
                            />
                        </div>
                        <div className="text-slate-600 hidden lg:block px-1">
                            <ArrowRight size={14} />
                        </div>
                        <div className="flex items-center gap-2 px-3 py-2 bg-white/5 rounded-lg border border-white/5 group min-w-[130px]">
                            <Calendar size={14} className="text-primary" />
                            <input
                                type="date"
                                value={dateRange.end}
                                onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                                className="bg-transparent text-xs font-bold text-slate-100 border-0 focus:ring-0 p-0 w-full [color-scheme:dark]"
                                style={{ colorScheme: 'dark' }}
                            />
                        </div>
                    </div>

                    <div className="flex gap-2 w-full sm:w-auto">
                        <button
                            onClick={exportMyReport}
                            disabled={generating}
                            className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-white px-5 py-3 rounded-xl transition-all border border-white/5 font-bold text-sm shadow-lg disabled:opacity-50"
                        >
                            {generating ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />}
                            <span className="truncate">{generating ? 'Drafting...' : 'My Report'}</span>
                        </button>
                        {(profile?.role === 'Admin' || profile?.full_name === 'Andre') && (
                            <button
                                onClick={exportGlobalReport}
                                disabled={generating}
                                className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-primary hover:bg-indigo-600 text-white px-5 py-3 rounded-xl transition-all shadow-lg shadow-primary/20 hover:shadow-primary/40 font-bold text-sm disabled:opacity-50"
                            >
                                <Users size={18} />
                                <span className="truncate">Global Report</span>
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Income Snapshots */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="glass-card p-5 group hover:border-emerald-500/30 transition-all border-emerald-500/10">
                    <div className="flex items-center justify-between mb-2">
                        <p className="text-[10px] font-black text-emerald-500 uppercase tracking-[0.2em]">Today's Income</p>
                        <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400 group-hover:scale-110 transition-transform">
                            <TrendingUp size={16} />
                        </div>
                    </div>
                    <div className="flex flex-col">
                        <span className="text-2xl font-black text-white">{profile?.currency_symbol || '$'}{revenueBreakdown.today.toFixed(2)}</span>
                        <span className="text-[9px] text-slate-500 font-bold uppercase mt-1">Real-time earnings</span>
                    </div>
                </div>

                <div className="glass-card p-5 group hover:border-indigo-500/30 transition-all border-indigo-500/10">
                    <div className="flex items-center justify-between mb-2">
                        <p className="text-[10px] font-black text-indigo-500 uppercase tracking-[0.2em]">Weekly Income</p>
                        <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center text-indigo-400 group-hover:scale-110 transition-transform">
                            <Calendar size={16} />
                        </div>
                    </div>
                    <div className="flex flex-col">
                        <span className="text-2xl font-black text-white">{profile?.currency_symbol || '$'}{revenueBreakdown.week.toFixed(2)}</span>
                        <span className="text-[9px] text-slate-500 font-bold uppercase mt-1">Last 7 days approx.</span>
                    </div>
                </div>

                <div className="glass-card p-5 group hover:border-primary/30 transition-all border-primary/10">
                    <div className="flex items-center justify-between mb-2">
                        <p className="text-[10px] font-black text-primary uppercase tracking-[0.2em]">Monthly Income</p>
                        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
                            <FileText size={16} />
                        </div>
                    </div>
                    <div className="flex flex-col">
                        <span className="text-2xl font-black text-white">{profile?.currency_symbol || '$'}{revenueBreakdown.month.toFixed(2)}</span>
                        <span className="text-[9px] text-slate-500 font-bold uppercase mt-1">Current billing cycle</span>
                    </div>
                </div>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-6">
                <div className="glass-card p-4 md:p-6 flex flex-col md:flex-row items-center md:items-center gap-3 md:gap-4 text-center md:text-left">
                    <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-400 border border-blue-500/20 shrink-0">
                        <TrendingUp size={20} className="md:w-6 md:h-6" />
                    </div>
                    <div>
                        <p className="text-slate-500 text-[9px] md:text-[10px] font-bold uppercase tracking-wider mb-0.5">Sessions</p>
                        <h3 className="text-lg md:text-xl font-bold text-white">{stats.total}</h3>
                    </div>
                </div>
                <div className="glass-card p-4 md:p-6 flex flex-col md:flex-row items-center md:items-center gap-3 md:gap-4 text-center md:text-left border-emerald-500/10">
                    <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-400 border border-emerald-500/20 shrink-0">
                        <div className="text-base md:text-lg font-black">{profile?.currency_symbol || '$'}</div>
                    </div>
                    <div>
                        <p className="text-slate-500 text-[9px] md:text-[10px] font-bold uppercase tracking-wider mb-0.5">Revenue</p>
                        <h3 className="text-lg md:text-xl font-bold text-white">{stats.revenue.toFixed(2)}</h3>
                    </div>
                </div>
                <div className="glass-card p-4 md:p-6 flex flex-col md:flex-row items-center md:items-center gap-3 md:gap-4 text-center md:text-left">
                    <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-indigo-500/10 flex items-center justify-center text-indigo-400 border border-indigo-500/20 shrink-0">
                        <CheckCircle2 size={20} className="md:w-6 md:h-6" />
                    </div>
                    <div>
                        <p className="text-slate-500 text-[9px] md:text-[10px] font-bold uppercase tracking-wider mb-0.5">On Time</p>
                        <h3 className="text-lg md:text-xl font-bold text-white">{stats.onTime}</h3>
                    </div>
                </div>
                <div className="glass-card p-4 md:p-6 flex flex-col md:flex-row items-center md:items-center gap-3 md:gap-4 text-center md:text-left">
                    <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-rose-500/10 flex items-center justify-center text-rose-400 border border-rose-500/20 shrink-0">
                        <AlertTriangle size={20} className="md:w-6 md:h-6" />
                    </div>
                    <div>
                        <p className="text-slate-500 text-[9px] md:text-[10px] font-bold uppercase tracking-wider mb-0.5">Delayed</p>
                        <h3 className="text-lg md:text-xl font-bold text-white">{stats.delayed}</h3>
                    </div>
                </div>
            </div>

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="glass-card overflow-hidden"
            >
                <div className="p-4 md:p-6 border-b border-white/5 bg-white/[0.02] flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <History size={20} className="text-primary" />
                        <h3 className="font-bold text-base md:text-lg text-white">Activity Log</h3>
                    </div>
                    <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest hidden sm:block">
                        {format(new Date(dateRange.start), 'MMM dd')} - {format(new Date(dateRange.end), 'MMM dd')}
                    </span>
                </div>

                {/* Mobile Card List (Visible only on mobile) */}
                <div className="md:hidden divide-y divide-white/5">
                    {loading ? (
                        <div className="px-6 py-12 text-center text-slate-500 italic flex justify-center items-center gap-2"><Loader2 className="animate-spin" /> gathering history...</div>
                    ) : history.length === 0 ? (
                        <div className="px-6 py-12 text-center text-slate-500 italic">No history found for this range.</div>
                    ) : history.map(apt => (
                        <div key={apt.id} className="p-4 space-y-3 active:bg-white/5 transition-colors">
                            <div className="flex justify-between items-start">
                                <div>
                                    <h4 className="font-bold text-white text-sm">{apt.client?.first_name} {apt.client?.last_name}</h4>
                                    <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider mt-0.5">{apt.treatment_name || 'No treatment'}</p>
                                </div>
                                <span className={`text-[9px] px-2 py-0.5 rounded-full uppercase font-black tracking-widest border ${apt.status === 'completed' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                                    apt.status === 'active' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' :
                                        apt.status === 'cancelled' ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' :
                                            apt.status === 'noshow' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
                                                apt.status === 'shifted' ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20' :
                                                    'bg-slate-500/10 text-slate-400 border-slate-500/20'
                                    }`}>
                                    {apt.status}
                                </span>
                            </div>

                            <div className="flex items-center justify-between text-[11px] font-medium">
                                <div className="flex items-center gap-4">
                                    <div className="flex items-center gap-1.5 text-slate-400">
                                        <Calendar size={12} />
                                        <span>{format(new Date(apt.scheduled_start), 'MMM dd, HH:mm')}</span>
                                    </div>
                                    <div className="text-emerald-400 font-bold">
                                        {profile?.currency_symbol || '$'}{apt.cost || 0}
                                    </div>
                                </div>

                                <div className="text-right">
                                    {apt.status === 'completed' || apt.status === 'active' ? (
                                        apt.delay_minutes > 5 ? (
                                            <span className="text-rose-400 font-bold flex items-center gap-1 justify-end"><AlertTriangle size={10} /> +{apt.delay_minutes}m</span>
                                        ) : apt.delay_minutes > 0 ? (
                                            <span className="text-amber-400 font-medium h-[24px] flex items-center justify-end">+{apt.delay_minutes}m</span>
                                        ) : (
                                            <span className="text-emerald-500 font-medium flex items-center gap-1 justify-end"><CheckCircle2 size={10} /> On Time</span>
                                        )
                                    ) : (
                                        <span className="text-slate-500 italic text-[10px] truncate max-w-[100px] block">{apt.cancellation_reason || 'No reason'}</span>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Desktop Table (Hidden on mobile) */}
                <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="text-xs uppercase tracking-wider text-slate-500 bg-black/20">
                            <tr>
                                <th className="px-6 py-4 font-bold">Date</th>
                                <th className="px-6 py-4 font-bold">Client</th>
                                <th className="px-6 py-4 font-bold">Treatment</th>
                                <th className="px-6 py-4 font-bold">Cost</th>
                                <th className="px-6 py-4 font-bold">Status</th>
                                <th className="px-6 py-4 font-bold">Delay/Reason</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {loading ? (
                                <tr><td colSpan="6" className="px-6 py-12 text-center text-slate-500 italic flex justify-center items-center gap-2"><Loader2 className="animate-spin" /> gathering history...</td></tr>
                            ) : history.length === 0 ? (
                                <tr><td colSpan="6" className="px-6 py-12 text-center text-slate-500 italic">No history found for this range.</td></tr>
                            ) : history.map(apt => (
                                <tr key={apt.id} className="hover:bg-white/5 transition-colors group">
                                    <td className="px-6 py-4 text-sm font-medium text-slate-300">
                                        <div className="flex items-center gap-2">
                                            <Calendar size={14} className="text-slate-500" />
                                            {format(new Date(apt.scheduled_start), 'MMM dd, HH:mm')}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-sm font-bold text-white">{apt.client?.first_name} {apt.client?.last_name}</td>
                                    <td className="px-6 py-4 text-sm text-slate-400 font-medium">{apt.treatment_name || '-'}</td>
                                    <td className="px-6 py-4 text-sm font-bold text-emerald-400">{profile?.currency_symbol || '$'}{apt.cost || 0}</td>
                                    <td className="px-6 py-4">
                                        <span className={`text-[10px] px-2.5 py-1 rounded-full uppercase font-bold tracking-widest border ${apt.status === 'completed' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                                            apt.status === 'active' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' :
                                                apt.status === 'cancelled' ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' :
                                                    apt.status === 'noshow' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
                                                        apt.status === 'shifted' ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20' :
                                                            'bg-slate-500/10 text-slate-400 border-slate-500/20'
                                            }`}>
                                            {apt.status}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-sm">
                                        {apt.status === 'completed' || apt.status === 'active' ? (
                                            apt.delay_minutes > 5 ? (
                                                <span className="text-rose-400 font-bold flex items-center gap-1"><AlertTriangle size={12} /> +{apt.delay_minutes}m</span>
                                            ) : apt.delay_minutes > 0 ? (
                                                <span className="text-amber-400 font-medium h-[24px] flex items-center">+{apt.delay_minutes}m</span>
                                            ) : (
                                                <span className="text-emerald-500 font-medium flex items-center gap-1"><CheckCircle2 size={12} /> On Time</span>
                                            )
                                        ) : (
                                            <span className="text-slate-500 italic text-xs">{apt.cancellation_reason || 'No reason provided'}</span>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </motion.div>
        </div>
    )
}

export default Reports
