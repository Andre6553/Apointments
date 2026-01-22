import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { FileText, Download, Users, History } from 'lucide-react'
import { motion } from 'framer-motion'
import { jsPDF } from 'jspdf'
import 'jspdf-autotable'
import { format } from 'date-fns'
import { useAuth } from '../hooks/useAuth'

const Reports = () => {
    const { user, profile } = useAuth()
    const [history, setHistory] = useState([])
    const [loading, setLoading] = useState(true)

    const fetchHistory = async () => {
        setLoading(true)
        const { data } = await supabase
            .from('appointments')
            .select(`
        *,
        client:clients(first_name, last_name, phone),
        provider:profiles(full_name)
      `)
            .order('scheduled_start', { ascending: false })

        if (data) setHistory(data)
        setLoading(false)
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
            apt.shifted_from_id ? 'Yes' : 'No'
        ])

        doc.autoTable({
            startY: 40,
            head: [['Date', 'Client', 'Provider', 'Status', 'Delay', 'Shifted']],
            body: tableData,
            theme: 'striped',
            headStyles: { fillStyle: '#3b82f6' }
        })

        doc.save(`${title.replace(/\s+/g, '_')}_${format(new Date(), 'yyyyMMdd')}.pdf`)
    }

    const exportMyReport = () => {
        const myData = history.filter(h => h.assigned_profile_id === user.id)
        generatePDF(myData, `My Performance Report - ${profile?.full_name}`)
    }

    const exportGlobalReport = () => {
        if (profile?.role !== 'Admin' && profile?.full_name !== 'Andre') {
            alert('You do not have permission to view the Global Report.')
            return
        }
        generatePDF(history, 'Global Activity Report')
    }

    return (
        <div className="space-y-8">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-2xl font-bold">Reports & History</h2>
                    <p className="text-slate-500">View and export activity logs</p>
                </div>
                <div className="flex gap-3">
                    <button
                        onClick={exportMyReport}
                        className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-white px-5 py-2.5 rounded-xl transition-all border border-white/5"
                    >
                        <Download size={18} /> My PDF
                    </button>
                    {(profile?.role === 'Admin' || profile?.full_name === 'Andre') && (
                        <button
                            onClick={exportGlobalReport}
                            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-5 py-2.5 rounded-xl transition-all shadow-lg shadow-blue-500/10"
                        >
                            <Users size={18} /> Global PDF
                        </button>
                    )}
                </div>
            </div>

            <div className="bg-slate-900 border border-white/5 rounded-3xl overflow-hidden">
                <div className="p-6 border-b border-white/5 bg-white/5 flex items-center gap-2">
                    <History size={18} className="text-slate-400" />
                    <h3 className="font-bold">Recent Activities</h3>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="text-xs uppercase tracking-wider text-slate-500 bg-black/20">
                            <tr>
                                <th className="px-6 py-4 font-medium">Date</th>
                                <th className="px-6 py-4 font-medium">Client</th>
                                <th className="px-6 py-4 font-medium">Provider</th>
                                <th className="px-6 py-4 font-medium">Status</th>
                                <th className="px-6 py-4 font-medium">Delay</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {loading ? (
                                <tr><td colSpan="5" className="px-6 py-8 text-center text-slate-500 italic">Gathering history...</td></tr>
                            ) : history.length === 0 ? (
                                <tr><td colSpan="5" className="px-6 py-8 text-center text-slate-500 italic">No history found yet.</td></tr>
                            ) : history.map(apt => (
                                <tr key={apt.id} className="hover:bg-white/5 transition-colors">
                                    <td className="px-6 py-4 text-sm font-medium">{format(new Date(apt.scheduled_start), 'MMM dd, HH:mm')}</td>
                                    <td className="px-6 py-4 text-sm">{apt.client?.first_name} {apt.client?.last_name}</td>
                                    <td className="px-6 py-4 text-sm text-slate-400">{apt.provider?.full_name}</td>
                                    <td className="px-6 py-4">
                                        <span className={`text-[10px] px-2 py-1 rounded-full uppercase font-bold tracking-widest ${apt.status === 'completed' ? 'bg-emerald-500/10 text-emerald-400' :
                                                apt.status === 'active' ? 'bg-blue-500/10 text-blue-400' :
                                                    'bg-slate-500/10 text-slate-400'
                                            }`}>
                                            {apt.status}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-sm">
                                        {apt.delay_minutes > 0 ? (
                                            <span className="text-red-400">+{apt.delay_minutes}m delay</span>
                                        ) : (
                                            <span className="text-emerald-500">On Time</span>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    )
}

export default Reports
