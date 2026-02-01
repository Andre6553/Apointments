import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
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
import OrganizationSettings from './OrganizationSettings';
import ErrorBoundary from './ErrorBoundary';
import { useWorkloadAlerts } from '../hooks/useWorkloadAlerts';
import { checkActiveOverruns } from '../lib/delayEngine';
import logo from '../assets/logo.png';
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
    AlertTriangle,
    CreditCard
} from 'lucide-react';
import SubscriptionPage from './SubscriptionPage';
import MasterDashboard from './MasterDashboard';
import { initializeMedicalDemo, runStressTest, getDemoStatus, setDemoStatus, seedBusinessSkills } from '../lib/demoSeeder';
import { clearLocalLogs } from '../lib/logger';

const Dashboard = () => {
    const { user, profile, signOut } = useAuth();
    const [activeTab, setActiveTab] = useState('appointments');
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [currentTime, setCurrentTime] = useState(new Date());
    const [demoMode, setDemoMode] = useState(getDemoStatus()); // DEMO MODE
    const [loggingEnabled, setLoggingEnabled] = useState(localStorage.getItem('logging_enabled') === 'true');
    const [selectedNotification, setSelectedNotification] = useState(null);
    const [isResponseModalOpen, setIsResponseModalOpen] = useState(false);
    const { count: alertCount } = useWorkloadAlerts();

    // Global Messaging State
    const [unreadChatCount, setUnreadChatCount] = useState(0);
    const [incomingMessageSender, setIncomingMessageSender] = useState(null);
    const [manualChatTarget, setManualChatTarget] = useState(null); // control explicit opens
    const [deepLinkClientId, setDeepLinkClientId] = useState(null); // For deep linking to clients

    const location = useLocation();

    // Listen for URL changes (Deep Linking)
    useEffect(() => {
        const path = location.pathname;
        if (path.startsWith('/clients/')) {
            const id = path.split('/')[2];
            // Safety: Ensure id is not null, undefined, or the literal string "undefined"
            if (id && id !== 'undefined') {
                setDeepLinkClientId(id);
                setActiveTab('clients');
            }
        }
    }, [location]);

    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);

        // DEMO MODE: Auto-Seed Seeder
        const demoInterval = setInterval(() => {
            if (demoMode && user) {
                runStressTest(user.user_metadata?.business_id || profile?.business_id);
            }
        }, 10000); // Check every 10s if we need to add pressure

        // ... existing heartbeats ...

        // Proactive Heartbeat: Check for session overruns every 60 seconds
        const overrunMonitor = setInterval(() => {
            console.log('[Dashboard] Heartbeat: Checking for proactive overruns...');
            checkActiveOverruns();
        }, 60000);

        // Unlock Audio Context on first interaction
        const unlockAudio = () => {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (AudioContext) {
                const ctx = new AudioContext();
                ctx.resume().then(() => {
                    document.removeEventListener('click', unlockAudio);
                    document.removeEventListener('keydown', unlockAudio);
                    document.removeEventListener('touchstart', unlockAudio);
                });
            }
        };

        document.addEventListener('click', unlockAudio);
        document.addEventListener('keydown', unlockAudio);
        document.addEventListener('touchstart', unlockAudio);

        // Messaging Polling (30s interval)
        const fetchMessages = async () => {
            if (!user) return;
            const { data, error } = await supabase
                .from('temporary_messages')
                .select('sender_id, created_at, sender:profiles!sender_id(full_name, id, role)')
                .eq('receiver_id', user.id)
                .eq('is_read', false)
                .order('created_at', { ascending: false });

            if (data && data.length > 0) {
                // If count increased, play sound
                if (data.length > unreadChatCount) {
                    // Check if valid module first
                    import('../utils/sound').then(mod => {
                        if (mod && mod.playNotificationSound) {
                            mod.playNotificationSound();
                        }
                    });
                }
                setUnreadChatCount(data.length);
                setIncomingMessageSender(data[0].sender);
            } else {
                setUnreadChatCount(0);
                setIncomingMessageSender(null);
            }
        };

        // Initial fetch
        fetchMessages();
        const msgPoller = setInterval(fetchMessages, 30000);

        return () => {
            clearInterval(timer);
            clearInterval(demoInterval);
            clearInterval(overrunMonitor);
            clearInterval(msgPoller);
            document.removeEventListener('click', unlockAudio);
            document.removeEventListener('keydown', unlockAudio);
            document.removeEventListener('touchstart', unlockAudio);
        };
    }, [user, unreadChatCount]);

    // Sync active_tab to database for Do Not Disturb (DND) logic
    useEffect(() => {
        if (user) {
            supabase.from('profiles')
                .update({ active_tab: activeTab })
                .eq('id', user.id)
                .then(({ error }) => {
                    if (error) console.error('[Dashboard] Failed to sync active_tab:', error);
                });
        }
    }, [activeTab, user]);

    // Handle payment redirect routing
    useEffect(() => {
        const query = new URLSearchParams(window.location.search);
        if (query.get('payment')) {
            setActiveTab('subscription');
        }
    }, []);

    const subscription = profile?.subscription;
    const expiresAt = subscription?.expires_at ? new Date(subscription.expires_at) : null;
    const daysLeft = expiresAt ? Math.ceil((expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : 0;
    const isExpired = daysLeft <= 0 && subscription?.tier !== 'trial';

    const tabs = [
        { id: 'appointments', label: 'Dashboard', icon: Calendar, color: 'text-primary' },
        { id: 'clients', label: 'Clients', icon: Users, color: 'text-secondary' },
        { id: 'schedule', label: 'Schedule', icon: Clock, color: 'text-orange-400' },
        { id: 'balancer', label: 'Workload', icon: Scale, color: 'text-purple-400' },
        { id: 'reports', label: 'Reports', icon: FileText, color: 'text-blue-400' },
        { id: 'organization', label: 'Organization', icon: Sparkles, color: 'text-rose-400', adminOnly: true },
        { id: 'subscription', label: 'Subscription', icon: CreditCard, color: 'text-emerald-400' },
        { id: 'profile', label: 'Profile', icon: User, color: 'text-emerald-400' },
    ];

    const filteredTabs = tabs.filter(t => {
        // MasterAdmin gets a clean, unique view
        if (profile?.role === 'MasterAdmin') {
            return ['appointments', 'profile'].includes(t.id);
        }

        if (t.adminOnly && profile?.role?.toLowerCase() !== 'admin') return false;
        // If expired, only allow Subscription and Profile
        if (isExpired && !['subscription', 'profile'].includes(t.id)) return false;
        return true;
    }).map(t => {
        // Rename 'Dashboard' to 'Master Console' for MasterAdmin
        if (profile?.role === 'MasterAdmin' && t.id === 'appointments') {
            return { ...t, label: 'Master Console', icon: LayoutDashboard };
        }
        return t;
    });

    const activeTabData = tabs.find(t => t.id === activeTab) || tabs[0];

    // Force subscription tab if expired
    useEffect(() => {
        if (isExpired && activeTab !== 'subscription' && activeTab !== 'profile') {
            setActiveTab('subscription');
        }
    }, [isExpired, activeTab]);

    const renderActiveComponent = () => {
        if (profile?.role === 'MasterAdmin') {
            return <MasterDashboard />;
        }

        if (isExpired && activeTab !== 'subscription' && activeTab !== 'profile') {
            return <SubscriptionPage />;
        }

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
            clients: <ClientList initialClientId={deepLinkClientId} onClientModalClose={() => setDeepLinkClientId(null)} />,
            schedule: <ScheduleSettings />,
            balancer: <WorkloadBalancer initialChatSender={manualChatTarget} onChatHandled={() => setManualChatTarget(null)} />,
            reports: <Reports />,
            organization: <OrganizationSettings />,
            profile: <ProfileSettings />,
            subscription: <SubscriptionPage />
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
                    <div className="p-1 rounded-lg bg-primary/20 border border-primary/20">
                        <img src={logo} alt="Logo" className="w-8 h-8 rounded-md object-contain" />
                    </div>
                    <span className="font-heading font-bold text-lg text-white">Apointment Tracker</span>
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
                fixed inset-y-0 left-0 w-80 glass-card rounded-l-none border-y-0 border-l-0 p-6 flex flex-col z-50 transition-transform duration-300 md:relative md:translate-x-0 overflow-y-auto scrollbar-hide
                ${isSidebarOpen ? 'translate-x-0 border-r border-white/10' : '-translate-x-full md:translate-x-0 md:border-r md:border-white/5'}
            `}>
                <div className="hidden md:flex items-center gap-4 mb-12 px-2">
                    <div className="relative group">
                        <div className="absolute inset-0 bg-primary blur-2xl rounded-full opacity-30 group-hover:opacity-60 transition-opacity"></div>
                        <div className="relative p-1 rounded-2xl bg-gradient-to-br from-white/10 to-white/5 shadow-2xl border border-white/10 overflow-hidden">
                            <img src={logo} alt="Logo" className="w-14 h-14 rounded-xl object-contain shadow-2xl" />
                        </div>
                    </div>
                    <div>
                        <h2 className="font-heading font-bold text-2xl text-white tracking-tight leading-none text-wrap max-w-[150px]">Apointment Tracker</h2>
                        <span className="text-[10px] text-primary font-bold uppercase tracking-[0.2em] relative top-1 flex items-center gap-1">
                            <Sparkles size={10} /> Pro
                        </span>
                    </div>
                </div>

                <div className="space-y-4 mb-auto">
                    {profile?.business?.name && (
                        <div className="bg-gradient-to-br from-primary/10 to-transparent p-4 rounded-2xl border border-primary/20 mb-6">
                            <p className="text-[10px] font-bold text-primary uppercase tracking-widest mb-1">Organization</p>
                            <h2 className="text-lg font-bold text-white leading-tight font-heading">{profile.business.name}</h2>
                        </div>
                    )}

                    <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-4 px-4">Menu</p>

                    {/* Subscription Status Pill */}
                    {subscription && (
                        <div className={`mx-4 mb-6 p-3 rounded-2xl border flex items-center justify-between transition-all ${daysLeft > 3 ? 'bg-primary/10 border-primary/20' : 'bg-red-500/10 border-red-500/20'}`}>
                            <div>
                                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-tight leading-none mb-1">
                                    {subscription.tier === 'trial' ? 'Trial Period' : 'Subscription'}
                                </p>
                                <p className={`text-xs font-bold ${daysLeft > 3 ? 'text-white' : 'text-red-400'}`}>
                                    {daysLeft} days left
                                </p>
                            </div>
                            <Clock size={16} className={daysLeft > 3 ? 'text-primary' : 'text-red-400 animate-pulse'} />
                        </div>
                    )}

                    {filteredTabs.map((tab) => (
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
                    {/* DEMO CONTROLS (Admin Only - LOCALHOST ONLY) */}
                    {profile?.role === 'Admin' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') && (
                        <div className="bg-slate-900/50 rounded-2xl p-4 border border-white/5 space-y-3">
                            <div className="flex items-center justify-between">
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Medical Demo</span>
                                <button
                                    onClick={async () => {
                                        const newState = !demoMode;
                                        setDemoMode(newState);
                                        setDemoStatus(newState);
                                        // Auto-seed skills if enabling
                                        if (newState && profile?.business_id) {
                                            await seedBusinessSkills(profile.business_id);
                                        }
                                    }}
                                    className={`relative w-10 h-5 rounded-full transition-colors ${demoMode ? 'bg-indigo-500' : 'bg-slate-700'}`}
                                >
                                    <div className={`absolute top-1 left-1 w-3 h-3 rounded-full bg-white transition-transform ${demoMode ? 'translate-x-5' : 'translate-x-0'}`} />
                                </button>
                            </div>

                            <button
                                onClick={async () => {
                                    if (confirm('RESET DATABASE? This will wipe all appointments and re-initialize providers/treatments.')) {
                                        await initializeMedicalDemo(profile.business_id);
                                        window.location.reload();
                                    }
                                }}
                                className="w-full py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs font-bold rounded-lg border border-red-500/20 transition-colors"
                            >
                                Reset / Re-Seed
                            </button>
                            <p className="text-[10px] text-slate-500 leading-tight">
                                {demoMode ? "Stress Test Active. Generates load automatically." : "System Normal."}
                            </p>

                            {/* LOGGING TOGGLE */}
                            <div className="flex items-center justify-between pt-2 border-t border-white/5">
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Activity Logs</span>
                                <button
                                    onClick={() => {
                                        const newState = !loggingEnabled;
                                        setLoggingEnabled(newState);
                                        localStorage.setItem('logging_enabled', newState.toString());
                                    }}
                                    className={`relative w-10 h-5 rounded-full transition-colors ${loggingEnabled ? 'bg-emerald-500' : 'bg-slate-700'}`}
                                >
                                    <div className={`absolute top-1 left-1 w-3 h-3 rounded-full bg-white transition-transform ${loggingEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
                                </button>
                            </div>

                            <button
                                onClick={async () => {
                                    if (confirm('Clear ALL local activity logs? This will delete all .log files in the server directory.')) {
                                        const success = await clearLocalLogs();
                                        if (success) {
                                            alert('Local logs cleared successfully.');
                                        } else {
                                            alert('Failed to clear local logs. Is the proxy running?');
                                        }
                                    }
                                }}
                                className="w-full py-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-[10px] font-bold rounded-lg border border-emerald-500/20 transition-colors uppercase tracking-widest mt-2"
                            >
                                Clear Local Logs
                            </button>

                            {(() => {
                                const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
                                if (!isLocal) {
                                    return (
                                        <button
                                            onClick={async () => {
                                                if (confirm('Clear PROD audit logs? This will wipe the Supabase audit_logs table.')) {
                                                    const { error } = await supabase.from('audit_logs').delete().neq('id', '00000000-0000-0000-0000-000000000000');
                                                    if (!error) {
                                                        alert('Production logs cleared.');
                                                    } else {
                                                        alert('Failed to clear production logs: ' + error.message);
                                                    }
                                                }
                                            }}
                                            className="w-full py-2 bg-amber-500/5 hover:bg-amber-500/10 text-amber-500/60 text-[9px] font-bold rounded-lg border border-amber-500/10 transition-colors uppercase tracking-tighter"
                                        >
                                            Clear Production Logs
                                        </button>
                                    );
                                }
                                return null;
                            })()}
                        </div>
                    )}
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
                                    <h1 className="text-4xl font-heading font-bold text-white tracking-tight mb-2 flex items-center gap-4">
                                        {activeTabData?.label}
                                        {activeTab === 'appointments' && alertCount > 0 && (
                                            <motion.div
                                                initial={{ scale: 0.8, opacity: 0 }}
                                                animate={{
                                                    scale: [1, 1.2, 1],
                                                    opacity: 1,
                                                }}
                                                transition={{
                                                    duration: 1.5,
                                                    repeat: Infinity,
                                                    ease: "easeInOut"
                                                }}
                                                className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-red-500/20 border border-red-500/30 text-red-500 cursor-pointer"
                                                onClick={() => setActiveTab('balancer')}
                                                title={`${alertCount} Delayed Appointments`}
                                            >
                                                <AlertTriangle size={20} className="stroke-[3]" />
                                                <span className="text-xs font-black uppercase tracking-tighter hidden sm:inline">{alertCount} Alerts</span>
                                            </motion.div>
                                        )}
                                    </h1>
                                    <p className="text-slate-400 text-sm max-w-md">
                                        Manage your {activeTabData?.label?.toLowerCase() || 'dashboard'} seamlessly with real-time updates.
                                    </p>
                                </div>
                                <div className="flex items-center gap-6">
                                    {unreadChatCount > 0 && incomingMessageSender && (
                                        <motion.button
                                            initial={{ opacity: 0, x: 20 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            exit={{ opacity: 0, x: 20 }}
                                            onClick={() => {
                                                setManualChatTarget(incomingMessageSender);
                                                setActiveTab('balancer');
                                            }}
                                            className="hidden sm:flex items-center gap-3 px-4 py-2 bg-gradient-to-r from-red-600 to-rose-600 rounded-xl shadow-lg shadow-red-500/20 hover:shadow-red-500/40 transition-all active:scale-95 group"
                                        >
                                            <div className="relative">
                                                <div className="w-2 h-2 rounded-full bg-white animate-pulse absolute -top-0.5 -right-0.5" />
                                                <div className="p-1.5 bg-white/20 rounded-lg">
                                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-white"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
                                                </div>
                                            </div>
                                            <div className="text-left">
                                                <p className="text-[10px] font-bold text-red-100 uppercase tracking-wider leading-none mb-0.5">New Message</p>
                                                <p className="text-xs font-bold text-white leading-none">From {incomingMessageSender.full_name?.split(' ')[0]}</p>
                                            </div>
                                            <ChevronRight size={16} className="text-white/70 group-hover:text-white group-hover:translate-x-1 transition-transform" />
                                        </motion.button>
                                    )}
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
