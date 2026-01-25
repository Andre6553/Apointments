import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { motion, AnimatePresence } from 'framer-motion';
import ClientList from './ClientList';
import AppointmentList from './AppointmentList';
import DailyTimeline from './DailyTimeline';
import ScheduleSettings from './ScheduleSettings';
import WorkloadBalancer from './WorkloadBalancer';
import Reports from './Reports';
import NotificationCenter from './NotificationCenter';
import TransferResponseModal from './TransferResponseModal';
import ProfileSettings from './ProfileSettings';
import ErrorBoundary from './ErrorBoundary';
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
    Sparkles,
    Settings,
    User,
    AlertTriangle
} from 'lucide-react';

const Dashboard = () => {
    const { user, profile, signOut } = useAuth();
    const [activeTab, setActiveTab] = useState('appointments');
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [currentTime, setCurrentTime] = useState(new Date());
    const [selectedNotification, setSelectedNotification] = useState(null);
    const [isResponseModalOpen, setIsResponseModalOpen] = useState(false);

    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    const tabs = [
        { id: 'appointments', label: 'Dashboard', icon: Calendar, color: 'text-primary' },
        { id: 'clients', label: 'Clients', icon: Users, color: 'text-secondary' },
        { id: 'schedule', label: 'Schedule', icon: Clock, color: 'text-orange-400' },
        { id: 'balancer', label: 'Workload', icon: Scale, color: 'text-purple-400' },
        { id: 'reports', label: 'Reports', icon: FileText, color: 'text-blue-400' },
        { id: 'profile', label: 'Profile', icon: User, color: 'text-emerald-400' },
    ];

    const activeTabData = tabs.find(t => t.id === activeTab) || tabs[0];

    const renderActiveComponent = () => {
        const components = {
            appointments: (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                    <div className="lg:col-span-8">
                        <AppointmentList />
                    </div>
                    <div className="lg:col-span-4">
                        <DailyTimeline />
                    </div>
                </div>
            ),
            clients: <ClientList />,
            schedule: <ScheduleSettings />,
            balancer: <WorkloadBalancer />,
            reports: <Reports />,
            profile: <ProfileSettings />
        };

        return (
            <ErrorBoundary key={activeTab}>
                {components[activeTab] || components.appointments}
            </ErrorBoundary>
        );
    };

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
                    <button
                        onClick={() => setActiveTab('profile')}
                        className="w-full text-left p-4 rounded-3xl bg-surface/50 border border-white/5 backdrop-blur-md relative overflow-hidden group transition-all hover:border-primary/30"
                    >
                        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                        <div className="flex items-center gap-3 relative z-10">
                            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-slate-700 to-slate-800 flex items-center justify-center font-bold text-xl text-primary border border-white/10 shadow-inner">
                                {profile?.full_name?.charAt(0) || user?.email?.charAt(0).toUpperCase()}
                            </div>
                            <div className="overflow-hidden">
                                <p className="text-sm font-bold text-white truncate font-heading">{profile?.full_name || 'My Profile'}</p>
                                <p className="text-[11px] text-slate-400 truncate mb-0.5">{user?.email}</p>
                                {profile?.whatsapp && (
                                    <div className="flex items-center gap-1.5 text-primary">
                                        <svg viewBox="0 0 24 24" width="10" height="10" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.414 0 .018 5.396.015 12.03a11.847 11.847 0 001.592 5.96L0 24l6.117-1.605a11.803 11.803 0 005.925 1.583h.005c6.637 0 12.032-5.396 12.035-12.031a11.815 11.815 0 00-3.534-8.514z" /></svg>
                                        <span className="text-[10px] font-bold tracking-tight">{profile.whatsapp}</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    </button>

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
                                        {activeTabData?.label}
                                    </h1>
                                    <p className="text-slate-400 text-sm max-w-md">
                                        Manage your {activeTabData?.label?.toLowerCase() || 'dashboard'} seamlessly with real-time updates.
                                    </p>
                                </div>
                                <div className="flex items-center gap-6">
                                    <NotificationCenter onOpenNotification={(notif) => {
                                        if (notif.type === 'transfer_request') {
                                            setSelectedNotification(notif);
                                            setIsResponseModalOpen(true);
                                        }
                                    }} />
                                    <div className="text-right hidden sm:block">
                                        <div className="text-3xl font-black text-white leading-none tracking-tight mb-1">
                                            {currentTime.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })}
                                        </div>
                                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest leading-none">
                                            {currentTime.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <div className="p-1">
                                {renderActiveComponent()}
                            </div>
                        </motion.div>
                    </AnimatePresence>

                    {selectedNotification && (
                        <TransferResponseModal
                            isOpen={isResponseModalOpen}
                            onClose={() => {
                                setIsResponseModalOpen(false);
                                setSelectedNotification(null);
                            }}
                            notification={selectedNotification}
                            onComplete={() => {
                                // Realtime subscriptions in AppointmentList and DailyTimeline will handle the update
                                setSelectedNotification(null);
                                setIsResponseModalOpen(false);
                            }}
                        />
                    )}
                </div>
            </main>
        </div>
    );
};

export default Dashboard;
