import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { motion, AnimatePresence } from 'framer-motion';
import ClientList from './ClientList';
import AppointmentList from './AppointmentList';
import BreakManagement from './BreakManagement';
import WorkloadBalancer from './WorkloadBalancer';
import Reports from './Reports';
import {
    Users,
    Calendar,
    Clock,
    LogOut,
    ChevronRight,
    Scale,
    FileText,
    Menu,
    X,
    LayoutDashboard,
    Sparkles
} from 'lucide-react';

const Dashboard = () => {
    const { user, profile, signOut } = useAuth();
    const [activeTab, setActiveTab] = useState('appointments');
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);

    const tabs = [
        { id: 'appointments', label: 'Schedule', icon: Calendar, color: 'text-primary' },
        { id: 'clients', label: 'Clients', icon: Users, color: 'text-secondary' },
        { id: 'breaks', label: 'Breaks', icon: Clock, color: 'text-orange-400' },
        { id: 'balancer', label: 'Workload', icon: Scale, color: 'text-purple-400' },
        { id: 'reports', label: 'Reports', icon: FileText, color: 'text-blue-400' },
    ];

    const ActiveComponent = {
        appointments: AppointmentList,
        clients: ClientList,
        breaks: BreakManagement,
        balancer: WorkloadBalancer,
        reports: Reports,
    }[activeTab];

    return (
        <div className="min-h-screen flex flex-col md:flex-row font-sans overflow-hidden">
            {/* Mobile Header */}
            <header className="md:hidden bg-surface/80 backdrop-blur-md border-b border-white/5 p-4 flex justify-between items-center sticky top-0 z-50">
                <div className="flex items-center gap-2">
                    <div className="p-2 rounded-xl bg-primary/20 border border-primary/20">
                        <LayoutDashboard size={18} className="text-primary" />
                    </div>
                    <span className="font-heading font-bold text-lg text-white">Tracker</span>
                </div>
                <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2 text-slate-400 hover:text-white hover:bg-white/5 rounded-xl transition-all">
                    {isSidebarOpen ? <X size={24} /> : <Menu size={24} />}
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
                        className="fixed inset-0 bg-background/80 backdrop-blur-sm z-40 md:hidden"
                    />
                )}
            </AnimatePresence>

            {/* Sidebar */}
            <nav className={`
                fixed inset-y-0 left-0 w-80 glass-card rounded-l-none border-y-0 border-l-0 p-6 flex flex-col z-50 transition-transform duration-300 md:relative md:translate-x-0
                ${isSidebarOpen ? 'translate-x-0 border-r border-white/10' : '-translate-x-full md:translate-x-0 md:border-r md:border-white/5'}
            `}>
                <div className="hidden md:flex items-center gap-4 mb-12 px-2">
                    <div className="relative group">
                        <div className="absolute inset-0 bg-primary blur-xl rounded-full opacity-25 group-hover:opacity-50 transition-opacity"></div>
                        <div className="relative p-3.5 rounded-2xl bg-gradient-to-br from-primary to-indigo-600 shadow-xl shadow-primary/20 text-white">
                            <LayoutDashboard size={24} />
                        </div>
                    </div>
                    <div>
                        <h2 className="font-heading font-bold text-2xl text-white tracking-tight leading-none">Tracker</h2>
                        <span className="text-[10px] text-primary font-bold uppercase tracking-[0.2em] relative top-1 flex items-center gap-1">
                            <Sparkles size={10} /> Pro
                        </span>
                    </div>
                </div>

                <div className="space-y-2 flex-grow">
                    <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-4 px-4">Menu</p>
                    {tabs.map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => { setActiveTab(tab.id); setIsSidebarOpen(false); }}
                            className={`
                                w-full flex items-center gap-4 px-4 py-4 rounded-2xl transition-all duration-300 group relative overflow-hidden
                                ${activeTab === tab.id
                                    ? 'bg-gradient-to-r from-primary/20 to-primary/5 border border-primary/20 text-white shadow-lg shadow-primary/5'
                                    : 'text-slate-400 hover:text-white hover:bg-white/5 border border-transparent hover:border-white/5'
                                }
                            `}
                        >
                            {activeTab === tab.id && (
                                <motion.div
                                    layoutId="activeTabIndicator"
                                    className="absolute left-0 top-0 bottom-0 w-1 bg-primary rounded-l-none"
                                />
                            )}
                            <tab.icon size={22} className={`transition-transform duration-300 ${activeTab === tab.id ? `${tab.color} scale-110` : 'group-hover:scale-110 group-hover:text-slate-200'}`} />
                            <span className="font-medium">{tab.label}</span>
                            {activeTab === tab.id && <ChevronRight size={16} className="ml-auto opacity-50 text-primary" />}
                        </button>
                    ))}
                </div>

                <div className="mt-8 space-y-4">
                    <div className="p-4 rounded-3xl bg-surface/50 border border-white/5 backdrop-blur-md relative overflow-hidden group">
                        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                        <div className="flex items-center gap-3 relative z-10">
                            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-slate-700 to-slate-800 flex items-center justify-center font-bold text-xl text-primary border border-white/10 shadow-inner">
                                {profile?.full_name?.charAt(0) || user?.email?.charAt(0).toUpperCase()}
                            </div>
                            <div className="overflow-hidden">
                                <p className="text-sm font-bold text-white truncate font-heading">{profile?.full_name || 'My Profile'}</p>
                                <p className="text-[11px] text-slate-400 truncate">{user?.email}</p>
                            </div>
                        </div>
                    </div>

                    <button
                        onClick={signOut}
                        className="w-full flex items-center gap-3 px-6 py-4 rounded-2xl text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-all group font-bold border border-transparent hover:border-red-500/20"
                    >
                        <LogOut size={20} className="group-hover:-translate-x-1 transition-transform" />
                        <span>Logout</span>
                    </button>
                </div>
            </nav>

            {/* Main Content */}
            <main className="flex-grow overflow-y-auto h-screen relative">
                {/* Top fade for scrolling aesthetics */}
                <div className="fixed top-0 left-0 right-0 h-12 bg-gradient-to-b from-background to-transparent z-10 pointer-events-none md:left-80" />

                <div className="max-w-[1600px] mx-auto p-6 md:p-10 lg:p-14 pb-24">
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={activeTab}
                            initial={{ opacity: 0, y: 15 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -15 }}
                            transition={{ duration: 0.3, ease: "easeOut" }}
                        >
                            <div className="mb-10 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
                                <div>
                                    <h1 className="text-4xl font-heading font-bold text-white tracking-tight mb-2">
                                        {tabs.find(t => t.id === activeTab)?.label}
                                    </h1>
                                    <p className="text-slate-400 text-sm max-w-md">
                                        Manage your {tabs.find(t => t.id === activeTab)?.label.toLowerCase()} seamlessly with real-time updates.
                                    </p>
                                </div>
                                <div className="text-right hidden sm:block">
                                    <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">{new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
                                </div>
                            </div>

                            <div className="glass-card p-1">
                                <ActiveComponent />
                            </div>
                        </motion.div>
                    </AnimatePresence>
                </div>
            </main>
        </div>
    );
};

export default Dashboard;
