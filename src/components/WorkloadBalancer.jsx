import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { ArrowLeftRight, UserCheck, AlertTriangle, CheckCircle2, Clock, BarChart3, Loader2, Globe, User, Sparkles, ChevronRight, Check, CheckCheck } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { format } from 'date-fns'
import { sendWhatsApp } from '../lib/notifications'
import { useAuth } from '../hooks/useAuth'
import { playNotificationSound } from '../utils/sound'
import { useNavigate } from 'react-router-dom'
import AddAppointmentModal from './AddAppointmentModal'

const WorkloadBalancer = ({ initialChatSender }) => {
    const { user, profile } = useAuth()

    const [delayedApts, setDelayedApts] = useState([])
    const [freeProviders, setFreeProviders] = useState([])
    const [allProviders, setAllProviders] = useState([])
    const [loading, setLoading] = useState(true)
    const [globalView, setGlobalView] = useState(profile?.role?.toLowerCase() === 'admin')
    const [suggestions, setSuggestions] = useState([])
    const [systemHealth, setSystemHealth] = useState(null)
    const [processing, setProcessing] = useState(false)
    const navigate = useNavigate()

    // Appointment Actions
    const [selectedAptForAction, setSelectedAptForAction] = useState(null)
    const [showActionModal, setShowActionModal] = useState(false)
    const [showRescheduleModal, setShowRescheduleModal] = useState(false)

    // Messaging State
    const [showOnlineModal, setShowOnlineModal] = useState(false)
    const [selectedProvider, setSelectedProvider] = useState(null)
    const [messages, setMessages] = useState([])
    const [newMessage, setNewMessage] = useState('')

    // Effect to handle incoming external navigation to chat
    useEffect(() => {
        if (initialChatSender) {
            setSelectedProvider(initialChatSender);
            setShowOnlineModal(true);
            // We should also clear the notification in Dashboard really, but resetting unreadCount locally works for the badge
        }
    }, [initialChatSender]);

    // Handle initial read and status updates when opening chat
    useEffect(() => {
        if (showOnlineModal && selectedProvider) {
            // Mark all existing unread from them as read on open
            const markAllRead = async () => {
                await supabase.from('temporary_messages')
                    .update({ is_read: true })
                    .eq('sender_id', selectedProvider.id)
                    .eq('receiver_id', user.id)
                    .eq('is_read', false)
            }
            markAllRead()
        }
    }, [showOnlineModal, selectedProvider, user.id])

    // Note: The main chat subscription (later in file) handles real-time "mark as read" for NEW messages

    const fetchData = async (isSilent = false) => {
        if (!profile?.business_id) return
        if (!isSilent) setLoading(true)
        try {
            // 1. Fetch delayed appointments
            // 1. Fetch delayed appointments (Limit to recent & near future to avoid fetching 400+ items)
            // Range: Past 24 hours (catch overdue) to Next 24 hours (catch immediate problems)
            const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
            const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);

            let delayedQuery = supabase
                .from('appointments')
                .select('*, client:clients(first_name, last_name, phone), profile:profiles!appointments_assigned_profile_id_fkey(full_name, id, is_online)')
                .eq('status', 'pending')
                .gte('scheduled_start', yesterday.toISOString())
                .lte('scheduled_start', tomorrow.toISOString());

            if (!globalView) {
                delayedQuery = delayedQuery.eq('assigned_profile_id', user.id);
            }

            const { data: allPending, error: delayedError } = await delayedQuery;
            if (delayedError) throw delayedError

            const filtered = (allPending || []).filter(apt => {
                const threshold = Math.max(10, Math.floor(apt.duration_minutes * 0.25));
                return apt.delay_minutes > threshold;
            });
            setDelayedApts(filtered)

            // 2. Fetch free providers
            const { data: allProviders } = await supabase
                .from('profiles')
                .select('*')
                .eq('business_id', profile?.business_id)

            // 3. Fetch Busy Providers (Using Secure RPC to bypass RLS visibility issues)
            const { data: busyProviderData, error: busyError } = await supabase
                .rpc('get_busy_providers', { p_business_id: profile?.business_id })

            if (busyError) console.error('Busy Check Error:', busyError)

            const busyIds = busyProviderData?.map(a => a.provider_id) || []

            // Check Heartbeats (mark local 'is_online' false if stale > 5 mins)
            const now = new Date()
            const FIVE_MINUTES = 5 * 60 * 1000

            const providersWithHeartbeat = allProviders?.map(p => {
                const lastSeen = p.last_seen ? new Date(p.last_seen) : null
                const isStale = !lastSeen || (now - lastSeen > FIVE_MINUTES)

                if (isStale) {
                    console.log(`[Balancer] Provider ${p.full_name} marked OFFLINE (Stale: ${lastSeen ? Math.round((now - lastSeen) / 1000) + 's ago' : 'Never'})`)
                    return { ...p, is_online: false }
                }
                return p
            }) || []

            // Filter out busy, but log who is busy
            // NEW: Don't filter out busy providers, just mark them so Admin can see them
            const free = providersWithHeartbeat.filter(p => p.is_online).map(p => {
                const isBusy = busyIds.includes(p.id);
                return { ...p, is_busy: isBusy };
            });

            console.log(`[Balancer] Online & Free Providers:`, free.map(f => f.full_name));
            setFreeProviders(free)
            setAllProviders(providersWithHeartbeat)

            // 3. Fetch Smart Recommendations (Autopilot)
            if (profile?.role?.toLowerCase() === 'admin' && profile?.business_id) {
                const { getSmartReassignments, analyzeSystemHealth } = await import('../lib/balancerLogic')
                const [smart, health] = await Promise.all([
                    getSmartReassignments(profile.business_id),
                    analyzeSystemHealth(profile.business_id)
                ])
                setSuggestions(smart)
                setSystemHealth(health)
            }
        } catch (error) {
            console.error('Balancer Data Error:', error)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        if (user && profile) {
            fetchData()

            // Realtime Listener for Online Status (Recalculate suggestions when someone logs in/out)
            const channel = supabase.channel('balancer-realtime')
                .on('postgres_changes', {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'profiles',
                    filter: `business_id=eq.${profile.business_id}`
                }, (payload) => {
                    if (payload.new.is_online !== payload.old.is_online) {
                        console.log('[Balancer] Online status changed, recalculating...');
                        fetchData(true)
                    }
                })
                .on('postgres_changes', {
                    event: '*',
                    schema: 'public',
                    table: 'appointments',
                    filter: `business_id=eq.${profile.business_id}`
                }, () => fetchData(true)) // Also refresh on status changes
                .subscribe()

            return () => {
                supabase.removeChannel(channel)
            }
        }
    }, [user, profile, globalView])

    const notifyAdminsOfOfflineProviders = async (apt, offlineQualified) => {
        try {
            const clientName = `${apt.client?.first_name} ${apt.client?.last_name || ''}`.trim();
            const treatment = apt.treatment_name || 'Treatment';
            const startTime = format(new Date(apt.scheduled_start), 'HH:mm');
            const providersList = offlineQualified.map(p => `${p.full_name} (${p.phone || 'No phone'})`).join(', ');

            const message = `Hi ${profile.full_name || 'Admin'}, we have a client (${clientName}) that needs ${treatment} at ${startTime} but the qualified providers are currently not online. Can you attend to it ASAP?\n\nQualified Providers: ${providersList}`;

            // Fetch Admins
            const { data: admins } = await supabase
                .from('profiles')
                .select('whatsapp, full_name')
                .eq('business_id', profile.business_id)
                .in('role', ['Admin', 'Manager', 'Owner']);

            if (admins && admins.length > 0) {
                for (const admin of admins) {
                    if (admin.whatsapp) {
                        await sendWhatsApp(admin.whatsapp, message);
                    }
                }
                alert('Admins notified via WhatsApp!');
            } else {
                alert('No admin contact details found.');
            }
        } catch (err) {
            console.error('Notification Error:', err);
            alert('Failed to send notification.');
        }
    };

    const shiftClient = async (aptId, newProviderId, oldProviderId) => {
        if (!confirm('Shift this client to the new provider?')) return

        try {
            // Optimistic update for demo purposes
            setDelayedApts(prev => prev.filter(a => a.id !== aptId))

            const { error } = await supabase.rpc('reassign_appointment', {
                appt_id: aptId,
                new_provider_id: newProviderId,
                note_text: 'Shifted via Workload Balancer'
            });

            if (!error) {
                // Trigger notification
                const apt = delayedApts.find(a => a.id === aptId);
                const provider = freeProviders.find(p => p.id === newProviderId);
                if (apt && provider) {
                    const clientName = `${apt.client?.first_name} ${apt.client?.last_name || ''}`.trim();
                    const bizName = "[Your Business Name]";
                    await sendWhatsApp(apt.client?.phone, `Hi ${clientName}, this is ${bizName}. Your session has been reassigned to ${provider.full_name} to minimize your wait time. See you soon!`);

                    // Notify New Provider
                    if (provider.whatsapp) {
                        const startTime = format(new Date(apt.scheduled_start), 'HH:mm');
                        await sendWhatsApp(provider.whatsapp, `[Reassignment] Hi ${provider.full_name}, ${clientName} has been shifted to your schedule at ${startTime}.`);
                    }
                }

                alert('Client successfully shifted and notified!');
                fetchData() // Refresh real data
            } else {
                throw error
            }
        } catch (error) {
            console.error(error)
            // Revert optimistic update? For now just alert
            alert('Simulation: Shift recorded (Offline/Error Mode)')
        }
    }

    const approveSuggestion = async (sug) => {
        try {
            const { error } = await supabase
                .from('appointments')
                .update({
                    assigned_profile_id: sug.newProviderId,
                    shifted_from_id: sug.currentProviderId,
                    notes: 'Auto-pilot reassignment due to delay'
                })
                .eq('id', sug.appointmentId)

            if (error) throw error

            // Notify Client & New Provider
            const bizName = "[Your Business Name]"
            if (sug.newProviderWhatsapp) {
                await sendWhatsApp(sug.newProviderWhatsapp, `Hi ${sug.newProviderName}, you have a new appointment shifted to you: ${sug.clientName} at ${sug.scheduledTime}.`)
            }

            // Trigger feedback
            setSuggestions(prev => prev.filter(s => s.appointmentId !== sug.appointmentId))
            fetchData(true)
        } catch (err) {
            console.error('Failed to approve suggestion:', err)
            alert('Action failed. Check logs.')
        }
    }

    const approveAllSuggestions = async () => {
        if (!confirm(`Apply all ${suggestions.length} smart reassignments?`)) return
        setProcessing(true)
        for (const sug of suggestions) {
            await approveSuggestion(sug)
        }
        setProcessing(false)
        alert('Autopilot complete: All suggested shifts applied!')
    }

    const handleDeleteAppointment = async () => {
        if (!selectedAptForAction) return
        if (!confirm('Are you sure you want to permanently delete this appointment? This action cannot be undone.')) return

        setLoading(true)
        try {
            const { error: delError } = await supabase
                .from('appointments')
                .delete()
                .eq('id', selectedAptForAction.id)

            if (delError) throw delError

            // Log the action
            const { error: logError } = await supabase
                .from('appointment_logs')
                .insert({
                    business_id: profile.business_id,
                    actor_id: user.id,
                    action_type: 'DELETE',
                    details: selectedAptForAction
                })

            if (logError) console.error('Failed to log deletion:', logError)

            // Notify Admins
            const { data: admins } = await supabase
                .from('profiles')
                .select('whatsapp, full_name')
                .eq('business_id', profile.business_id)
                .in('role', ['Admin', 'Manager', 'Owner']) // Broaden to catch decision makers

            if (admins && admins.length > 0) {
                const clientName = `${selectedAptForAction.client?.first_name} ${selectedAptForAction.client?.last_name}`
                const deleterName = profile.full_name || 'A staff member'
                const msg = `⚠️ Appointment Deleted: ${clientName} was deleted by ${deleterName} via Workload Balancer.`

                for (const admin of admins) {
                    if (admin.whatsapp) {
                        await sendWhatsApp(admin.whatsapp, msg)
                    }
                }
            }

            alert('Appointment deleted and admins notified.')
            setShowActionModal(false)
            setSelectedAptForAction(null)
            fetchData()
        } catch (error) {
            console.error('Delete failed:', error)
            alert('Failed to delete appointment.')
        } finally {
            setLoading(false)
        }
    }

    const openActionModal = (apt) => {
        setSelectedAptForAction(apt)
        setShowActionModal(true)
    }

    // Messaging Logic
    const startChat = (provider) => {
        setSelectedProvider(provider)
        // Load existing messages immediately? Or wait for subscription?
        // Let's just subscribe.
    }

    const sendMessage = async () => {
        if (!newMessage.trim() || !selectedProvider) return

        const content = newMessage.trim();
        const tempId = 'temp-' + Date.now();
        const optimisticMsg = {
            id: tempId,
            sender_id: user.id,
            receiver_id: selectedProvider.id,
            content: content,
            created_at: new Date().toISOString(),
            is_read: false,
            pending: true // Mark as pending local-only
        }

        setNewMessage('') // Clear input immediately

        // Optimistic Add (1 Tick State)
        setMessages(prev => [optimisticMsg, ...prev])
        setTimeout(scrollToBottom, 100);

        try {
            // Check receiver's presence first
            const { data: receiverData } = await supabase
                .from('profiles')
                .select('active_chat_id')
                .eq('id', selectedProvider.id)
                .single()

            // If they are looking at our chat (their active_chat_id usually equals OUR user.id)
            const isReadImmediately = receiverData?.active_chat_id === user.id;

            const { data, error } = await supabase
                .from('temporary_messages')
                .insert({
                    sender_id: user.id,
                    receiver_id: selectedProvider.id,
                    business_id: profile.business_id,
                    content: content,
                    is_read: isReadImmediately // Set TRUE if they are present
                })
                .select()
                .single()

            if (error) throw error

            // Verification Update (2 Ticks State)
            if (data) {
                setMessages(prev => prev.map(m =>
                    m.id === tempId ? data : m
                ))
            }

        } catch (err) {
            console.error('Failed to send message:', err)
            // Revert on error
            setMessages(prev => prev.filter(m => m.id !== tempId))
            setNewMessage(content)
            alert('Failed to send. Try again.')
        }
    }

    // Subscribe to messages when selectedProvider changes
    useEffect(() => {
        if (!selectedProvider || !showOnlineModal || !user || !profile) {
            setMessages([])
            return
        }

        // Fetch initial history (last 2 hours)
        const fetchHistory = async () => {
            const { data, error } = await supabase
                .from('temporary_messages')
                .select('*')
                .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
                .or(`sender_id.eq.${selectedProvider.id},receiver_id.eq.${selectedProvider.id}`) // Ensure only chat between US and THEM
                .order('created_at', { ascending: false }) // Get latest first for easier initial load, then flip or just sort
                .limit(50)

            if (!error && data) {
                // Filter strictly for this conversation (supabase OR filter above might be too broad if not careful with grouping)
                // actually .or(and(sender=me, receiver=them), and(sender=them, receiver=me)) is hard in simple syntax
                // simpler to fetch all my messages with them and filter in JS for now or write a better query
                const relevant = data.filter(m =>
                    (m.sender_id === user.id && m.receiver_id === selectedProvider.id) ||
                    (m.sender_id === selectedProvider.id && m.receiver_id === user.id)
                )
                setMessages(relevant)
            }
        }
        fetchHistory()

        const channel = supabase.channel(`chat-${user.id}-${selectedProvider.id}`)
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'temporary_messages'
                // REMOVED FILTER: Listening to EVERYTHING to ensure instant delivery. 
                // We filter below strictly for this active chat.
            }, (payload) => {
                const msg = payload.new
                // Client-side filter: Is this message for THIS chat window?
                if (
                    (msg.sender_id === user.id && msg.receiver_id === selectedProvider.id) ||
                    (msg.sender_id === selectedProvider.id && msg.receiver_id === user.id)
                ) {
                    setMessages(prev => {
                        // Dedup check
                        if (prev.some(m => m.id === msg.id)) return prev;
                        return [msg, ...prev]
                    })

                    // Mark immediate read if it's from them
                    if (msg.sender_id === selectedProvider.id && showOnlineModal) {
                        supabase.from('temporary_messages')
                            .update({ is_read: true })
                            .eq('id', msg.id)
                            .then(({ error }) => {
                                if (error) console.error("Error marking read:", error)
                            })
                    }
                }
            })
            .on('postgres_changes', {
                event: 'UPDATE',
                schema: 'public',
                table: 'temporary_messages',
                filter: `sender_id=eq.${user.id}` // Listen specifically for MY messages being updated (Read receipts)
            }, (payload) => {
                const updatedMsg = payload.new
                setMessages(prev => prev.map(msg =>
                    msg.id === updatedMsg.id ? updatedMsg : msg
                ))
            })
            .subscribe()

        return () => {
            supabase.removeChannel(channel)
        }
    }, [selectedProvider, showOnlineModal, user?.id, profile?.business_id])

    // Global Message Listener for Notifications
    const [unreadCount, setUnreadCount] = useState(0)

    useEffect(() => {
        if (!user || !profile?.business_id) return

        const channel = supabase.channel(`global-notifications-${user.id}`)
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'temporary_messages',
                filter: `business_id=eq.${profile.business_id}`
            }, (payload) => {
                const msg = payload.new
                // If message is FOR ME
                if (msg.receiver_id === user.id) {
                    // Check if chat is NOT open with this sender
                    const isChatOpen = showOnlineModal && selectedProvider?.id === msg.sender_id

                    if (!isChatOpen) {
                        playNotificationSound()
                        setUnreadCount(prev => prev + 1)
                    }
                }
            })
            .subscribe()

        return () => {
            supabase.removeChannel(channel)
        }
    }, [user, profile?.business_id, showOnlineModal, selectedProvider])

    // Presence & Notification Logic
    useEffect(() => {
        if (!user) return;

        const updatePresence = async (chatTargetId) => {
            try {
                await supabase.from('profiles').update({
                    active_chat_id: chatTargetId
                }).eq('id', user.id)
            } catch (err) {
                console.error("Presence update failed", err)
            }
        }

        if (showOnlineModal && selectedProvider) {
            updatePresence(selectedProvider.id);
        } else {
            updatePresence(null);
        }

        return () => {
            // Only clear on unmount if we were the one setting it? 
            // Simplified: If modal closes, effect runs and sets to null.
        }
    }, [showOnlineModal, selectedProvider, user])

    // Global Message Listener for Notifications
    useEffect(() => {
        if (showOnlineModal) {
            setUnreadCount(0)
        }
    }, [showOnlineModal])


    // Auto-scroll logic
    const messagesEndRef = useRef(null)
    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
    }
    useEffect(() => {
        scrollToBottom()
    }, [messages, selectedProvider]) // Auto-scroll on new messages or chat open

    // Auto-exit idle timer (120 seconds)
    useEffect(() => {
        if (!showOnlineModal) return;

        let idleTimer;
        const resetTimer = () => {
            clearTimeout(idleTimer);
            // 120 seconds = 120000 ms
            idleTimer = setTimeout(() => {
                setShowOnlineModal(false); // Close automatically
                // alert("Chat closed due to inactivity."); // Optional feedback
            }, 120000);
        };

        // Events to track activity
        window.addEventListener("mousemove", resetTimer);
        window.addEventListener("keydown", resetTimer);
        window.addEventListener("click", resetTimer);
        window.addEventListener("touchstart", resetTimer);

        resetTimer(); // Start initial timer

        return () => {
            clearTimeout(idleTimer);
            window.removeEventListener("mousemove", resetTimer);
            window.removeEventListener("keydown", resetTimer);
            window.removeEventListener("click", resetTimer);
            window.removeEventListener("touchstart", resetTimer);
        };
    }, [showOnlineModal]);


    // SOS Action
    const handleRequestBackup = async () => {
        if (!confirm("⚠️ SEND EMERGENCY ALERT?\n\nThis will send a WhatsApp message to all OFFLINE providers requesting immediate backup.")) return;

        // Find offline providers
        const { data: offline } = await supabase
            .from('profiles')
            .select('whatsapp, full_name')
            .eq('business_id', profile.business_id)
            .eq('role', 'Provider')
            .eq('is_online', false);

        if (!offline?.length) {
            alert("No offline providers found to contact.");
            return;
        }

        let sentCount = 0;
        for (const prov of offline) {
            if (prov.whatsapp) {
                await sendWhatsApp(prov.whatsapp, `🚨 SOS ALERT: Clinic is at ${systemHealth?.loadPercentage}% capacity! Please log in immediately to assist.`);
                sentCount++;
            }
        }
        alert(`SOS Sent to ${sentCount} providers.`);
    };

    if (!profile) return <div className="flex justify-center py-20"><Loader2 className="animate-spin text-slate-500" /></div>

    return (
        <div className="space-y-10">
            {/* SOS BANNER */}
            {systemHealth?.status === 'Critical' && (
                <motion.div
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-red-500/10 border border-red-500/30 rounded-2xl p-6 flex flex-col md:flex-row items-center justify-between gap-4"
                >
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-red-500 rounded-xl text-white animate-pulse">
                            <AlertTriangle size={24} />
                        </div>
                        <div>
                            <h3 className="text-xl font-black text-red-500 uppercase tracking-widest">System Overload</h3>
                            <p className="text-red-400 font-medium">Capacity is at {systemHealth.loadPercentage}%. Immediate backup required.</p>
                        </div>
                    </div>
                    <button
                        onClick={handleRequestBackup}
                        className="px-6 py-3 bg-red-500 hover:bg-red-600 text-white font-bold rounded-xl shadow-lg shadow-red-500/20 active:scale-95 transition-all flex items-center gap-2"
                    >
                        <Globe size={18} />
                        REQUEST BACKUP ({systemHealth.totalLoadMinutes - systemHealth.totalCapacityMinutes}m overtime)
                    </button>
                </motion.div>
            )}

            {/* HEALTH WIDGET (Mini) */}
            {systemHealth && systemHealth.status !== 'Critical' && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="p-4 rounded-2xl bg-slate-800/40 border border-white/5 flex items-center justify-between">
                        <div>
                            <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">System Load</p>
                            <p className={`text-2xl font-black ${systemHealth.status === 'Warning' ? 'text-amber-400' : 'text-emerald-400'}`}>
                                {systemHealth.loadPercentage}%
                            </p>
                        </div>
                        <BarChart3 className={systemHealth.status === 'Warning' ? 'text-amber-500' : 'text-emerald-500'} />
                    </div>
                    <div className="p-4 rounded-2xl bg-slate-800/40 border border-white/5 flex items-center justify-between">
                        <div>
                            <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Capacity</p>
                            <p className="text-2xl font-black text-slate-200">
                                {Math.round(systemHealth.totalCapacityMinutes / 60)}h
                            </p>
                        </div>
                        <Clock className="text-slate-600" />
                    </div>
                    <div className="p-4 rounded-2xl bg-slate-800/40 border border-white/5 flex items-center justify-between">
                        <div>
                            <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">At Risk</p>
                            <p className="text-2xl font-black text-slate-200">
                                {systemHealth.atRiskAppointments?.length || 0}
                            </p>
                        </div>
                        <AlertTriangle className="text-slate-600" />
                    </div>
                </div>
            )}

            <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
                <div>
                    <h2 className="text-3xl font-heading font-bold text-white tracking-tight">Workload Balancer</h2>
                    <p className="text-slate-500 mt-1 font-medium">Smart distribution for team efficiency</p>
                </div>
                <div
                    onClick={() => setShowOnlineModal(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-slate-800/50 rounded-lg border border-white/5 cursor-pointer hover:bg-slate-800 hover:border-indigo-500/30 transition-all active:scale-95 select-none"
                >
                    <div className="flex -space-x-2">
                        {freeProviders.slice(0, 5).map((p, i) => (
                            <div key={i} className={`w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold border-2 border-slate-900 ${p.is_busy ? 'bg-amber-500 text-slate-900' : 'bg-indigo-500 text-white'}`} title={`${p.is_busy ? 'Busy' : 'Free'}: ${p.full_name} ${p.skills?.length ? `(${p.skills.join(',')})` : ''}`}>
                                {p.full_name?.charAt(0) || '?'}
                            </div>
                        ))}
                    </div>
                    <span className="text-xs font-bold text-slate-400 ml-2 flex items-center gap-2">
                        {freeProviders.length} Online
                        ({freeProviders.filter(p => !p.is_busy).length} Free)
                        {unreadCount > 0 && (
                            <span className="bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full animate-bounce shadow-lg shadow-red-500/50">
                                {unreadCount}
                            </span>
                        )}
                    </span>
                </div>
            </div>

            {/* System Capacity Dashboard */}
            {systemHealth && (
                <div className={`p-6 rounded-[2rem] border ${systemHealth.status === 'Critical' ? 'bg-red-500/10 border-red-500/30' : 'bg-slate-800/50 border-white/5'}`}>
                    <div className="flex flex-col md:flex-row justify-between items-end gap-6 mb-6">
                        <div>
                            <div className="flex items-center gap-3 mb-2">
                                <h3 className="text-xl font-bold text-white">Floor Capacity</h3>
                                <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest ${systemHealth.status === 'Critical' ? 'bg-red-500 text-white' :
                                    systemHealth.status === 'Warning' ? 'bg-amber-500 text-slate-900' :
                                        'bg-emerald-500 text-white'
                                    }`}>
                                    {systemHealth.status} ({systemHealth.loadPercentage}%)
                                </span>
                            </div>
                            <div className="w-64 h-2 bg-slate-700 rounded-full overflow-hidden">
                                <motion.div
                                    initial={{ width: 0 }}
                                    animate={{ width: `${Math.min(100, systemHealth.loadPercentage)}%` }}
                                    className={`h-full ${systemHealth.status === 'Critical' ? 'bg-red-500' :
                                        systemHealth.status === 'Warning' ? 'bg-amber-500' :
                                            'bg-emerald-500'
                                        }`}
                                />
                            </div>
                            <p className="text-xs text-slate-400 mt-2 font-mono">
                                LOAD: {systemHealth.totalLoadMinutes}m / CAP: {systemHealth.totalCapacityMinutes}m
                            </p>
                        </div>

                        {systemHealth.status === 'Critical' && (
                            <button
                                onClick={() => alert('SOS Feature: Detecting offline staff... (Connecting to WhatsApp)')}
                                className="bg-red-500 hover:bg-red-600 text-white font-bold py-2.5 px-6 rounded-xl flex items-center gap-2 shadow-lg shadow-red-500/20 active:scale-95 transition-all"
                            >
                                <AlertTriangle size={18} />
                                <span>SOS: Request Backup</span>
                            </button>
                        )}
                    </div>

                    {/* At Risk List (Future Problems Predicted NOW) */}
                    {systemHealth.atRiskAppointments?.length > 0 && (
                        <div className="space-y-3">
                            <h4 className="text-xs font-bold text-red-400 uppercase tracking-widest flex items-center gap-2">
                                <AlertTriangle size={12} />
                                {systemHealth.atRiskAppointments.length} Clients At Risk (Predicting Overtime)
                            </h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {systemHealth.atRiskAppointments.map(risk => (
                                    <div key={risk.id} className="bg-red-500/5 border border-red-500/10 p-3 rounded-xl flex justify-between items-center group hover:bg-red-500/10 transition-colors">
                                        <div>
                                            <p className="font-bold text-white text-sm">{risk.client?.first_name} {risk.client?.last_name}</p>
                                            <div className="flex flex-wrap gap-1 mt-1 mb-1">
                                                {risk.required_skills?.map((skill, si) => (
                                                    <span key={si} className="text-[8px] font-black text-red-300 bg-red-500/10 px-1.5 py-0.5 rounded border border-red-500/20 uppercase tracking-widest">
                                                        {skill}
                                                    </span>
                                                ))}
                                            </div>
                                            <p className="text-[10px] text-red-300">
                                                +{risk.excessMinutes}m Overtime • {risk.providerName}
                                            </p>
                                        </div>
                                        <button
                                            onClick={() => openActionModal(risk)}
                                            className="px-3 py-1.5 bg-red-500/10 hover:bg-red-500 text-red-400 hover:text-white text-xs font-bold rounded-lg transition-all border border-red-500/20"
                                        >
                                            Suggest Move
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {profile?.role?.toLowerCase() === 'admin' && suggestions.length > 0 && (
                <div className="glass-card border-none bg-indigo-500/10 border-indigo-500/20 p-8 rounded-[2rem] shadow-xl overflow-hidden relative group">
                    <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:scale-110 transition-transform">
                        <Sparkles size={120} className="text-indigo-400" />
                    </div>

                    <div className="relative z-10">
                        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-8">
                            <div className="flex items-center gap-4">
                                <div className="p-3 bg-indigo-500 rounded-2xl shadow-glow shadow-indigo-500/40">
                                    <Sparkles size={24} className="text-white animate-pulse" />
                                </div>
                                <div>
                                    <h3 className="text-2xl font-bold text-white tracking-tight">Smart Autopilot</h3>
                                    <p className="text-indigo-300/80 font-medium text-sm">Found {suggestions.length} optimal re-assignments to fix delays</p>
                                </div>
                            </div>
                            <button
                                onClick={approveAllSuggestions}
                                className="w-full md:w-auto bg-white text-indigo-600 hover:bg-indigo-50 px-8 py-3.5 rounded-2xl font-black text-sm transition-all shadow-xl active:scale-95 flex items-center justify-center gap-3 group/btn"
                            >
                                <CheckCircle2 size={18} />
                                Approve All Solutions
                                <ChevronRight size={16} className="group-hover:translate-x-1 transition-transform" />
                            </button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {suggestions.map(sug => (
                                <div key={sug.appointmentId} className="bg-white/5 border border-white/10 rounded-2xl p-4 flex justify-between items-center hover:bg-white/10 transition-colors">
                                    <div className="space-y-1">
                                        <h4 className="font-bold text-white text-sm">{sug.clientName}</h4>
                                        <p className="text-[10px] text-indigo-300 font-bold uppercase tracking-widest">
                                            {sug.currentProviderName} → {sug.newProviderName}
                                        </p>
                                    </div>
                                    <button
                                        onClick={() => approveSuggestion(sug)}
                                        className="p-2.5 bg-indigo-500/20 hover:bg-indigo-500 text-indigo-400 hover:text-white rounded-xl transition-all border border-indigo-500/30"
                                    >
                                        <CheckCircle2 size={16} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {profile?.role?.toLowerCase() === 'admin' && (
                <div className="flex bg-slate-800/40 p-1 rounded-2xl border border-white/5 w-fit">
                    <button
                        onClick={() => setGlobalView(false)}
                        className={`
                            flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all
                            ${!globalView ? 'bg-primary text-white shadow-lg' : 'text-slate-400 hover:text-white'}
                        `}
                    >
                        <User size={14} /> My Clients
                    </button>
                    <button
                        onClick={() => setGlobalView(true)}
                        className={`
                            flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all
                            ${globalView ? 'bg-indigo-500 text-white shadow-lg' : 'text-slate-400 hover:text-white'}
                        `}
                    >
                        <Globe size={14} /> Global Facility
                    </button>
                </div>
            )}

            {loading ? (
                <div className="flex flex-col items-center py-32 text-slate-500">
                    <Loader2 className="w-10 h-10 animate-spin mb-4 text-primary" />
                    <p className="font-medium animate-pulse">Analyzing system workload...</p>
                </div>
            ) : delayedApts.length === 0 ? (
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="glass-card border-none bg-gradient-to-br from-emerald-500/10 to-teal-500/10 border-emerald-500/20 p-12 rounded-[2.5rem] text-center"
                >
                    <div className="w-20 h-20 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto mb-6 shadow-glow shadow-emerald-500/20">
                        <CheckCircle2 size={40} className="text-emerald-400" />
                    </div>
                    <h3 className="text-2xl font-bold text-white mb-2">All Systems Operational</h3>
                    <p className="text-emerald-400/80 font-medium">No significant schedule delays detected across the facility.</p>
                </motion.div>
            ) : (
                <>
                    {/* FAIL-SAFE AUTOPILOT UI */}
                    {suggestions.length > 0 && (
                        <div className="p-1 rounded-[2.5rem] bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-500 animate-gradient-x shadow-2xl shadow-indigo-500/20 mb-10">
                            <div className="bg-slate-900/90 backdrop-blur-xl rounded-[2.4rem] p-8 relative overflow-hidden">
                                <div className="absolute top-0 right-0 p-32 bg-indigo-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />

                                <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-8">
                                    <div className="flex items-center gap-6">
                                        <div className="w-16 h-16 rounded-2xl bg-indigo-500 flex items-center justify-center text-white shadow-lg shadow-indigo-500/30">
                                            <Sparkles size={32} />
                                        </div>
                                        <div>
                                            <h3 className="text-2xl font-black text-white tracking-tight mb-1">
                                                Optimization Available
                                            </h3>
                                            <p className="text-slate-400 font-medium text-lg">
                                                Found <span className="text-white font-bold">{suggestions.length} delayed sessions</span> that can be rebalanced.
                                            </p>
                                        </div>
                                    </div>

                                    <button
                                        onClick={approveAllSuggestions}
                                        disabled={processing}
                                        className="group relative px-8 py-4 bg-white text-slate-900 rounded-2xl font-black text-lg tracking-tight hover:scale-105 active:scale-95 transition-all shadow-xl shadow-white/10 overflow-hidden"
                                    >
                                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-slate-200/50 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
                                        <span className="relative z-10 flex items-center gap-3">
                                            {processing ? <Loader2 className="animate-spin" /> : <Sparkles className="w-5 h-5" />}
                                            {processing ? 'Processing...' : 'AUTO-FIX SCHEDULE'}
                                        </span>
                                    </button>
                                </div>

                                {/* Preview of Fixes */}
                                <div className="mt-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {suggestions.slice(0, 3).map((sug, i) => (
                                        <div key={i} className="p-4 rounded-xl bg-white/5 border border-white/5 flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-[10px] text-slate-400 font-bold border border-white/10">
                                                    <ArrowLeftRight size={14} />
                                                </div>
                                                <div>
                                                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">{sug.clientName}</p>
                                                    <p className="text-sm font-bold text-slate-300">
                                                        {sug.treatmentName || 'Session'} • {sug.currentProviderName} <span className="text-slate-600">→</span> {sug.newProviderName}
                                                    </p>
                                                </div>
                                            </div>
                                            <span className="text-xs font-bold text-emerald-400">+{sug.delayMinutes}m Saved</span>
                                        </div>
                                    ))}
                                    {suggestions.length > 3 && (
                                        <div className="flex items-center justify-center text-sm font-bold text-slate-500">
                                            +{suggestions.length - 3} more optimizations
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Existing Cards (Manual Control) */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                        <AnimatePresence>
                            {delayedApts.map((apt, index) => (
                                <motion.div
                                    layout
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, scale: 0.9 }}
                                    transition={{ delay: index * 0.1 }}
                                    key={apt.id}
                                    className="glass-card p-0 overflow-hidden group relative"
                                >
                                    <div
                                        onClick={() => openActionModal(apt)}
                                        className="p-6 border-b border-white/5 bg-gradient-to-r from-red-500/5 to-transparent flex justify-between items-start cursor-pointer hover:bg-white/5 transition-colors"
                                    >
                                        <div className="flex items-center gap-4">
                                            <div className="w-12 h-12 rounded-2xl bg-red-500/10 flex items-center justify-center text-red-500 border border-red-500/20 shadow-glow shadow-red-500/10">
                                                <AlertTriangle size={24} />
                                            </div>
                                            <div>
                                                <h3 className="font-bold text-xl text-white">{apt.client?.first_name} {apt.client?.last_name}</h3>
                                                <div className="text-slate-400 text-sm font-medium flex items-center gap-2">
                                                    <Sparkles size={14} className="text-primary" />
                                                    {apt.treatment_name || 'Standard Session'}
                                                </div>
                                                <div className="text-slate-500 text-[10px] font-bold uppercase tracking-widest flex items-center gap-2 mt-1">
                                                    <UserCheck size={12} />
                                                    Assigned to {apt.profile?.full_name}
                                                    <div className={`w-1.5 h-1.5 rounded-full ${apt.profile?.is_online ? 'bg-emerald-500 shadow-[0_0_5px_rgba(16,185,129,0.5)]' : 'bg-slate-600'}`} title={apt.profile?.is_online ? 'Online' : 'Offline'} />
                                                </div>
                                            </div>
                                        </div>
                                        <div className="bg-red-500/10 text-red-400 px-3 py-1.5 rounded-lg text-xs font-bold border border-red-500/20 flex items-center gap-1.5">
                                            <Clock size={12} />
                                            {apt.delay_minutes}m Delay
                                        </div>
                                    </div>

                                    <div className="p-6 space-y-4">
                                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 ml-1">
                                            {apt.required_skills?.length > 0 ? `Qualified Reassignment (${(typeof apt.required_skills === 'string' ? [apt.required_skills] : apt.required_skills).join(', ')})` : 'Recommended Reassignment'}
                                        </p>
                                        <div className="space-y-3">
                                            {freeProviders.length === 0 ? (
                                                <div className="p-4 rounded-xl bg-slate-800/50 border border-white/5 text-center">
                                                    <p className="text-sm text-slate-500 italic">No free providers available at the moment.</p>
                                                </div>
                                            ) : (() => {
                                                const req = (typeof apt.required_skills === 'string' ? [apt.required_skills] : apt.required_skills) || [];
                                                const qualified = freeProviders.filter(provider => {
                                                    if (provider.id === apt.assigned_profile_id) return false;
                                                    if (req.length === 0) return true;
                                                    const pSkills = (provider.skills || []).map(s => typeof s === 'object' ? s.code : s);
                                                    return req.every(r => pSkills.includes(r));
                                                });

                                                if (qualified.length === 0) {
                                                    const offlineQualified = allProviders.filter(p => {
                                                        if (p.is_online) return false;
                                                        if (req.length === 0) return true;
                                                        const pSkills = (p.skills || []).map(s => typeof s === 'object' ? s.code : s);
                                                        return req.every(r => pSkills.includes(r));
                                                    });

                                                    return (
                                                        <div className="space-y-4">
                                                            <div className="p-4 rounded-xl bg-orange-500/5 border border-orange-500/20 text-center">
                                                                <p className="text-sm text-orange-400 font-medium">No qualified providers currently online for this treatment.</p>
                                                            </div>
                                                            {offlineQualified.length > 0 && (
                                                                <div className="bg-slate-900/40 rounded-xl border border-white/5 p-4 space-y-3">
                                                                    <div className="flex justify-between items-center">
                                                                        <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Qualified Offline Staff</h4>
                                                                        <button
                                                                            onClick={() => notifyAdminsOfOfflineProviders(apt, offlineQualified)}
                                                                            className="text-[10px] bg-red-500/10 hover:bg-red-500/20 text-red-400 px-2 py-1 rounded border border-red-500/20 transition-colors font-bold uppercase tracking-wider flex items-center gap-1"
                                                                        >
                                                                            <AlertTriangle size={10} /> Notify Admins
                                                                        </button>
                                                                    </div>
                                                                    <div className="space-y-2">
                                                                        {offlineQualified.map(p => (
                                                                            <div key={p.id} className="flex justify-between items-center text-xs">
                                                                                <span className="text-slate-300 font-medium">{p.full_name}</span>
                                                                                <span className="text-slate-500">{p.phone || 'No phone'}</span>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                }

                                                return qualified.map(provider => (
                                                    <div key={provider.id} className={`
                                                            flex justify-between items-center p-4 rounded-xl transition-all border group/provider
                                                            ${provider.is_online
                                                            ? 'bg-slate-800/40 hover:bg-slate-700/60 border-white/5'
                                                            : 'bg-slate-900/40 border-white/5 grayscale opacity-50'}
                                                        `}>
                                                        <div className="flex items-center gap-3">
                                                            <div className="relative">
                                                                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-sm font-bold shadow-lg">
                                                                    {provider.full_name.charAt(0)}
                                                                </div>
                                                                <div className={`
                                                                        absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-slate-900
                                                                        ${provider.is_online ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]' : 'bg-slate-600'}
                                                                    `} />
                                                            </div>
                                                            <div>
                                                                <div className="flex items-center gap-2">
                                                                    <h4 className="font-bold text-slate-200 text-sm">{provider.full_name}</h4>
                                                                    {!provider.is_online ? (
                                                                        <span className="text-[8px] font-black uppercase tracking-widest text-slate-500 bg-white/5 px-1.5 py-0.5 rounded border border-white/5">Away</span>
                                                                    ) : (
                                                                        <span className="text-[8px] font-black uppercase tracking-widest text-emerald-500 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/10 flex items-center gap-1">
                                                                            <CheckCircle2 size={8} /> Qualified Match
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                <span className="text-xs text-slate-500 font-medium">{provider.role}</span>
                                                            </div>
                                                        </div>
                                                        <button
                                                            onClick={() => shiftClient(apt.id, provider.id, apt.assigned_profile_id)}
                                                            disabled={!provider.is_online}
                                                            className={`
                                                                    text-xs px-4 py-2.5 rounded-lg font-bold flex items-center gap-2 transition-all active:scale-95
                                                                    ${provider.is_online
                                                                    ? 'bg-primary hover:bg-indigo-500 text-white shadow-lg shadow-primary/20 opacity-0 group-hover/provider:opacity-100 translate-x-2 group-hover/provider:translate-x-0'
                                                                    : 'bg-slate-800 text-slate-600 cursor-not-allowed'}
                                                                `}
                                                        >
                                                            <ArrowLeftRight size={14} />
                                                            {provider.is_online ? 'Assign' : 'Offline'}
                                                        </button>
                                                    </div>
                                                ));
                                            })()}
                                        </div>
                                    </div>
                                </motion.div>
                            ))}
                        </AnimatePresence>
                    </div>
                </>
            )}

            {/* Action Modal */}
            <AnimatePresence>
                {showActionModal && selectedAptForAction && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm"
                        onClick={() => setShowActionModal(false)}
                    >
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            onClick={e => e.stopPropagation()}
                            className="w-full max-w-sm bg-slate-900 border border-white/10 rounded-3xl shadow-2xl p-6"
                        >
                            <h3 className="text-xl font-bold text-white mb-1">Manage Appointment</h3>
                            <p className="text-slate-400 text-sm mb-1">
                                {selectedAptForAction.client?.first_name} {selectedAptForAction.client?.last_name}
                            </p>
                            <p className="text-primary text-[10px] font-black uppercase tracking-widest mb-6">
                                {selectedAptForAction.treatment_name || 'Standard Session'}
                            </p>

                            <div className="space-y-3">
                                <button
                                    onClick={() => {
                                        navigate(`/clients/${selectedAptForAction.client_id}`)
                                    }}
                                    className="w-full p-4 bg-slate-800 hover:bg-slate-700 rounded-2xl flex items-center justify-between text-white font-bold transition-colors group"
                                >
                                    <span>View Client Profile</span>
                                    <ChevronRight size={16} className="text-slate-500 group-hover:text-white" />
                                </button>

                                <button
                                    onClick={() => {
                                        setShowActionModal(false)
                                        setShowRescheduleModal(true)
                                    }}
                                    className="w-full p-4 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/20 rounded-2xl flex items-center justify-between text-indigo-400 font-bold transition-colors group"
                                >
                                    <span>Reschedule</span>
                                    <Clock size={16} />
                                </button>

                                <button
                                    onClick={handleDeleteAppointment}
                                    className="w-full p-4 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 rounded-2xl flex items-center justify-between text-red-400 font-bold transition-colors group mt-4"
                                >
                                    <span>Delete Appointment</span>
                                    <AlertTriangle size={16} />
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Reschedule Modal */}
            <AddAppointmentModal
                isOpen={showRescheduleModal}
                onClose={() => setShowRescheduleModal(false)}
                onRefresh={() => {
                    fetchData()
                    setShowRescheduleModal(false)
                }}
                editData={selectedAptForAction}
            />

            {/* ... Modal Logic ... */}

            <AnimatePresence>
                {/* Online Providers & Messaging Modal */}
                {showOnlineModal && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm"
                    // onClick={() => setShowOnlineModal(false)} // Remove backdrop click to be stricter? No, user wants exit button.
                    // User specifically asked for exit button. Keeping backdrop click is fine for standard UX, but let's focus on the prompt.
                    >
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            // onClick={e => e.stopPropagation()} // Keep this
                            className="w-full max-w-lg bg-slate-900 border border-white/10 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]"
                        >
                            {!selectedProvider ? (
                                <>
                                    <div className="p-6 border-b border-white/5 flex justify-between items-center bg-slate-800/50">
                                        <div>
                                            <h3 className="text-xl font-bold text-white">Online Providers</h3>
                                            <p className="text-slate-400 text-sm">Direct message team members</p>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => setShowOnlineModal(false)}
                                                className="px-3 py-1 bg-red-500/10 hover:bg-red-500 hover:text-white border border-red-500/20 text-red-400 rounded-lg text-xs font-bold transition-all"
                                            >
                                                EXIT
                                            </button>
                                        </div>
                                    </div>
                                    <div className="p-4 overflow-y-auto">
                                        {/* ... Provider List ... */}
                                        {freeProviders.filter(p => p.is_online && p.id !== user.id).length === 0 ? (
                                            //...
                                            <div className="text-center py-12 text-slate-500">
                                                <User size={48} className="mx-auto mb-4 opacity-20" />
                                                <p>No other providers are currently online.</p>
                                            </div>
                                        ) : (
                                            <div className="space-y-3">
                                                {freeProviders.filter(p => p.is_online && p.id !== user.id).map(provider => (
                                                    <div key={provider.id} className="grid grid-cols-12 items-center gap-4 p-4 bg-white/5 hover:bg-white/10 rounded-2xl transition-colors border border-white/5">
                                                        <div className="col-span-5 flex items-center gap-3 min-w-0">
                                                            {/* Provider Details */}
                                                            <div className="relative shrink-0">
                                                                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-lg shadow-lg">
                                                                    {provider.full_name.charAt(0)}
                                                                </div>
                                                                <div className={`absolute bottom-0 right-0 w-3.5 h-3.5 border-2 border-slate-900 rounded-full shadow-lg ${provider.is_busy ? 'bg-amber-500' : 'bg-emerald-500'}`}></div>
                                                            </div>
                                                            <div className="min-w-0 flex-1">
                                                                <h4 className="font-bold text-white truncate" title={provider.full_name}>{provider.full_name}</h4>
                                                                <p className="text-xs text-indigo-300 font-medium truncate">{provider.role}</p>
                                                            </div>
                                                        </div>

                                                        {/* Status Indicator Text */}
                                                        <div className="col-span-4 flex justify-center">
                                                            <span className={`text-[10px] font-black uppercase tracking-widest py-1.5 px-3 rounded-lg whitespace-nowrap ${provider.is_busy ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20' : 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'}`}>
                                                                {provider.is_busy ? 'CURRENTLY BUSY' : 'AVAILABLE'}
                                                            </span>
                                                        </div>

                                                        <div className="col-span-3 flex justify-end">
                                                            <button
                                                                onClick={() => startChat(provider)}
                                                                className="px-4 py-2 bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-bold rounded-xl transition-all shadow-lg active:scale-95 flex items-center gap-2 whitespace-nowrap"
                                                            >
                                                                <span>Message</span>
                                                                <ChevronRight size={16} />
                                                            </button>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </>
                            ) : (
                                <>
                                    <div className="p-4 border-b border-white/5 flex items-center gap-4 bg-indigo-900/20">
                                        <button
                                            onClick={() => setSelectedProvider(null)}
                                            className="p-2 hover:bg-white/5 rounded-full text-slate-400 hover:text-white transition-colors"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5" /><path d="M12 19l-7-7 7-7" /></svg>
                                        </button>
                                        <div className="flex-1">
                                            <h3 className="font-bold text-white flex items-center gap-2">
                                                {selectedProvider.full_name}
                                                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                                            </h3>
                                            <p className="text-[10px] text-indigo-300 font-medium flex items-center gap-1">
                                                <Clock size={10} />
                                                Messages expire in 120m
                                            </p>
                                        </div>
                                        <button
                                            onClick={() => setShowOnlineModal(false)}
                                            className="px-3 py-1 bg-red-500/10 hover:bg-red-500 hover:text-white border border-red-500/20 text-red-400 rounded-lg text-xs font-bold transition-all ml-2"
                                        >
                                            EXIT
                                        </button>
                                    </div>

                                    <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-950/30 flex flex-col max-h-[400px]">
                                        {/* IMPORTANT: Changed flex-col-reverse to flex-col for normal scrolling behavior with scrollToBottom */}
                                        {messages.length === 0 && (
                                            <div className="text-center py-8 text-slate-600 text-sm mt-auto">
                                                <p>Start a temporary conversation.</p>
                                                <p>Messages auto-delete after 2 hours.</p>
                                            </div>
                                        )}
                                        {/* Since we switched to flex-col (top-down), we need to display messages in standard order (oldest top, newest bottom). 
                                            The state `messages` has NEWEST first (from unshift/order desc). 
                                            So we should reverse it for display: `.slice().reverse()` gives Old -> New.
                                        */}
                                        {messages.slice().reverse().map((msg) => (
                                            <div key={msg.id} className={`flex ${msg.sender_id === user.id ? 'justify-end' : 'justify-start'}`}>
                                                <div className={`
                                                    max-w-[80%] p-3 rounded-2xl text-sm font-medium
                                                    ${msg.sender_id === user.id
                                                        ? 'bg-indigo-500 text-white rounded-tr-none'
                                                        : 'bg-slate-800 text-slate-200 rounded-tl-none border border-white/5'}
                                                `}>
                                                    {msg.content}
                                                    <div className={`text-[9px] mt-1 text-right flex items-center justify-end gap-1 ${msg.sender_id === user.id ? 'text-indigo-200' : 'text-slate-500'}`}>
                                                        {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                        {msg.sender_id === user.id && (
                                                            <span>
                                                                {msg.pending ? (
                                                                    // 1. Pending/Sent (Optimistic) -> 1 White Tick
                                                                    <Check size={14} className="text-slate-400" strokeWidth={2} />
                                                                ) : msg.is_read ? (
                                                                    // 3. Read -> 2 Green Ticks
                                                                    <CheckCheck size={14} className="text-green-400" strokeWidth={3} />
                                                                ) : (
                                                                    // 2. Delivered (In DB) -> 2 White Ticks
                                                                    <CheckCheck size={14} className="text-slate-400" strokeWidth={2} />
                                                                )}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                        <div ref={messagesEndRef} />
                                    </div>

                                    <div className="p-4 border-t border-white/5 bg-slate-800/50">
                                        <form
                                            onSubmit={(e) => {
                                                e.preventDefault();
                                                sendMessage();
                                            }}
                                            className="flex gap-2"
                                        >
                                            <input
                                                type="text"
                                                value={newMessage}
                                                onChange={e => setNewMessage(e.target.value)}
                                                placeholder="Type a disappearing message..."
                                                className="flex-1 bg-slate-900 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors"
                                                autoFocus
                                            />
                                            <button
                                                type="submit"
                                                disabled={!newMessage.trim()}
                                                className="bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed text-white p-2.5 rounded-xl transition-all shadow-lg active:scale-95"
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
                                            </button>
                                        </form>
                                    </div>
                                </>
                            )}
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    )
}

export default WorkloadBalancer
