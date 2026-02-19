import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { FileText, Download, Users, History, TrendingUp, Clock, AlertTriangle, CheckCircle2, Loader2, Calendar, ArrowRight, Shield, ShieldOff, Lock, Copy, Check, Edit2 } from 'lucide-react'
import { motion } from 'framer-motion'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from 'date-fns'
import { useAuth } from '../hooks/useAuth'
import ReportPasswordScreen from './ReportPasswordScreen'
import AddAppointmentModal from './AddAppointmentModal'
import CompletedSessionModal from './CompletedSessionModal'

const Reports = () => {
    const { user, profile, updateProfile } = useAuth()
    const [history, setHistory] = useState([])
    const [loading, setLoading] = useState(true)
    const [generating, setGenerating] = useState(false)
    const [stats, setStats] = useState({ total: 0, onTime: 0, delayed: 0, revenue: 0 })
    const [revenueBreakdown, setRevenueBreakdown] = useState({ today: 0, week: 0, month: 0 })
    const [isVerified, setIsVerified] = useState(false)
    const [togglingProtection, setTogglingProtection] = useState(false)
    const [copied, setCopied] = useState(false)

    // Modal State
    const [isAddModalOpen, setIsAddModalOpen] = useState(false) // Not used here but keeping if needed later or removing
    const [isCompletedModalOpen, setIsCompletedModalOpen] = useState(false)
    const [editData, setEditData] = useState(null)

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
                    provider:profiles!appointments_assigned_profile_id_fkey(full_name),
                    original_provider:profiles!appointments_shifted_from_id_fkey(full_name)
                `)
                .gte('scheduled_start', `${dateRange.start}T00:00:00`)
                .lte('scheduled_start', `${dateRange.end}T23:59:59`)
                .order('scheduled_start', { ascending: false })

            // If not admin, show own data + appointments you shifted to others
            if (profile?.role?.toLowerCase() !== 'admin') {
                query = query.or(`assigned_profile_id.eq.${user.id},shifted_from_id.eq.${user.id}`)
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
            const pageHeight = doc.internal.pageSize.getHeight()
            const margin = 14
            let currentY = 0

            // Helper for new pages
            const checkPageBreak = (heightNeeded) => {
                if (currentY + heightNeeded >= pageHeight - 20) {
                    doc.addPage()
                    currentY = 20
                    return true
                }
                return false
            }

            // 1. Professional Header
            doc.setFillColor(30, 41, 59) // Slate-800
            doc.rect(0, 0, totalWidth, 50, 'F')

            doc.setTextColor(255, 255, 255)
            doc.setFontSize(24)
            doc.setFont('helvetica', 'bold')
            doc.text(reportTitle.toUpperCase(), margin, 25)

            doc.setFontSize(10)
            doc.setFont('helvetica', 'normal')
            doc.text(`DATE RANGE: ${format(new Date(dateRange.start), 'MMM dd, yyyy')} - ${format(new Date(dateRange.end), 'MMM dd, yyyy')}`, margin, 35)
            doc.text(`GENERATED BY: ${profile?.full_name || 'System'}`, margin, 42)

            // 2. Real-time Snapshots Summary
            doc.setDrawColor(226, 232, 240)
            doc.setFillColor(248, 250, 252)
            doc.rect(margin, 60, totalWidth - (margin * 2), 15, 'F')
            doc.setTextColor(51, 65, 85)
            doc.setFontSize(8)
            doc.setFont('helvetica', 'bold')
            doc.text("CURRENT SNAPSHOTS:", 18, 70)
            doc.setFont('helvetica', 'normal')
            doc.text(`TODAY: ${profile?.currency_symbol || '$'}${revenueBreakdown.today.toFixed(2)}`, 60, 70)
            doc.text(`WEEKLY: ${profile?.currency_symbol || '$'}${revenueBreakdown.week.toFixed(2)}`, 110, 70)
            doc.text(`MONTHLY: ${profile?.currency_symbol || '$'}${revenueBreakdown.month.toFixed(2)}`, 160, 70)

            currentY = 90

            // 3. Overall Performance Summary
            const delayedCount = data.filter(a => a.delay_minutes > 5).length
            const onTimeCount = data.length - delayedCount
            const onTimeRate = data.length > 0 ? Math.round((onTimeCount / data.length) * 100) : 100
            const totalRevenue = data
                .filter(a => a.status === 'completed' || a.status === 'active')
                .reduce((sum, a) => sum + (parseFloat(a.cost) || 0), 0)

            doc.setTextColor(30, 41, 59)
            doc.setFontSize(14)
            doc.setFont('helvetica', 'bold')
            doc.text("FACILITY OVERVIEW", margin, currentY)
            currentY += 10

            // Draw Overview Cards
            const cardWidth = 42
            const cardHeight = 25
            const cardGap = 4

            doc.setFontSize(7)
            doc.setTextColor(100, 116, 139)

            // Card 1: Total
            doc.setDrawColor(226, 232, 240)
            doc.rect(margin, currentY, cardWidth, cardHeight)
            doc.text("TOTAL SESSIONS", margin + 4, currentY + 7)
            doc.setFontSize(12)
            doc.setTextColor(30, 41, 59)
            doc.text(String(data.length), margin + 4, currentY + 18)

            // Card 2: On Time
            doc.setFontSize(7)
            doc.setTextColor(100, 116, 139)
            doc.rect(margin + cardWidth + cardGap, currentY, cardWidth, cardHeight)
            doc.text("ON-TIME SESSIONS", margin + cardWidth + cardGap + 4, currentY + 7)
            doc.setFontSize(12)
            doc.setTextColor(30, 41, 59)
            doc.text(String(onTimeCount), margin + cardWidth + cardGap + 4, currentY + 18)

            // Card 3: Rate
            doc.setFontSize(7)
            doc.setTextColor(100, 116, 139)
            doc.rect(margin + (cardWidth + cardGap) * 2, currentY, cardWidth, cardHeight)
            doc.text("ON-TIME RATE", margin + (cardWidth + cardGap) * 2 + 4, currentY + 7)
            doc.setFontSize(12)
            doc.setTextColor(onTimeRate > 80 ? 16 : 244, onTimeRate > 80 ? 185 : 63, onTimeRate > 80 ? 129 : 94)
            doc.text(`${onTimeRate}%`, margin + (cardWidth + cardGap) * 2 + 4, currentY + 18)

            // Card 4: Revenue
            doc.setFontSize(7)
            doc.setTextColor(100, 116, 139)
            doc.rect(margin + (cardWidth + cardGap) * 3, currentY, cardWidth + 2, cardHeight)
            doc.text("TOTAL REVENUE", margin + (cardWidth + cardGap) * 3 + 4, currentY + 7)
            doc.setFontSize(12)
            doc.setTextColor(16, 185, 129)
            doc.text(`${profile?.currency_symbol || '$'}${totalRevenue.toFixed(2)}`, margin + (cardWidth + cardGap) * 3 + 4, currentY + 18)

            currentY += 40

            // 4. Detailed Provider Analysis (The "Professional Intelligence" Upgrade)
            const isGlobal = reportTitle.toLowerCase().includes('global')

            // Group data by provider
            const providers = {}
            data.forEach(apt => {
                const pId = apt.assigned_profile_id
                const pName = apt.provider?.full_name || 'Unassigned'

                if (!providers[pId]) {
                    providers[pId] = {
                        name: pName,
                        sessions: 0,
                        delayed: 0,
                        ownIncome: 0,
                        transferIncome: 0,
                        lostIncome: 0
                    }
                }

                // Track sessions & delays (only if kept)
                if (apt.status === 'completed' || apt.status === 'active') {
                    providers[pId].sessions++
                    if (apt.delay_minutes > 5) providers[pId].delayed++

                    const cost = parseFloat(apt.cost) || 0

                    if (apt.original_provider) {
                        providers[pId].transferIncome += cost
                    } else {
                        providers[pId].ownIncome += cost
                    }
                }

                // Track lost income (shifted away)
                if (apt.status === 'shifted' && apt.shifted_from_id) {
                    // Start new bucket for the original provider if not exists
                    const originalId = apt.shifted_from_id
                    const originalName = apt.original_provider?.full_name || 'Unknown'

                    if (!providers[originalId]) {
                        providers[originalId] = {
                            name: originalName,
                            sessions: 0,
                            delayed: 0,
                            ownIncome: 0,
                            transferIncome: 0,
                            lostIncome: 0
                        }
                    }
                    providers[originalId].lostIncome += (parseFloat(apt.cost) || 0)
                }
            })

            // Iterate through providers
            doc.setFontSize(14)
            doc.setTextColor(30, 41, 59)
            doc.text("PROVIDER PERFORMANCE ANALYSIS", margin, currentY)
            currentY += 10

            Object.values(providers).forEach((p, index) => {
                // Skip if filtering for specific user
                if (!isGlobal && p.name !== user?.user_metadata?.full_name && p.name !== profile?.full_name) return

                checkPageBreak(70)

                const pTotal = p.sessions
                const pRate = pTotal > 0 ? Math.round(((pTotal - p.delayed) / pTotal) * 100) : 100
                const pTotalRevenue = p.ownIncome + p.transferIncome

                // Container
                doc.setDrawColor(226, 232, 240)
                doc.setFillColor(255, 255, 255)
                doc.roundedRect(margin, currentY, totalWidth - (margin * 2), 55, 3, 3, 'S')

                // Left: Name & Big Stat
                doc.setFontSize(12)
                doc.setFont('helvetica', 'bold')
                doc.setTextColor(30, 41, 59)
                doc.text(p.name.toUpperCase(), margin + 5, currentY + 10)

                doc.setFontSize(9)
                doc.setFont('helvetica', 'normal')
                doc.setTextColor(100, 116, 139)
                doc.text(`${pTotal} Sessions Completed`, margin + 5, currentY + 16)

                // Middle: Revenue Table
                const tableX = margin + 60
                const tableY = currentY + 8

                doc.setFontSize(8)
                doc.text("REVENUE BREAKDOWN", tableX, tableY)

                // Own
                doc.setTextColor(30, 41, 59)
                doc.text("Direct Clients:", tableX, tableY + 8)
                doc.text(`${profile?.currency_symbol || '$'}${p.ownIncome.toFixed(2)}`, tableX + 40, tableY + 8, { align: 'right' })

                // Transfer
                doc.setTextColor(79, 70, 229) // Indigo
                doc.text("Transfer In:", tableX, tableY + 16)
                doc.text(`+${profile?.currency_symbol || '$'}${p.transferIncome.toFixed(2)}`, tableX + 40, tableY + 16, { align: 'right' })

                // Total Line
                doc.setDrawColor(200, 200, 200)
                doc.line(tableX, tableY + 20, tableX + 40, tableY + 20)
                doc.setFont('helvetica', 'bold')
                doc.setTextColor(30, 41, 59)
                doc.text("Total Earned:", tableX, tableY + 26)
                doc.text(`${profile?.currency_symbol || '$'}${pTotalRevenue.toFixed(2)}`, tableX + 40, tableY + 26, { align: 'right' })

                // Lost (Red)
                doc.setFont('helvetica', 'normal')
                doc.setTextColor(239, 68, 68) // Red
                doc.text("Lost (Transferred):", tableX, tableY + 36)
                doc.text(`-${profile?.currency_symbol || '$'}${p.lostIncome.toFixed(2)}`, tableX + 40, tableY + 36, { align: 'right' })


                // Right: Circular Progress (Pie Chart)
                const pieX = totalWidth - margin - 25
                const pieY = currentY + 25
                const radius = 12

                // Background Circle
                doc.setDrawColor(226, 232, 240)
                doc.setLineWidth(3)
                doc.circle(pieX, pieY, radius, 'S')

                // Progress Arc (Approximate 4 segments logic for simplicity or full circle if 100%)
                // Since jsPDF doesn't natively do easy arcs, we'll use color coding + text
                // However, we can simulate a simple filled visualization
                if (pRate >= 100) {
                    doc.setDrawColor(16, 185, 129) // Emerald
                    doc.circle(pieX, pieY, radius, 'S')
                } else {
                    // Creating a partial arc is complex in raw jsPDF without path data
                    // We will use a colored rim to represent status instead
                    doc.setDrawColor(pRate > 80 ? 16 : 239, pRate > 80 ? 185 : 68, pRate > 80 ? 129 : 68)
                    doc.circle(pieX, pieY, radius, 'S')
                }

                doc.setFontSize(10)
                doc.setFont('helvetica', 'bold')
                doc.setTextColor(30, 41, 59)
                doc.text(`${pRate}%`, pieX, pieY + 1, { align: 'center' })
                doc.setFontSize(7)
                doc.setTextColor(100, 116, 139)
                doc.text("ON TIME", pieX, pieY + 8, { align: 'center' })

                currentY += 65
            })

            // 5. Automatic Conclusion (Executive Summary)
            if (isGlobal || Object.keys(providers).length > 0) {
                checkPageBreak(60)

                // Find Top Performer
                let topEarner = { name: '-', val: 0 }
                let mostEfficient = { name: '-', val: 0 }

                Object.values(providers).forEach(p => {
                    const totalRev = p.ownIncome + p.transferIncome
                    const rate = p.sessions > 0 ? Math.round(((p.sessions - p.delayed) / p.sessions) * 100) : 0

                    if (totalRev > topEarner.val) topEarner = { name: p.name, val: totalRev }
                    if (rate > mostEfficient.val && p.sessions > 2) mostEfficient = { name: p.name, val: rate }
                })

                doc.setFontSize(14)
                doc.setFont('helvetica', 'bold')
                doc.setTextColor(30, 41, 59)
                doc.text("EXECUTIVE CONCLUSION", margin, currentY)

                doc.setFontSize(10)
                doc.setFont('helvetica', 'normal')
                doc.setTextColor(51, 65, 85)
                const summaryText = `Based on the activity in this period, ${topEarner.name} generated the highest revenue (${profile?.currency_symbol || '$'}${topEarner.val.toFixed(2)}). ` +
                    `The most reliable schedule adherent was ${mostEfficient.name} with a ${mostEfficient.val}% on-time rate.` +
                    `\n\nTransfer efficiency indicates ${revenueBreakdown.week > 0 ? 'active' : 'stable'} workload balancing across the team.`

                const splitText = doc.splitTextToSize(summaryText, totalWidth - (margin * 2))
                doc.text(splitText, margin, currentY + 10)
                currentY += 40
            }


            // 6. Detailed Activity Table
            checkPageBreak(40)
            doc.setFontSize(11)
            doc.setFont('helvetica', 'bold')
            doc.text("DETAILED ACTIVITY LOG", margin, currentY)
            currentY += 5

            const tableData = data.map(apt => [
                format(new Date(apt.scheduled_start), 'MMM dd, HH:mm'),
                `${apt.client?.first_name} ${apt.client?.last_name}`,
                apt.provider?.full_name || '-',
                apt.treatment_name || '-',
                `${profile?.currency_symbol || '$'}${apt.cost || 0}`,
                apt.status.toUpperCase(),
                apt.original_provider ? `From ${apt.original_provider.full_name}` :
                    (apt.status === 'shifted' && apt.provider ? `To ${apt.provider.full_name}` : 'Direct'),
                apt.delay_minutes > 0 ? `+${apt.delay_minutes}m` : 'On Time'
            ])

            autoTable(doc, {
                startY: currentY,
                head: [['Date/Time', 'Client', 'Provider', 'Treatment', 'Cost', 'Status', 'Details', 'Delay']],
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
                margin: { left: margin, right: margin }
            })

            // 7. Footer
            const pageCount = doc.internal.getNumberOfPages()
            for (let i = 1; i <= pageCount; i++) {
                doc.setPage(i)
                doc.setFontSize(8)
                doc.setTextColor(148, 163, 184)
                doc.text(`Page ${i} of ${pageCount}`, totalWidth / 2, pageHeight - 10, { align: 'center' })
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

    const handleCopyJson = async () => {
        try {
            const jsonData = JSON.stringify(history, null, 2)
            await navigator.clipboard.writeText(jsonData)
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
        } catch (err) {
            console.error('Failed to copy JSON:', err)
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

            {/* Accounting Logic Explanation */}
            <div className="p-6 rounded-2xl bg-indigo-500/5 border border-indigo-500/20 shadow-lg">
                <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-xl bg-indigo-500/20 flex items-center justify-center text-indigo-400 border border-indigo-500/20">
                        <AlertTriangle size={20} />
                    </div>
                    <h3 className="text-lg font-bold text-white">Accounting Logic & Methodology</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="space-y-2">
                        <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Revenue Attribution</p>
                        <p className="text-sm text-slate-400 leading-relaxed font-medium">
                            Revenue is credited to the provider who is <span className="text-white font-bold">currently assigned</span> to the appointment and manages its completion.
                        </p>
                    </div>
                    <div className="space-y-2">
                        <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Transfers & Shifts</p>
                        <p className="text-sm text-slate-400 leading-relaxed font-medium">
                            When a client is transferred, the <span className="text-white font-bold">entire cost</span> of that session is reassigned to the new provider. The previous provider will not show this revenue.
                        </p>
                    </div>
                    <div className="space-y-2">
                        <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Price Locking</p>
                        <p className="text-sm text-slate-400 leading-relaxed font-medium">
                            The client is always charged the <span className="text-white font-bold">original booked price</span>. Even if the new provider has different rates, the cost does <span className="text-white font-bold">not</span> change during a transfer.
                        </p>
                    </div>
                    <div className="space-y-2">
                        <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Schedule Delays</p>
                        <p className="text-sm text-slate-400 leading-relaxed font-medium">
                            Running behind schedule is tracked for performance auditing (Delay %) but does <span className="text-white font-bold">NOT</span> automatically deduct from or change the cost of the client's treatment.
                        </p>
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
                        <button
                            onClick={handleCopyJson}
                            className={`p-1.5 rounded-lg transition-all duration-300 ${copied ? 'bg-emerald-500/20 text-emerald-400' : 'bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white'}`}
                            title="Copy history as JSON"
                        >
                            {copied ? <Check size={14} /> : <Copy size={14} />}
                        </button>
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
                        <div
                            key={apt.id}
                            onClick={() => {
                                if (apt.status === 'completed') {
                                    setEditData(apt)
                                    setIsCompletedModalOpen(true)
                                }
                            }}
                            className={`p-4 space-y-3 active:bg-white/5 transition-colors ${apt.status === 'completed' ? 'cursor-pointer' : ''}`}
                        >
                            <div className="flex justify-between items-start">
                                <div>
                                    <h4 className="font-bold text-white text-sm">{apt.client?.first_name} {apt.client?.last_name}</h4>
                                    <div className="flex items-center gap-1.5">
                                        <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider mt-0.5">{apt.treatment_name || 'No treatment'}</p>
                                        {apt.original_provider && (
                                            <span className="text-[9px] bg-indigo-500/10 text-indigo-400 px-1.5 py-0.5 rounded-sm font-bold uppercase">
                                                From {apt.original_provider.full_name.split(' ')[0]}
                                            </span>
                                        )}
                                        {apt.status === 'shifted' && apt.provider && (
                                            <span className="text-[9px] bg-rose-500/10 text-rose-400 px-1.5 py-0.5 rounded-sm font-bold uppercase">
                                                To {apt.provider.full_name.split(' ')[0]}
                                            </span>
                                        )}
                                    </div>
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
                                        <span className="text-slate-600">-</span>
                                    )}

                                    {apt.status === 'completed' && (
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                console.log('Mobile Edit Button Clicked');
                                                setEditData(apt);
                                                setIsModalOpen(true);
                                            }}
                                            className="ml-2 p-1.5 hover:bg-white/10 rounded-lg text-slate-500 hover:text-white transition-colors"
                                            title="Edit Appointment"
                                        >
                                            <Edit2 size={14} />
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Desktop Table (Hidden on mobile) */}
                <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="border-b border-white/5 text-[10px] font-black uppercase tracking-widest text-slate-500">
                                <th className="p-4">Date/Time</th>
                                <th className="p-4">Client</th>
                                <th className="p-4">Provider</th>
                                <th className="p-4">Treatment</th>
                                <th className="p-4">Status</th>
                                <th className="p-4 text-right">Cost</th>
                                <th className="p-4 text-right">Performance</th>
                                <th className="p-4 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5 text-sm font-medium text-slate-300">
                            {loading ? (
                                <tr>
                                    <td colSpan="8" className="p-8 text-center text-slate-500 italic"><div className="flex justify-center items-center gap-2"><Loader2 className="animate-spin" /> gathering history...</div></td>
                                </tr>
                            ) : history.length === 0 ? (
                                <tr>
                                    <td colSpan="8" className="p-8 text-center text-slate-500 italic">No history found for this range.</td>
                                </tr>
                            ) : history.map(apt => (
                                <tr
                                    key={apt.id}
                                    onClick={() => {
                                        if (apt.status === 'completed') {
                                            setEditData(apt)
                                            setIsCompletedModalOpen(true)
                                        }
                                    }}
                                    className={`hover:bg-white/[0.02] transition-colors group ${apt.status === 'completed' ? 'cursor-pointer' : ''}`}
                                >
                                    <td className="p-4 whitespace-nowrap text-white font-bold">{format(new Date(apt.scheduled_start), 'MMM dd, HH:mm')}</td>
                                    <td className="p-4 font-bold text-white">{apt.client?.first_name} {apt.client?.last_name}</td>
                                    <td className="p-4">
                                        <div className="flex flex-col">
                                            <span>{apt.provider?.full_name || '-'}</span>
                                            {apt.original_provider && <span className="text-[9px] text-indigo-400 uppercase font-bold">From {apt.original_provider.full_name}</span>}
                                            {apt.status === 'shifted' && apt.provider && <span className="text-[9px] text-rose-400 uppercase font-bold">To {apt.provider.full_name}</span>}
                                        </div>
                                    </td>
                                    <td className="p-4 table-cell max-w-[200px] truncate"><span className="text-xs uppercase tracking-wide opacity-80" title={apt.treatment_name}>{apt.treatment_name || '-'}</span></td>
                                    <td className="p-4">
                                        <span className={`text-[9px] px-2 py-0.5 rounded-full uppercase font-black tracking-widest border ${apt.status === 'completed' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                                            apt.status === 'active' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' :
                                                apt.status === 'cancelled' ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' :
                                                    apt.status === 'noshow' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
                                                        apt.status === 'shifted' ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20' :
                                                            'bg-slate-500/10 text-slate-400 border-slate-500/20'
                                            }`}>
                                            {apt.status}
                                        </span>
                                    </td>
                                    <td className="p-4 text-right font-bold text-emerald-400">{profile?.currency_symbol || '$'}{apt.cost || 0}</td>
                                    <td className="p-4 text-right">
                                        {apt.status === 'completed' || apt.status === 'active' ? (
                                            apt.delay_minutes > 5 ? (
                                                <span className="text-rose-400 font-bold flex items-center gap-1 justify-end"><AlertTriangle size={14} /> +{apt.delay_minutes}m</span>
                                            ) : apt.delay_minutes > 0 ? (
                                                <span className="text-amber-400 font-medium flex items-center justify-end">+{apt.delay_minutes}m</span>
                                            ) : (
                                                <span className="text-emerald-500 font-medium flex items-center gap-1 justify-end"><CheckCircle2 size={14} /> On Time</span>
                                            )
                                        ) : (
                                            <span className="text-slate-500 italic text-xs">{apt.cancellation_reason || 'No reason provided'}</span>
                                        )}
                                    </td>
                                    <td className="p-4 text-right">
                                        {apt.status === 'completed' && (
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation(); // Prevent double trigger
                                                    setEditData(apt);
                                                    setIsCompletedModalOpen(true);
                                                }}
                                                className="p-2 hover:bg-white/10 rounded-lg text-slate-500 hover:text-white transition-colors"
                                                title="Edit Appointment"
                                            >
                                                <Edit2 size={14} />
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </motion.div>
            <CompletedSessionModal
                isOpen={isCompletedModalOpen}
                onClose={() => { setIsCompletedModalOpen(false); setEditData(null); }}
                onRefresh={fetchHistory}
                appointment={editData}
            />
        </div>
    )
}

export default Reports
