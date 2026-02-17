import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import {
    Users,
    Building2,
    CreditCard,
    TrendingUp,
    Download,
    Settings,
    Gift,
    Search,
    ArrowUpRight,
    ArrowDownRight,
    Loader2,
    ChevronDown,
    Filter,
    FileText,
    Activity,
    X,
    Database,
    Shield,
    HardDrive,
    Trash2
} from 'lucide-react';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    AreaChart,
    Area
} from 'recharts';
import { motion, AnimatePresence } from 'framer-motion';
import { format } from 'date-fns';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

const MasterDashboard = () => {
    const [stats, setStats] = useState({
        totalRevenue: 0,
        activeSubscribers: 0,
        totalOrganizations: 0,
        newSignups: 0,
        revenueChart: [],
        revenueTrend: 0,
        conversionRate: 0
    });
    const [orgs, setOrgs] = useState([]);
    const [settings, setSettings] = useState({
        pricing_admin: { monthly: 5, yearly: 55 },
        pricing_provider: { monthly: 3, yearly: 33 },
        pricing_special: { monthly: 0 },
        limit_special: { default: 5 },
        special_plan_enabled: false
    });
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [dateRange, setDateRange] = useState({ start: '', end: '' });
    const [showPromoModal, setShowPromoModal] = useState(null);
    const [showReportModal, setShowReportModal] = useState(null);
    const [showStaffModal, setShowStaffModal] = useState(null);
    const [showSpecialSubModal, setShowSpecialSubModal] = useState(null);
    const [businessDetails, setBusinessDetails] = useState({ appointments: [], clients: [], payments: [] });
    const [fetchingDetails, setFetchingDetails] = useState(false);
    const [saving, setSaving] = useState(false);
    const [auditLogStats, setAuditLogStats] = useState({ size: 'Calculating...', count: 0, dbSize: 'Calculating...' });
    const [downloadingLogs, setDownloadingLogs] = useState(false);

    useEffect(() => {
        fetchMasterData();
    }, []);

    const fetchMasterData = async () => {
        setLoading(true);
        try {
            // 1. Fetch Organizations with hierarchy and subscription
            const { data: orgData, error: orgError } = await supabase
                .from('businesses')
                .select(`
                    *,
                    profiles:profiles!profiles_business_id_fkey(id, full_name, email, role, last_seen),
                    subscriptions:subscriptions(*)
                `);

            if (orgError) throw orgError;

            // 2. Fetch Global Settings
            const { data: settingsData } = await supabase
                .from('app_settings')
                .select('*');

            const settingsMap = {};
            settingsData?.forEach(s => {
                settingsMap[s.key] = s.value;
            });

            // 3. Fetch Payment Analysis (Last 30 days)
            const { data: paymentData } = await supabase
                .from('payment_history')
                .select('*')
                .order('created_at', { ascending: false });

            // 4. Calculate Stats & Chart Data
            const now = new Date();
            const weeks = [3, 2, 1, 0].map(w => {
                const date = new Date();
                date.setDate(now.getDate() - (w * 7));
                return {
                    name: w === 0 ? 'This Week' : `${w} Week${w > 1 ? 's' : ''} Ago`,
                    start: new Date(new Date().setDate(now.getDate() - ((w + 1) * 7))),
                    end: new Date(new Date().setDate(now.getDate() - (w * 7))),
                    rev: 0
                };
            });

            const totalRevenue = paymentData?.reduce((acc, p) => {
                const amount = Number(p.amount);
                const pDate = new Date(p.created_at);

                // Assign to chart weeks
                weeks.forEach(week => {
                    if (pDate > week.start && pDate <= week.end) {
                        week.rev += amount;
                    }
                });

                return acc + amount;
            }, 0) || 0;

            const activeSubs = orgData?.reduce((acc, o) =>
                acc + (o.subscriptions?.filter(s => s.status === 'active' && s.tier !== 'trial').length || 0),
                0);

            const totalOrgs = orgData?.length || 0;
            const convRate = totalOrgs > 0 ? Math.round((activeSubs / totalOrgs) * 100) : 0;

            // Calculate Revenue Trend (Week over Week)
            const thisWeekRev = weeks[3].rev;
            const lastWeekRev = weeks[2].rev;
            let revTrend = 0;
            if (lastWeekRev > 0) {
                revTrend = Math.round(((thisWeekRev - lastWeekRev) / lastWeekRev) * 100);
            } else if (thisWeekRev > 0) {
                revTrend = 100; // First week of revenue
            }

            setStats({
                totalRevenue,
                activeSubscribers: activeSubs || 0,
                totalOrganizations: totalOrgs,
                newSignups: orgData?.filter(o => {
                    const created = new Date(o.created_at);
                    const thirtyDaysAgo = new Date();
                    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
                    return created > thirtyDaysAgo;
                }).length || 0,
                revenueChart: weeks.map(w => ({ name: w.name, rev: w.rev })),
                revenueTrend: revTrend,
                conversionRate: convRate
            });

            setOrgs(orgData || []);

            // Sync active modals with fresh data
            if (showStaffModal) {
                const refreshed = orgData?.find(o => o.id === showStaffModal.id);
                if (refreshed) setShowStaffModal(refreshed);
            }

            if (Object.keys(settingsMap).length > 0) {
                setSettings(prev => ({ ...prev, ...settingsMap }));
            }

            // 5. Fetch Audit Log Stats
            fetchAuditLogStats();

        } catch (err) {
            console.error('[MasterDashboard] Error fetching data:', err);
        } finally {
            setLoading(false);
        }
    };

    const fetchAuditLogStats = async () => {
        try {
            const { data: size } = await supabase.rpc('get_table_size', { table_name: 'audit_logs' });
            const { data: count } = await supabase.rpc('get_table_count', { table_name: 'audit_logs' });
            const { data: dbSize } = await supabase.rpc('get_project_db_size');

            setAuditLogStats({
                size: size || '0 KB',
                count: count || 0,
                dbSize: dbSize || 'Calculating...'
            });
        } catch (err) {
            console.error('Error fetching audit log stats:', err);
        }
    };

    const handleDownloadAuditLogs = async (format = 'csv') => {
        setDownloadingLogs(true);
        try {
            const { data, error } = await supabase
                .rpc('get_recent_audit_logs', { log_limit: 50000 });

            if (error) throw error;

            if (format === 'json') {
                // JSON Export (Best for AI Analysis)
                const jsonContent = JSON.stringify(data, null, 2);
                const blob = new Blob([jsonContent], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.setAttribute('href', url);
                link.setAttribute('download', `audit_logs_${new Date().toISOString().split('T')[0]}.json`);
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            } else {
                // CSV Export (Best for spreadsheets)
                const processedData = data.map(log => ({
                    id: log.id,
                    ts: log.ts,
                    severity: log.level, // renamed for clarity
                    event_message: log.event_message, // ensure main message is top level
                    ...log, // spread raw
                    service: JSON.stringify(log.service),
                    event: JSON.stringify(log.event),
                    actor: JSON.stringify(log.actor),
                    payload: JSON.stringify(log.payload),
                    metrics: JSON.stringify(log.metrics),
                    context: JSON.stringify(log.context)
                }));
                downloadCSV(processedData, `audit_logs_${new Date().toISOString().split('T')[0]}`);
            }

        } catch (err) {
            console.error('Download failed:', err);
            alert('Failed to download logs: ' + err.message);
        } finally {
            setDownloadingLogs(false);
        }
    };

    const handlePurgeLogs = async () => {
        if (!confirm('DANGER: This will permanently DELETE ALL audit logs from the database. This action cannot be undone.\n\nAre you sure you want to proceed?')) {
            return;
        }

        try {
            // Optional: Backup before delete? For now, we assume user downloaded first.
            const { error } = await supabase.rpc('purge_audit_logs');
            if (error) throw error;

            alert('System logs purged successfully.');
            fetchAuditLogStats(); // Refresh stats to show 0/0
        } catch (err) {
            console.error('Purge failed:', err);
            alert('Failed to purge logs: ' + err.message);
        }
    };

    const handleUpdateSettings = async () => {
        setSaving(true);
        try {
            const updates = [
                { key: 'pricing_admin', value: settings.pricing_admin },
                { key: 'pricing_provider', value: settings.pricing_provider },
                { key: 'pricing_special', value: settings.pricing_special },
                { key: 'limit_special', value: settings.limit_special },
                { key: 'special_plan_enabled', value: settings.special_plan_enabled }
            ];

            console.log('[MasterDashboard] Saving settings:', updates);

            for (const item of updates) {
                const { error } = await supabase
                    .from('app_settings')
                    .upsert(item, { onConflict: 'key' });

                if (error) {
                    console.error('[MasterDashboard] Error saving setting:', item.key, error);
                    throw error;
                }
            }
            alert('Global pricing updated successfully!');
        } catch (err) {
            console.error('Update failed:', err);
            alert('Failed to save settings: ' + (err.message || err));
        } finally {
            setSaving(false);
        }
    };

    const handleApplyPromo = async (days) => {
        if (!showPromoModal) return;
        setSaving(true);
        try {
            const newExpiry = new Date();
            newExpiry.setDate(newExpiry.getDate() + days);

            const promoData = {
                expires_at: newExpiry.toISOString(),
                status: 'active',
                tier: showPromoModal.tier || 'trial'
            };

            const { error } = showPromoModal.id
                ? await supabase.from('subscriptions').update(promoData).eq('id', showPromoModal.id)
                : await supabase.from('subscriptions').upsert({
                    ...promoData,
                    profile_id: showPromoModal.profile_id,
                    business_id: showPromoModal.business_id,
                    role: showPromoModal.role || 'provider'
                });

            if (error) throw error;
            fetchMasterData();
            setShowPromoModal(null);
        } catch (err) {
            console.error('Promo failed:', err);
            alert('Failed to apply promo extension.');
        } finally {
            setSaving(false);
        }
    };

    const fetchBusinessDetails = async (businessId) => {
        setFetchingDetails(true);
        try {
            const [apps, cls, pays] = await Promise.all([
                supabase.from('appointments').select('*, clients(first_name, last_name)').eq('business_id', businessId),
                supabase.from('clients').select('*').eq('business_id', businessId),
                supabase.from('payment_history').select('*').eq('business_id', businessId)
            ]);

            setBusinessDetails({
                appointments: apps.data || [],
                clients: cls.data || [],
                payments: pays.data || []
            });
        } catch (err) {
            console.error('Error fetching details:', err);
        } finally {
            setFetchingDetails(false);
        }
    };

    const downloadCSV = (data, filename) => {
        if (!data || data.length === 0) {
            alert('No data to export');
            return;
        }
        const headers = Object.keys(data[0]).join(',');
        const rows = data.map(row =>
            Object.values(row).map(value =>
                typeof value === 'string' ? `"${value.replace(/"/g, '""')}"` : value
            ).join(',')
        );
        const csvContent = [headers, ...rows].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', `${filename}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const generatePDF = () => {
        const doc = new jsPDF();
        doc.text('Apointment Tracker - Master Analysis Report', 14, 15);
        doc.text(`Generated: ${format(new Date(), 'yyyy-MM-dd HH:mm')}`, 14, 22);

        const tableData = orgs.map(org => [
            org.name,
            org.profiles?.find(p => p.role === 'Admin')?.email || 'N/A',
            org.profiles?.length || 0,
            org.subscriptions?.[0]?.tier?.toUpperCase() || 'NONE',
            org.subscriptions?.[0]?.expires_at ? format(new Date(org.subscriptions[0].expires_at), 'yyyy-MM-dd') : 'N/A',
            org.subscriptions?.[0]?.tier === 'trial' ? 'NO' : 'YES'
        ]);

        autoTable(doc, {
            startY: 30,
            head: [['Organization', 'Admin Email', 'Staff Count', 'Tier', 'Expires', 'Subscribed']],
            body: tableData,
        });

        doc.save(`master-report-${format(new Date(), 'yyyy-MM-dd')}.pdf`);
    };

    const filteredOrgs = useMemo(() => {
        return orgs.filter(o =>
            o.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            o.profiles?.some(p => p.email.toLowerCase().includes(searchTerm.toLowerCase()))
        );
    }, [orgs, searchTerm]);

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
                <Loader2 className="animate-spin text-primary" size={40} />
                <p className="text-slate-400 font-medium">Calibrating Master Dashboard...</p>
            </div>
        );
    }

    const handleUpdateSpecialSub = async () => {
        if (!showSpecialSubModal) return;
        setSaving(true);
        try {
            const updates = {
                special_plan_active: showSpecialSubModal.special_plan_active,
                special_plan_price: showSpecialSubModal.special_plan_price,
                special_plan_limit: showSpecialSubModal.special_plan_limit
            };

            // Only update activation timestamp if we are toggling it FROM off TO on
            if (showSpecialSubModal.special_plan_active && !showSpecialSubModal.original_active) {
                updates.special_plan_updated_at = new Date().toISOString();
            }

            const { error } = await supabase
                .from('businesses')
                .update(updates)
                .eq('id', showSpecialSubModal.business_id);

            if (error) throw error;
            alert('Special subscription settings updated.');
            setShowSpecialSubModal(null);
            fetchMasterData();
        } catch (err) {
            console.error('Update failed:', err);
            alert('Failed to update special subscription: ' + err.message);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="space-y-8 pb-20 px-4 md:px-0 max-w-[1600px] mx-auto">
            {/* Header */}
            <header className="mb-8 md:mb-12 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                <div>
                    <h1 className="text-4xl md:text-5xl font-black text-white tracking-tighter mb-2">MasterDashboard</h1>
                    <p className="text-slate-400 font-medium text-sm md:text-base">System-wide performance and administrative control.</p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                    <button onClick={fetchMasterData} className="btn-secondary py-2 px-4 text-xs font-bold border-white/10">
                        <Activity size={14} className="mr-2" /> Refresh Data
                    </button>
                    <button onClick={generatePDF} className="btn-primary py-2.5 px-6 text-xs font-black shadow-lg shadow-primary/20">
                        <Download size={16} className="mr-2" /> Export Global Report
                    </button>
                </div>
            </header>

            {/* Stats Overview */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
                {[
                    {
                        label: 'Total Revenue',
                        value: `$${stats.totalRevenue.toLocaleString()}`,
                        icon: TrendingUp,
                        color: 'text-emerald-400',
                        trend: `${stats.revenueTrend >= 0 ? '+' : ''}${stats.revenueTrend}%`,
                        trendColor: stats.revenueTrend >= 0 ? 'text-emerald-400' : 'text-red-400'
                    },
                    {
                        label: 'Active Orgs',
                        value: stats.totalOrganizations,
                        icon: Building2,
                        color: 'text-primary',
                        trend: `+${stats.newSignups} new`,
                        trendColor: 'text-emerald-400'
                    },
                    {
                        label: 'Paid Subscribers',
                        value: stats.activeSubscribers,
                        icon: Users,
                        color: 'text-purple-400',
                        trend: `${stats.conversionRate}% conv.`,
                        trendColor: 'text-purple-400'
                    },
                    {
                        label: 'System Health',
                        value: '100%',
                        icon: Activity,
                        color: 'text-blue-400',
                        trend: 'Stable',
                        trendColor: 'text-emerald-400'
                    }
                ].map((stat, i) => (
                    <motion.div
                        key={i}
                        initial={{ opacity: 0, y: 15 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.1 }}
                        className="glass-card p-6 relative overflow-hidden group"
                    >
                        <div className="flex justify-between items-start mb-4">
                            <div className={`p-3 rounded-2xl bg-white/5 border border-white/5 ${stat.color}`}>
                                <stat.icon size={22} />
                            </div>
                            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{stat.label}</span>
                        </div>
                        <div className="flex items-end justify-between">
                            <h3 className="text-3xl font-black text-white tracking-tight">{stat.value}</h3>
                            <span className={`text-xs font-bold ${stat.trendColor} flex items-center gap-1`}>
                                {stat.trend.includes('%') && (stat.trend.startsWith('+') ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />)}
                                {stat.trend}
                            </span>
                        </div>
                    </motion.div>
                ))}
            </div>

            {/* Main Content Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                {/* Revenue Chart */}
                <div className="lg:col-span-8 glass-card p-6 md:p-8 min-h-[400px] flex flex-col">
                    <div className="mb-8">
                        <h3 className="text-xl font-bold text-white flex items-center gap-2">
                            <TrendingUp className="text-primary" size={20} />
                            Revenue Growth
                        </h3>
                        <p className="text-sm text-slate-400">Platform-wide financial trajectory</p>
                    </div>
                    <div className="h-[300px] w-full mt-auto">
                        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                            <AreaChart data={stats.revenueChart}>
                                <defs>
                                    <linearGradient id="colorRevM" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" vertical={false} />
                                <XAxis dataKey="name" stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} />
                                <YAxis stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} />
                                <Tooltip
                                    contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #ffffff10', borderRadius: '12px', fontSize: '12px' }}
                                    itemStyle={{ color: '#fff' }}
                                />
                                <Area type="monotone" dataKey="rev" stroke="#6366f1" strokeWidth={3} fillOpacity={1} fill="url(#colorRevM)" />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Pricing Controls */}
                <div className="lg:col-span-4 glass-card p-6 md:p-8 self-start">
                    <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                        <Settings className="text-orange-400" size={20} />
                        Global License Fees
                    </h3>
                    <div className="space-y-6">
                        <div className="p-4 rounded-2xl bg-white/5 border border-white/5">
                            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4">Admin Subscription</p>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-[10px] text-slate-400 block mb-1">Monthly</label>
                                    <div className="relative">
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs">$</span>
                                        <input
                                            type="number"
                                            value={settings.pricing_admin.monthly}
                                            onChange={(e) => setSettings({ ...settings, pricing_admin: { ...settings.pricing_admin, monthly: Number(e.target.value) } })}
                                            className="w-full bg-surface border border-white/10 rounded-xl pl-6 pr-3 py-2 text-white text-sm font-bold focus:border-primary/50 outline-none transition-all"
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="text-[10px] text-slate-400 block mb-1">Yearly</label>
                                    <div className="relative">
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs">$</span>
                                        <input
                                            type="number"
                                            value={settings.pricing_admin.yearly}
                                            onChange={(e) => setSettings({ ...settings, pricing_admin: { ...settings.pricing_admin, yearly: Number(e.target.value) } })}
                                            className="w-full bg-surface border border-white/10 rounded-xl pl-6 pr-3 py-2 text-white text-sm font-bold focus:border-primary/50 outline-none transition-all"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="p-4 rounded-2xl bg-white/5 border border-white/5">
                            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4">Provider Subscription</p>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-[10px] text-slate-400 block mb-1">Monthly</label>
                                    <div className="relative">
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs">$</span>
                                        <input
                                            type="number"
                                            value={settings.pricing_provider.monthly}
                                            onChange={(e) => setSettings({ ...settings, pricing_provider: { ...settings.pricing_provider, monthly: Number(e.target.value) } })}
                                            className="w-full bg-surface border border-white/10 rounded-xl pl-6 pr-3 py-2 text-white text-sm font-bold focus:border-primary/50 outline-none transition-all"
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="text-[10px] text-slate-400 block mb-1">Yearly</label>
                                    <div className="relative">
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs">$</span>
                                        <input
                                            type="number"
                                            value={settings.pricing_provider?.yearly || 0}
                                            onChange={(e) => setSettings({ ...settings, pricing_provider: { ...settings.pricing_provider, yearly: Number(e.target.value) } })}
                                            className="w-full bg-surface border border-white/10 rounded-xl pl-6 pr-3 py-2 text-white text-sm font-bold focus:border-primary/50 outline-none transition-all"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Special Subscription */}
                        <div className={`p-4 rounded-2xl border transition-all ${settings.special_plan_enabled ? 'bg-amber-500/5 border-amber-500/10' : 'bg-white/5 border-white/5'}`}>
                            <div className="flex items-center justify-between mb-4">
                                <p className={`text-[10px] font-black uppercase tracking-widest ${settings.special_plan_enabled ? 'text-amber-500/80' : 'text-slate-500'}`}>
                                    Special Subscription (Global Defaults)
                                </p>
                                <label className="relative inline-flex items-center cursor-pointer">
                                    <input
                                        type="checkbox"
                                        className="sr-only peer"
                                        checked={settings.special_plan_enabled || false}
                                        onChange={(e) => setSettings({ ...settings, special_plan_enabled: e.target.checked })}
                                    />
                                    <div className="w-9 h-5 bg-slate-700 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-amber-500/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-amber-500"></div>
                                </label>
                            </div>

                            {settings.special_plan_enabled && (
                                <div className="grid grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-2 duration-300">
                                    <div>
                                        <label className="text-[10px] text-slate-400 block mb-1">Monthly Fee</label>
                                        <div className="relative">
                                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs">$</span>
                                            <input
                                                type="number"
                                                value={settings.pricing_special?.monthly || 0}
                                                onChange={(e) => setSettings({
                                                    ...settings,
                                                    pricing_special: { ...settings.pricing_special, monthly: Number(e.target.value) }
                                                })}
                                                className="w-full bg-surface border border-white/10 rounded-xl pl-6 pr-3 py-2 text-white text-sm font-bold focus:border-amber-500/50 outline-none transition-all"
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="text-[10px] text-slate-400 block mb-1">Free Limit</label>
                                        <div className="relative">
                                            <Users size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                                            <input
                                                type="number"
                                                value={settings.limit_special?.default || 5}
                                                onChange={(e) => setSettings({
                                                    ...settings,
                                                    limit_special: { ...settings.limit_special, default: Number(e.target.value) }
                                                })}
                                                className="w-full bg-surface border border-white/10 rounded-xl pl-8 pr-3 py-2 text-white text-sm font-bold focus:border-amber-500/50 outline-none transition-all"
                                            />
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>


                        <button
                            onClick={handleUpdateSettings}
                            disabled={saving}
                            className="w-full bg-primary hover:bg-primary/80 text-white font-black py-3.5 rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-primary/20"
                        >
                            {saving ? <Loader2 className="animate-spin" size={20} /> : <Settings size={18} />}
                            Update Global Fees
                        </button>
                    </div >
                </div >
            </div >

            {/* System Operations & Logs */}
            < div className="grid grid-cols-1 lg:grid-cols-2 gap-8" >
                <div className="glass-card p-6 md:p-8">
                    <div className="flex justify-between items-start mb-6">
                        <div>
                            <h3 className="text-xl font-bold text-white flex items-center gap-2">
                                <Shield className="text-emerald-400" size={20} />
                                Audit Log Management
                            </h3>
                            <p className="text-sm text-slate-400">Monitor and export system-wide activity logs</p>
                        </div>
                        <button
                            onClick={fetchAuditLogStats}
                            className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 transition-all"
                            title="Refresh Stats"
                        >
                            <Activity size={16} />
                        </button>
                    </div>

                    <div className="grid grid-cols-2 gap-4 mb-8">
                        <div className="p-4 rounded-2xl bg-white/5 border border-white/5">
                            <div className="flex items-center gap-2 mb-2 text-slate-500">
                                <HardDrive size={14} />
                                <span className="text-[10px] font-black uppercase tracking-widest">Storage Size</span>
                            </div>
                            <div className="text-2xl font-black text-white">{auditLogStats.size}</div>
                        </div>
                        <div className="p-4 rounded-2xl bg-white/5 border border-white/5">
                            <div className="flex items-center gap-2 mb-2 text-slate-500">
                                <Database size={14} />
                                <span className="text-[10px] font-black uppercase tracking-widest">Row Count</span>
                            </div>
                            <div className="text-2xl font-black text-white">{auditLogStats.count.toLocaleString()}</div>
                        </div>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-4">
                        <button
                            onClick={() => handleDownloadAuditLogs('csv')}
                            disabled={downloadingLogs}
                            className="flex-1 bg-white/10 hover:bg-white/20 text-white font-bold py-3 px-6 rounded-xl transition-all flex items-center justify-center gap-2 border border-white/10"
                        >
                            {downloadingLogs ? <Loader2 className="animate-spin" size={18} /> : <Download size={18} />}
                            CSV (Excel)
                        </button>
                        <button
                            onClick={() => handleDownloadAuditLogs('json')}
                            disabled={downloadingLogs}
                            className="flex-1 bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 font-bold py-3 px-6 rounded-xl transition-all flex items-center justify-center gap-2 border border-indigo-500/20"
                        >
                            {downloadingLogs ? <Loader2 className="animate-spin" size={18} /> : <FileText size={18} />}
                            JSON (AI Ready)
                        </button>
                    </div>
                    <p className="mt-4 text-[10px] text-slate-500 italic text-center">
                        * Downloads are limited to the most recent 50,000 entries for performance.
                    </p>

                    <div className="mt-6 pt-6 border-t border-white/5 flex flex-col items-center">
                        <button
                            onClick={handlePurgeLogs}
                            className="text-xs text-red-400 hover:text-red-300 font-bold flex items-center gap-2 px-4 py-2 hover:bg-red-500/10 rounded-lg transition-all"
                        >
                            <Trash2 size={14} />
                            Purge System Logs
                        </button>
                        <p className="text-[10px] text-slate-600 mt-1">
                            Warning: This will permanently delete all logs.
                        </p>
                    </div>
                </div>

                <div className="glass-card p-6 md:p-8">
                    <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                        <Activity className="text-blue-400" size={20} />
                        System Health Status
                    </h3>

                    <div className="mb-6 p-4 rounded-xl bg-blue-500/10 border border-blue-500/20 flex flex-col items-center justify-center text-center">
                        <div className="flex items-center gap-2 mb-1 text-blue-300">
                            <Database size={16} />
                            <span className="text-xs font-black uppercase tracking-widest">Total DB Size</span>
                        </div>
                        <div className="text-3xl font-black text-white tracking-tight">
                            {auditLogStats.dbSize || '...'}
                        </div>
                        <div className="text-[10px] text-blue-400/60 font-medium mt-1">Includes all tables & indexes</div>
                    </div>

                    <div className="space-y-4">
                        {[
                            { label: 'Database Connection', status: 'Healthy', color: 'text-emerald-400' },
                            { label: 'Edge Functions', status: 'Active', color: 'text-emerald-400' },
                            { label: 'Realtime Service', status: 'Connected', color: 'text-emerald-400' },
                            { label: 'Auth Service', status: 'Operational', color: 'text-emerald-400' }
                        ].map((item, i) => (
                            <div key={i} className="flex justify-between items-center p-3 rounded-xl bg-white/2 border border-white/5">
                                <span className="text-sm text-slate-400 font-medium">{item.label}</span>
                                <div className="flex items-center gap-2">
                                    <div className={`w-1.5 h-1.5 rounded-full bg-current ${item.color}`} />
                                    <span className={`text-xs font-bold ${item.color}`}>{item.status}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div >

            {/* Organizations Directory */}
            < div className="glass-card overflow-hidden" >
                <div className="p-6 md:p-8 border-b border-white/5 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                    <div>
                        <h3 className="text-xl font-bold text-white flex items-center gap-2">
                            <Building2 className="text-purple-400" size={22} />
                            Organization Directory
                        </h3>
                        <p className="text-sm text-slate-400">Total registered businesses: {filteredOrgs.length}</p>
                    </div>
                    <div className="relative w-full md:w-96">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                        <input
                            type="text"
                            placeholder="Search organization or email..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-12 pr-4 py-3 bg-white/5 border border-white/10 rounded-2xl text-white text-sm focus:border-primary/50 outline-none transition-all shadow-inner"
                        />
                    </div>
                </div>

                <div className="overflow-x-auto min-h-[300px]">
                    <table className="w-full text-left border-collapse min-w-[900px]">
                        <thead>
                            <tr className="bg-white/2">
                                <th className="px-8 py-5 text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-white/5">Organization</th>
                                <th className="px-8 py-5 text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-white/5">Administrator</th>
                                <th className="px-8 py-5 text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-white/5">Staff</th>
                                <th className="px-8 py-5 text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-white/5">Subscription</th>
                                <th className="px-8 py-5 text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-white/5">Activity</th>
                                <th className="px-8 py-5 border-b border-white/5"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {filteredOrgs.map((org) => {
                                const sub = org.subscriptions?.[0];
                                const isAdmin = sub?.tier !== 'trial';
                                const expires = sub?.expires_at ? new Date(sub.expires_at) : null;
                                const isExpired = expires && expires < new Date();

                                return (
                                    <tr key={org.id} className="hover:bg-white/[0.02] transition-colors group">
                                        <td className="px-8 py-6">
                                            <div className="font-bold text-white mb-1">{org.name}</div>
                                            <div className="text-[10px] text-slate-500 font-mono tracking-tighter opacity-50">{org.id}</div>
                                        </td>
                                        <td className="px-8 py-6">
                                            <div className="text-sm text-slate-300 font-medium">{org.profiles?.find(p => p.role === 'Admin')?.email || 'No Admin'}</div>
                                            <div className="text-[10px] text-slate-500">{org.profiles?.find(p => p.role === 'Admin')?.full_name}</div>
                                        </td>
                                        <td className="px-8 py-6">
                                            <button
                                                onClick={() => setShowStaffModal(org)}
                                                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-800 hover:bg-primary/20 hover:border-primary/30 transition-all border border-white/5 text-xs text-slate-300 group/staff"
                                            >
                                                <Users size={12} className="group-hover/staff:text-primary transition-colors" /> {org.profiles?.length || 0}
                                            </button>
                                        </td>
                                        <td className="px-8 py-6">
                                            <div className="flex flex-col gap-1.5">
                                                <div className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded inline-block w-fit ${isAdmin ? 'bg-emerald-500/20 text-emerald-400' : 'bg-orange-500/20 text-orange-400'
                                                    }`}>
                                                    {sub?.tier || 'TRIAL'}
                                                </div>
                                                <div className={`text-xs ${isExpired ? 'text-red-400' : 'text-slate-400'}`}>
                                                    {expires ? `Expires: ${format(expires, 'dd MMM yyyy')}` : 'No expiry set'}
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-8 py-6">
                                            <div className="flex items-center gap-2">
                                                <div className={`w-1.5 h-1.5 rounded-full ${org.profiles?.some(p => {
                                                    const lastSeen = new Date(p.last_seen);
                                                    return (Date.now() - lastSeen.getTime()) < 1000 * 60 * 60 * 24;
                                                }) ? 'bg-emerald-500' : 'bg-slate-700'}`} />
                                                <span className="text-xs text-slate-400">Active today</span>
                                            </div>
                                        </td>
                                        <td className="px-8 py-6">
                                            <div className="flex items-center justify-end gap-2">
                                                <button
                                                    onClick={() => setShowPromoModal({
                                                        id: sub?.id,
                                                        profile_id: org.profiles?.find(p => p.role === 'Admin')?.id,
                                                        business_id: org.id,
                                                        tier: sub?.tier,
                                                        role: 'admin',
                                                        targetType: 'organization'
                                                    })}
                                                    className="p-2.5 rounded-xl bg-white/5 hover:bg-orange-400/10 text-slate-400 hover:text-orange-400 transition-all border border-transparent hover:border-orange-400/20"
                                                    title="Apply Promo Days"
                                                >
                                                    <Gift size={18} />
                                                </button>
                                                <button
                                                    onClick={() => setShowSpecialSubModal({
                                                        business_id: org.id,
                                                        name: org.name,
                                                        special_plan_active: org.special_plan_active,
                                                        original_active: org.special_plan_active, // Keep track of original state
                                                        special_plan_price: org.special_plan_price,
                                                        special_plan_limit: org.special_plan_limit
                                                    })}
                                                    className="p-2.5 rounded-xl bg-white/5 hover:bg-emerald-400/10 text-slate-400 hover:text-emerald-400 transition-all border border-transparent hover:border-emerald-400/20"
                                                    title="Manage Special Subscription"
                                                >
                                                    <CreditCard size={18} />
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        setShowReportModal(org);
                                                        fetchBusinessDetails(org.id);
                                                    }}
                                                    className="p-2.5 rounded-xl bg-white/5 hover:bg-primary/10 text-slate-400 hover:text-primary transition-all border border-transparent hover:border-primary/20"
                                                >
                                                    <FileText size={18} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div >

            {/* Promo Modal */}
            < AnimatePresence >
                {showPromoModal && (
                    <div className="fixed inset-0 bg-background/80 backdrop-blur-md z-[110] flex items-center justify-center p-4">
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            className="glass-card w-full max-w-md p-8 relative"
                        >
                            <button
                                onClick={() => setShowPromoModal(null)}
                                className="absolute top-4 right-4 text-slate-500 hover:text-white"
                            >
                                <X size={20} />
                            </button>

                            <div className="text-center mb-8">
                                <div className="w-16 h-16 bg-orange-400/20 text-orange-400 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-orange-400/20">
                                    <Gift size={32} />
                                </div>
                                <h3 className="text-2xl font-bold text-white mb-2">Apply Promo Days</h3>
                                <p className="text-slate-400 text-sm">Extend subscription for this {showPromoModal.targetType === 'organization' ? 'organization' : 'selected provider'} manually.</p>
                            </div>

                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                {[7, 10, 15, 30, 60, 90].map((days) => (
                                    <button
                                        key={days}
                                        onClick={() => handleApplyPromo(days)}
                                        disabled={saving}
                                        className="py-4 rounded-xl bg-white/5 border border-white/5 text-white font-black hover:bg-orange-400 hover:text-white transition-all flex flex-col items-center group"
                                    >
                                        <span className="text-2xl leading-none mb-1 group-hover:scale-110 transition-transform">{days}</span>
                                        <span className="text-[10px] font-bold text-slate-500 group-hover:text-white/80 uppercase tracking-widest">Days</span>
                                    </button>
                                ))}
                            </div>

                            {saving && (
                                <div className="mt-6 flex items-center justify-center gap-2 text-orange-400 text-sm font-bold">
                                    <Loader2 className="animate-spin" size={16} />
                                    Applying Extension...
                                </div>
                            )}

                            <p className="mt-8 text-[10px] text-center text-slate-500 italic">
                                * This will update the expiration date relative to today.
                            </p>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence >

            {/* Deep Dive Modal */}
            < AnimatePresence >
                {showReportModal && (
                    <div className="fixed inset-0 bg-background/80 backdrop-blur-md z-[100] flex items-center justify-center p-4">
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            className="glass-card w-full max-w-4xl p-8 relative flex flex-col gap-8 max-h-[90vh] overflow-y-auto"
                        >
                            <button
                                onClick={() => setShowReportModal(null)}
                                className="absolute top-4 right-4 text-slate-500 hover:text-white"
                            >
                                <X size={24} />
                            </button>

                            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                                <div>
                                    <h3 className="text-3xl font-black text-white">{showReportModal.name}</h3>
                                    <p className="text-slate-400 text-sm">Deep analysis and data export for this organization.</p>
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => downloadCSV(businessDetails.appointments, `appointments-${showReportModal.name}`)}
                                        className="btn-secondary py-2 px-4 text-xs font-bold"
                                    >
                                        Export Appointments (CSV)
                                    </button>
                                    <button
                                        onClick={() => downloadCSV(businessDetails.clients, `clients-${showReportModal.name}`)}
                                        className="btn-secondary py-2 px-4 text-xs font-bold"
                                    >
                                        Export Clients (CSV)
                                    </button>
                                </div>
                            </div>

                            {fetchingDetails ? (
                                <div className="py-20 flex flex-col items-center gap-4">
                                    <Loader2 className="animate-spin text-primary" size={40} />
                                    <p className="text-slate-500 italic">Compiling business data...</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                    <div className="p-6 rounded-2xl bg-white/5 border border-white/5">
                                        <p className="text-[10px] uppercase font-black tracking-widest text-slate-500 mb-2">Total Appointments</p>
                                        <div className="text-4xl font-black text-white">{businessDetails.appointments.length}</div>
                                        <p className="text-xs text-slate-400 mt-2">Historical bookings</p>
                                    </div>
                                    <div className="p-6 rounded-2xl bg-white/5 border border-white/5">
                                        <p className="text-[10px] uppercase font-black tracking-widest text-slate-500 mb-2">Unique Clients</p>
                                        <div className="text-4xl font-black text-indigo-400">{businessDetails.clients.length}</div>
                                        <p className="text-xs text-slate-400 mt-2">Registered database</p>
                                    </div>
                                    <div className="p-6 rounded-2xl bg-white/5 border border-white/5">
                                        <p className="text-[10px] uppercase font-black tracking-widest text-slate-500 mb-2">Billing Events</p>
                                        <div className="text-4xl font-black text-emerald-400">{businessDetails.payments.length}</div>
                                        <p className="text-xs text-slate-400 mt-2">Lifetime transactions</p>
                                    </div>

                                    <div className="md:col-span-3">
                                        <h4 className="text-lg font-bold text-white mb-4">Payment History</h4>
                                        <div className="space-y-3">
                                            {businessDetails.payments.length > 0 ? (
                                                businessDetails.payments.map((p, i) => (
                                                    <div key={i} className="flex justify-between items-center p-4 rounded-xl bg-white/2 border border-white/5">
                                                        <div>
                                                            <div className="text-sm font-bold text-white">${p.amount}</div>
                                                            <div className="text-[10px] text-slate-500">{format(new Date(p.created_at), 'dd MMM yyyy HH:mm')}</div>
                                                        </div>
                                                        <div className="text-xs px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-bold uppercase tracking-widest">
                                                            {p.role}
                                                        </div>
                                                    </div>
                                                ))
                                            ) : (
                                                <div className="text-center py-10 text-slate-500 italic">No payments recorded for this organization.</div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </motion.div>
                    </div>
                )}
            </AnimatePresence >

            {/* Staff List Modal */}
            < AnimatePresence >
                {showStaffModal && (
                    <div className="fixed inset-0 bg-background/80 backdrop-blur-md z-[101] flex items-center justify-center p-4">
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            className="glass-card w-full max-w-2xl p-8 relative overflow-hidden"
                        >
                            <button
                                onClick={() => setShowStaffModal(null)}
                                className="absolute top-4 right-4 text-slate-500 hover:text-white"
                            >
                                <X size={24} />
                            </button>

                            <div className="mb-8">
                                <h3 className="text-2xl font-black text-white flex items-center gap-3">
                                    <Users className="text-primary" size={24} />
                                    Staff Directory
                                </h3>
                                <p className="text-slate-400 text-sm">{showStaffModal.name}</p>
                            </div>

                            <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
                                {showStaffModal.profiles?.sort((a, b) => a.role === 'Admin' ? -1 : 1).map((staff) => {
                                    const staffSub = showStaffModal.subscriptions?.find(s => s.profile_id === staff.id);
                                    const isPaid = staffSub?.tier === 'monthly' || staffSub?.tier === 'yearly';
                                    const now = new Date();
                                    const expiryDate = staffSub?.expires_at ? new Date(staffSub.expires_at) : null;
                                    const isExpired = expiryDate && expiryDate < now;

                                    return (
                                        <div key={staff.id} className="p-4 rounded-xl bg-white/2 border border-white/5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 group hover:bg-white/5 transition-all">
                                            <div className="flex items-center gap-4">
                                                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold shrink-0">
                                                    {staff.full_name?.charAt(0) || staff.email.charAt(0).toUpperCase()}
                                                </div>
                                                <div>
                                                    <div className="text-sm font-bold text-white flex flex-wrap items-center gap-2">
                                                        {staff.full_name || 'No Name'}
                                                        {staff.role === 'Admin' && (
                                                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-400 border border-amber-500/20 font-black uppercase tracking-tighter">
                                                                Owner
                                                            </span>
                                                        )}
                                                        {isExpired ? (
                                                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-red-500/20 text-red-400 border border-red-500/30 font-black uppercase tracking-tighter animate-pulse shadow-[0_0_10px_rgba(239,68,68,0.2)]">
                                                                EXPIRED
                                                            </span>
                                                        ) : isPaid ? (
                                                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 font-black uppercase tracking-tighter">
                                                                Paid
                                                            </span>
                                                        ) : (
                                                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-500/20 text-slate-400 border border-slate-500/20 font-black uppercase tracking-tighter">
                                                                Trial
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="text-xs text-slate-500 truncate max-w-[200px] sm:max-w-none">{staff.email}</div>
                                                </div>
                                            </div>
                                            <div className="flex-1 flex justify-center sm:justify-end">
                                                <button
                                                    onClick={() => setShowPromoModal({
                                                        id: staffSub?.id,
                                                        profile_id: staff.id,
                                                        business_id: showStaffModal.id,
                                                        tier: staffSub?.tier,
                                                        role: staff.role?.toLowerCase(),
                                                        targetType: 'provider'
                                                    })}
                                                    className="p-2 rounded-lg bg-white/5 hover:bg-orange-400/10 text-slate-500 hover:text-orange-400 transition-all border border-transparent hover:border-orange-400/10"
                                                    title="Apply Staff Promo"
                                                >
                                                    <Gift size={16} />
                                                </button>
                                            </div>

                                            <div className="text-left sm:text-right w-full sm:w-auto flex sm:flex-col justify-between items-center sm:items-end border-t border-white/5 sm:border-0 pt-4 sm:pt-0">
                                                <div className="text-[10px] text-slate-500 uppercase font-black tracking-widest">{staff.role}</div>
                                                {staffSub?.expires_at && (
                                                    <div className={`text-[9px] font-bold ${isExpired ? 'text-red-400' : 'text-slate-400 opacity-60'}`}>
                                                        {format(new Date(staffSub.expires_at), 'dd MMM yyyy')}
                                                    </div>
                                                )}
                                                <div className="text-[10px] text-slate-600 italic">
                                                    ID: {staff.id.slice(0, 8)}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            <div className="mt-8 p-4 rounded-xl bg-primary/5 border border-primary/10 flex items-center gap-3">
                                <div className="p-2 rounded-lg bg-primary/20 text-primary">
                                    <Activity size={18} />
                                </div>
                                <p className="text-xs text-slate-400">
                                    This list includes all active providers and staff members registered under this organization.
                                </p>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence >
            {/* Special Subscription Modal */}
            < AnimatePresence >
                {showSpecialSubModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="bg-[#0f172a] border border-white/10 rounded-2xl p-6 md:p-8 w-full max-w-lg shadow-2xl relative overflow-hidden"
                        >
                            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-500 to-emerald-400" />
                            <button
                                onClick={() => setShowSpecialSubModal(null)}
                                className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors"
                            >
                                <X size={20} />
                            </button>

                            <div className="flex items-center gap-4 mb-6">
                                <div className="p-3 rounded-xl bg-emerald-500/10 text-emerald-400">
                                    <CreditCard size={24} />
                                </div>
                                <div>
                                    <h3 className="text-xl font-bold text-white">Special Subscription Manager</h3>
                                    <p className="text-slate-400 text-sm">Managing for: <span className="text-white font-medium">{showSpecialSubModal.name}</span></p>
                                </div>
                            </div>

                            <div className="space-y-6">
                                <div className="flex items-center justify-between p-4 rounded-xl bg-white/5 border border-white/5">
                                    <div>
                                        <label className="text-sm font-bold text-white block">Status</label>
                                        <p className="text-xs text-slate-400">Enable special tiered access</p>
                                    </div>
                                    <label className="relative inline-flex items-center cursor-pointer">
                                        <input
                                            type="checkbox"
                                            className="sr-only peer"
                                            checked={showSpecialSubModal.special_plan_active || false}
                                            onChange={(e) => setShowSpecialSubModal({ ...showSpecialSubModal, special_plan_active: e.target.checked })}
                                        />
                                        <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                                    </label>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 block">Price (Monthly)</label>
                                        <div className="relative">
                                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm font-bold">$</span>
                                            <input
                                                type="number"
                                                value={showSpecialSubModal.special_plan_price || 0}
                                                onChange={(e) => setShowSpecialSubModal({ ...showSpecialSubModal, special_plan_price: Number(e.target.value) })}
                                                className="w-full bg-black/20 border border-white/10 rounded-xl pl-8 pr-4 py-3 text-white font-bold outline-none focus:border-emerald-500/50 transition-all"
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 block">Provider Limit</label>
                                        <div className="relative">
                                            <Users size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                                            <input
                                                type="number"
                                                value={showSpecialSubModal.special_plan_limit || 5}
                                                onChange={(e) => setShowSpecialSubModal({ ...showSpecialSubModal, special_plan_limit: Number(e.target.value) })}
                                                className="w-full bg-black/20 border border-white/10 rounded-xl pl-9 pr-4 py-3 text-white font-bold outline-none focus:border-emerald-500/50 transition-all"
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/20">
                                    <div className="flex gap-3">
                                        <Activity className="text-blue-400 shrink-0 mt-0.5" size={16} />
                                        <div className="space-y-1">
                                            <p className="text-xs font-bold text-blue-100">Plan Logic</p>
                                            <p className="text-[11px] text-blue-200/70 leading-relaxed">
                                                Enabling this plan grants free access to the first <span className="text-white font-bold">{showSpecialSubModal.special_plan_limit}</span> providers (sorted by seniority). Any staff members beyond this limit must pay for a standard subscription.
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                <button
                                    onClick={handleUpdateSpecialSub}
                                    disabled={saving}
                                    className="w-full bg-emerald-500 hover:bg-emerald-400 text-white font-black py-4 rounded-xl shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/40 transition-all flex items-center justify-center gap-2"
                                >
                                    {saving ? <Loader2 className="animate-spin" size={20} /> : <Shield size={20} />}
                                    Save Configuration
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence >
        </div >
    );
};

export default MasterDashboard;
