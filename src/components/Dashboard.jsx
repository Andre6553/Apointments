import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { motion, AnimatePresence } from 'framer-motion'
import ClientList from './ClientList'
import AppointmentList from './AppointmentList'
import BreakManagement from './BreakManagement'
import WorkloadBalancer from './WorkloadBalancer'
import Reports from './Reports'
import { Plus, Users, Calendar, Clock, LogOut, ChevronRight, Scale, FileText, Menu, X, Briefcase } from 'lucide-react'

const Dashboard = () => {
    const { user, profile, signOut } = useAuth()
    const [activeTab, setActiveTab] = useState('appointments')
    const [isSidebarOpen, setIsSidebarOpen] = useState(false)

    const tabs = [
        { id: 'appointments', label: 'Schedule', icon: Calendar, color: 'text-blue-400', bg: 'bg-blue-600/10', border: 'border-blue-500/20' },
        { id: 'clients', label: 'Clients', icon: Users, color: 'text-emerald-400', bg: 'bg-emerald-600/10', border: 'border-emerald-500/20' },
        { id: 'breaks', label: 'Breaks', icon: Clock, color: 'text-orange-400', bg: 'bg-orange-600/10', border: 'border-orange-500/20' },
        { id: 'balancer', label: 'Workload', icon: Scale, color: 'text-purple-400', bg: 'bg-purple-600/10', border: 'border-purple-500/20' },
        { id: 'reports', label: 'Reports', icon: FileText, color: 'text-cyan-400', bg: 'bg-cyan-600/10', border: 'border-cyan-500/20' },
    ]

    const ActiveComponent = {
        appointments: AppointmentList,
        clients: ClientList,
        breaks: BreakManagement,
        balancer: WorkloadBalancer,
        reports: Reports,
    }[activeTab]

    return (
        <div className="min-h-screen bg-[#020617] text-slate-200 flex flex-col md:flex-row font-sans">
            {/* Mobile Header */}
            <header className="md:hidden bg-slate-900/80 backdrop-blur-md border-b border-white/5 p-4 flex justify-between items-center sticky top-0 z-50">
                <div className="flex items-center gap-2">
                    <div className="p-2 rounded-lg bg-blue-600/20 border border-blue-500/20">
                        <Briefcase size={18} className="text-blue-400" />
                    </div>
                    <span className="font-bold text-lg text-white">B.L.A.S.T.</span>
                </div>
                <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2 hover:bg-white/5 rounded-xl transition-all">
                    {isSidebarOpen ? <X /> : <Menu />}
                </button>
            </header>

            {/* Sidebar Overlay (Mobile) */}
            <AnimatePresence>
                {isSidebarOpen && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => setIsSidebarOpen(false)}
                        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden"
                    />
                )}
            </AnimatePresence>

            {/* Sidebar */}
            <nav className={`
                fixed inset-y-0 left-0 w-72 bg-slate-900 border-r border-white/5 p-6 flex flex-col z-50 transition-transform duration-300 md:relative md:translate-x-0
                ${isSidebarOpen ? 'translate-x-0 shadow-2xl shadow-black/50' : '-translate-x-full md:translate-x-0'}
            `}>
                <div className="hidden md:flex items-center gap-3 mb-10 px-2">
                    <div className="p-3 rounded-2xl bg-gradient-to-tr from-blue-600 to-blue-400 shadow-xl shadow-blue-600/20">
                        <Briefcase size={22} className="text-white" />
                    </div>
                    <div>
                        <h2 className="font-extrabold text-xl text-white tracking-tight leading-tight">B.L.A.S.T.</h2>
                        <span className="text-[10px] text-blue-400 font-bold uppercase tracking-widest">Appointment Tracker</span>
                    </div>
                </div>

                <div className="space-y-1.5 flex-grow">
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-4 px-2">Main Menu</p>
                    {tabs.map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => { setActiveTab(tab.id); setIsSidebarOpen(false); }}
                            className={`
                                w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl transition-all duration-300 group
                                ${activeTab === tab.id
                                    ? `${tab.bg} ${tab.color} ${tab.border} border shadow-lg`
                                    : 'text-slate-500 hover:text-slate-200 hover:bg-white/5'
                                }
                            `}
                        >
                            <tab.icon size={20} className={`transition-transform duration-300 ${activeTab === tab.id ? 'scale-110' : 'group-hover:scale-110'}`} />
                            <span className="font-semibold">{tab.label}</span>
                            {activeTab === tab.id && <ChevronRight size={14} className="ml-auto opacity-50" />}
                        </button>
                    ))}
                </div>

                <div className="mt-8 space-y-4">
                    <div className="p-4 rounded-[2rem] bg-white/[0.03] border border-white/5">
                        <div className="flex items-center gap-3 mb-3">
                            <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center font-bold text-blue-400 border border-white/5">
                                {profile?.full_name?.charAt(0) || user?.email?.charAt(0).toUpperCase()}
                            </div>
                            <div className="overflow-hidden">
                                <p className="text-xs font-bold text-white truncate">{profile?.full_name || 'My Profile'}</p>
                                <p className="text-[10px] text-slate-500 truncate">{user?.email}</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2 px-2 py-1 rounded-lg bg-blue-500/10 border border-blue-500/20 w-fit">
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse"></span>
                            <span className="text-[9px] font-bold text-blue-400 uppercase tracking-tighter">{profile?.role || 'User'}</span>
                        </div>
                    </div>

                    <button
                        onClick={signOut}
                        className="w-full flex items-center gap-3 px-6 py-4 rounded-2xl text-slate-400 hover:text-red-400 hover:bg-red-400/5 transition-all group font-bold border border-transparent hover:border-red-400/10"
                    >
                        <LogOut size={20} className="group-hover:-translate-x-1 transition-transform" />
                        <span>Logout</span>
                    </button>
                </div>
            </nav>

            {/* Main Content */}
            <main className="flex-grow p-4 md:p-10 lg:p-14 overflow-y-auto w-full max-w-7xl mx-auto">
                <AnimatePresence mode="wait">
                    <motion.div
                        key={activeTab}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ duration: 0.3, ease: 'easeOut' }}
                    >
                        <ActiveComponent />
                    </motion.div>
                </AnimatePresence>
            </main>
        </div>
    )
}

export default Dashboard
