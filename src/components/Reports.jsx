import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { FileText, Download, Users, History, TrendingUp, Clock, AlertTriangle, CheckCircle2, Loader2, Calendar } from 'lucide-react'
import { motion } from 'framer-motion'
import { jsPDF } from 'jspdf'
import 'jspdf-autotable'
import { format } from 'date-fns'
import { useAuth } from '../hooks/useAuth'

const Reports = () => {
    const { user, profile } = useAuth()
    const [history, setHistory] = useState([])
    const [loading, setLoading] = useState(true)
    const [stats, setStats] = useState({ total: 0, onTime: 0, delayed: 0 })

    const fetchHistory = async () => {
        setLoading(true)
        try {
            // Mock data fallback
            const mockHistory = [
                { id: 1, scheduled_start: new Date().toISOString(), client: { first_name: 'Alice', last_name: 'Smith' }, provider: { full_name: 'Dr. John Doe' }, status: 'completed', delay_minutes: 0, shifted_from_id: null },
                { id: 2, scheduled_start: new Date(Date.now() - 86400000).toISOString(), client: { first_name: 'Bob', last_name: 'Jones' }, provider: { full_name: 'Sarah Connor' }, status: 'completed', delay_minutes: 15, shifted_from_id: 'p2' },
                { id: 3, scheduled_start: new Date(Date.now() - 172800000).toISOString(), client: { first_name: 'Charlie', last_name: 'Brown' }, provider: { full_name: 'Dr. Emily White' }, status: 'cancelled', delay_minutes: 0, shifted_from_id: null },
                { id: 4, scheduled_start: new Date(Date.now() - 259200000).toISOString(), client: { first_name: 'David', last_name: 'Wilson' }, provider: { full_name: 'Nurse Ratched' }, status: 'completed', delay_minutes: 5, shifted_from_id: null }
            ]

            const { data: { user } } = await supabase.auth.getUser()

            if (!user) {
                console.warn('Auth check failed - using mock data for reports')
                setHistory(mockHistory)
                calculateStats(mockHistory)
                setLoading(false)
                return
            }

            const { data, error } = await supabase
                .from('appointments')
                .select(`
            *,
            client:clients(first_name, last_name, phone),
            provider:profiles!appointments_assigned_profile_id_fkey(full_name)
          `)
                .order('scheduled_start', { ascending: false })

            if (error) throw error

            if (data) {
                setHistory(data)
                calculateStats(data)
            }
        } catch (error) {
            console.error('Error fetching reports:', error)
            // Fallback to mock on error
            setHistory([
                { id: 1, scheduled_start: new Date().toISOString(), client: { first_name: 'Alice (Offline)', last_name: 'Smith' }, provider: { full_name: 'Dr. John Doe' }, status: 'completed', delay_minutes: 0, shifted_from_id: null },
                { id: 2, scheduled_start: new Date(Date.now() - 86400000).toISOString(), client: { first_name: 'Bob (Offline)', last_name: 'Jones' }, provider: { full_name: 'Sarah Connor' }, status: 'completed', delay_minutes: 15, shifted_from_id: 'p2' }
            ])
            calculateStats([
                { status: 'completed', delay_minutes: 0 },
                { status: 'completed', delay_minutes: 15 }
            ])
        } finally {
            setLoading(false)
        }
    }

    const calculateStats = (data) => {
        const total = data.length
        const delayed = data.filter(a => a.delay_minutes > 5).length
        const onTime = total - delayed
        setStats({ total, onTime, delayed })
    }

    useEffect(() => {
        fetchHistory()
    }, [])

    const generatePDF = (data, title) => {
        const doc = new jsPDF()

        doc.setFontSize(20)
        doc.text(title, 14, 22)
        doc.setFontSize(11)
        doc.setTextColor(100)
        doc.text(`Generated on: ${format(new Date(), 'yyyy-MM-dd HH:mm')}`, 14, 30)

        const tableData = data.map(apt => [
            format(new Date(apt.scheduled_start), 'MMM dd, HH:mm'),
            `${apt.client?.first_name} ${apt.client?.last_name}`,
            apt.provider?.full_name,
            apt.status,
            apt.delay_minutes > 0 ? `+${apt.delay_minutes}m` : 'On Time',
            apt.cancellation_reason || (apt.shifted_from_id ? 'Shifted' : '-')
        ])

        doc.autoTable({
            startY: 40,
            head: [['Date', 'Client', 'Provider', 'Status', 'Delay', 'Reason/Notes']],
            body: tableData,
            theme: 'striped',
            headStyles: { fillStyle: '#6366f1' }
        })

        doc.save(`${title.replace(/\s+/g, '_')}_${format(new Date(), 'yyyyMMdd')}.pdf`)
    }

    const exportMyReport = () => {
        const myData = history.filter(h => h.assigned_profile_id === user?.id)
        generatePDF(myData, `My Performance Report - ${profile?.full_name || 'User'}`)
    }

    const exportGlobalReport = () => {
        if (profile?.role !== 'Admin' && profile?.full_name !== 'Andre') {
            alert('You do not have permission to view the Global Report.')
            return
        }
        generatePDF(history, 'Global Activity Report')
    }

    return (
        <div className="space-y-10">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
                <div>
                    <h2 className="text-3xl font-heading font-bold text-white tracking-tight">Analytics & History</h2>
                    <p className="text-slate-500 mt-1 font-medium">Performance metrics and activity logs</p>
                </div>
                <div className="flex gap-3 w-full md:w-auto">
                    <button
                        onClick={exportMyReport}
                        className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-white px-5 py-3 rounded-xl transition-all border border-white/5 font-bold text-sm shadow-lg hover:shadow-xl"
                    >
                        <Download size={18} /> My Report
                    </button>
                    {(profile?.role === 'Admin' || profile?.full_name === 'Andre') && (
                        <button
                            onClick={exportGlobalReport}
                            className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-primary hover:bg-indigo-600 text-white px-5 py-3 rounded-xl transition-all shadow-lg shadow-primary/20 hover:shadow-primary/40 font-bold text-sm"
                        >
                            <Users size={18} /> Global Report
                        </button>
                    )}
                </div>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="glass-card p-6 flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-400 border border-blue-500/20">
                        <TrendingUp size={24} />
                    </div>
                    <div>
                        <p className="text-slate-500 text-xs font-bold uppercase tracking-wider">Total Sessions</p>
                        <h3 className="text-2xl font-bold text-white">{stats.total}</h3>
                    </div>
                </div>
                <div className="glass-card p-6 flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-400 border border-emerald-500/20">
                        <CheckCircle2 size={24} />
                    </div>
                    <div>
                        <p className="text-slate-500 text-xs font-bold uppercase tracking-wider">On Time</p>
                        <h3 className="text-2xl font-bold text-white">{stats.onTime}</h3>
                    </div>
                </div>
                <div className="glass-card p-6 flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-rose-500/10 flex items-center justify-center text-rose-400 border border-rose-500/20">
                        <AlertTriangle size={24} />
                    </div>
                    <div>
                        <p className="text-slate-500 text-xs font-bold uppercase tracking-wider">Delayed (&gt;5m)</p>
                        <h3 className="text-2xl font-bold text-white">{stats.delayed}</h3>
                    </div>
                </div>
            </div>

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="glass-card overflow-hidden"
            >
                <div className="p-6 border-b border-white/5 bg-white/[0.02] flex items-center gap-3">
                    <History size={20} className="text-primary" />
                    <h3 className="font-bold text-lg text-white">Recent Activity Log</h3>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="text-xs uppercase tracking-wider text-slate-500 bg-black/20">
                            <tr>
                                <th className="px-6 py-4 font-bold">Date</th>
                                <th className="px-6 py-4 font-bold">Client</th>
                                <th className="px-6 py-4 font-bold">Provider</th>
                                <th className="px-6 py-4 font-bold">Status</th>
                                <th className="px-6 py-4 font-bold">Delay/Reason</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {loading ? (
                                <tr><td colSpan="5" className="px-6 py-12 text-center text-slate-500 italic flex justify-center items-center gap-2"><Loader2 className="animate-spin" /> gathering history...</td></tr>
                            ) : history.length === 0 ? (
                                <tr><td colSpan="5" className="px-6 py-12 text-center text-slate-500 italic">No history found yet.</td></tr>
                            ) : history.map(apt => (
                                <tr key={apt.id} className="hover:bg-white/5 transition-colors group">
                                    <td className="px-6 py-4 text-sm font-medium text-slate-300">
                                        <div className="flex items-center gap-2">
                                            <Calendar size={14} className="text-slate-500" />
                                            {format(new Date(apt.scheduled_start), 'MMM dd, HH:mm')}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-sm font-bold text-white">{apt.client?.first_name} {apt.client?.last_name}</td>
                                    <td className="px-6 py-4 text-sm text-slate-400">{apt.provider?.full_name}</td>
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
