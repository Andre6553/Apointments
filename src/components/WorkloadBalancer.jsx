import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { ArrowLeftRight, ArrowRightLeft, UserCheck, AlertTriangle, CheckCircle2, Clock, BarChart3, Loader2, Globe, User, Users, Sparkles, ChevronRight, Check, CheckCheck, Info, X, Target, Zap } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { format } from 'date-fns'
import { sendWhatsApp } from '../lib/notifications'
import { useAuth } from '../hooks/useAuth'
import { playNotificationSound } from '../utils/sound'
import { useNavigate } from 'react-router-dom'
import AddAppointmentModal from './AddAppointmentModal'
import { logEvent, logAppointment } from '../lib/logger'
import { checkActiveOverruns } from '../lib/delayEngine'

const WorkloadBalancer = ({ initialChatSender, onChatHandled, virtualAssistantEnabled }) => {
    const { user, profile } = useAuth()
    console.log('[WorkloadBalancer] Current User Email:', user?.email);

    const [delayedApts, setDelayedApts] = useState([])
    const [needsAttentionApts, setNeedsAttentionApts] = useState([])
    const [freeProviders, setFreeProviders] = useState([])
    const [allProviders, setAllProviders] = useState([])
    const [loading, setLoading] = useState(true)
    const [globalView, setGlobalView] = useState(profile?.role?.toLowerCase() === 'admin')
    const [suggestions, setSuggestions] = useState([])
    const [crisisPlans, setCrisisPlans] = useState([])
    const [systemHealth, setSystemHealth] = useState(null)
    const [processing, setProcessing] = useState(false)
    const [processingActions, setProcessingActions] = useState(new Set())
    const isFetchingRef = useRef(false)
    const debounceTimerRef = useRef(null)
    const cooldownActionsRef = useRef(new Set()) // Track recently moved IDs to prevent re-appearance
    const [cooldownTrigger, setCooldownTrigger] = useState(0) // Used to force re-render when cooldown changes
    const navigate = useNavigate()

    // Appointment Actions
    const [selectedAptForAction, setSelectedAptForAction] = useState(null)
    const [showActionModal, setShowActionModal] = useState(false)
    const [showRescheduleModal, setShowRescheduleModal] = useState(false)
    const [showCrisisInfo, setShowCrisisInfo] = useState(false)
    const [showAttentionInfo, setShowAttentionInfo] = useState(false)
    const [showAutopilotInfo, setShowAutopilotInfo] = useState(false)
    const [showOptimizationInfo, setShowOptimizationInfo] = useState(false)

    // Messaging State
    const [showOnlineModal, setShowOnlineModal] = useState(false)
    const [selectedProvider, setSelectedProvider] = useState(null)
    const [messages, setMessages] = useState([])
    const [newMessage, setNewMessage] = useState('')
    const [businessName, setBusinessName] = useState('Our Business')

    const [autoPilotStatus, setAutoPilotStatus] = useState(null); // { current, total, active: boolean }
    const [isAutoPiloting, setIsAutoPiloting] = useState(false);

    const processAllCrisisActions = async () => {
        if (isAutoPiloting) return;
        setIsAutoPiloting(true);

        // 1. Flatten all actions from all plans
        let allActions = [];
        crisisPlans.forEach(plan => {
            plan.recommendedActions.forEach(action => {
                allActions.push({ plan, action });
            });
        });

        // 2. Sort by Priority: Deferral (Purple) > Emergency (Red) > Load Shed (Amber)
        const getPriority = (item) => {
            if (item.action.type === 'DEFERRAL_RECOMMENDATION') return 0;
            if (item.action.reason?.includes('EMERGENCY')) return 1;
            return 2;
        };
        allActions.sort((a, b) => getPriority(a) - getPriority(b));

        setAutoPilotStatus({ current: 0, total: allActions.length, active: true });

        for (let i = 0; i < allActions.length; i++) {
            const { plan, action } = allActions[i];
            setAutoPilotStatus(prev => ({ ...prev, current: i + 1 }));

            try {
                if (action.type === 'DEFERRAL_RECOMMENDATION') {
                    await handleAutoPilotDeferral(plan, action);
                } else {
                    // Load Shed or Emergency Clear (both use handleCrisisAction logic)
                    await handleCrisisAction(plan, action, true); // Added 'isAuto' flag
                }
            } catch (err) {
                console.error(`[Auto-Pilot] Failed action ${i + 1}:`, err);
            }

            // Throttle: 3 seconds between actions
            if (i < allActions.length - 1) {
                await new Promise(r => setTimeout(r, 3000));
            }
        }

        setIsAutoPiloting(false);
        setAutoPilotStatus(null);
        fetchData(true); // Final refresh
    };

    const handleAutoPilotDeferral = async (plan, action) => {
        const appointmentId = action.appointment.id;
        if (processingActions.has(appointmentId)) return;

        setProcessingActions(prev => new Set(prev).add(appointmentId));
        cooldownActionsRef.current.add(appointmentId);

        try {
            const scheduledStart = action.suggestedDateRaw || new Date().toISOString(); // Fallback to now if raw date missing
            const appointmentData = {
                assigned_profile_id: plan.providerId,
                scheduled_start: scheduledStart,
                status: 'pending'
            };

            const { error, data: savedApt } = await supabase
                .from('appointments')
                .update(appointmentData)
                .eq('id', appointmentId)
                .select('*, client:clients(*)')
                .single();

            if (error) throw error;

            // Audit
            await logAppointment(
                { ...appointmentData, client: savedApt.client, treatment_name: action.appointment.treatment_name },
                { full_name: plan.providerName, id: plan.providerId },
                savedApt.client,
                profile,
                'UPDATE',
                { source: 'crisis_autopilot', reason: action.reason }
            );

            // WhatsApp Notifications (Client & Provider)
            try {
                const client = savedApt.client;
                const dateLabel = format(new Date(scheduledStart), 'EEEE, MMM do');
                const timeLabel = format(new Date(scheduledStart), 'HH:mm');
                const bizName = profile?.business_name || "the clinic";

                if (client?.phone) {
                    await sendWhatsApp(client.phone, `Hi ${client.first_name}, this is ${bizName}. Your appointment for ${action.appointment.treatment_name} has been rescheduled to ${dateLabel} at ${timeLabel} to help us manage a small delay. See you then!`);
                }

                const provider = allProviders.find(p => p.id === plan.providerId);
                if (provider?.whatsapp) {
                    await sendWhatsApp(provider.whatsapp, `[Auto-Pilot] Hi ${provider.full_name}, the session for ${client?.first_name} ${client?.last_name || ''} has been automatically moved to ${dateLabel} at ${timeLabel} to clear your current overload.`);
                }
            } catch (notiErr) {
                console.warn('[Auto-Pilot] Notification failed', notiErr);
            }

            // UI Feedback
            setCrisisPlans(prev => prev.map(p => ({
                ...p,
                recommendedActions: p.recommendedActions.filter(a => a.appointment.id !== appointmentId)
            })).filter(p => p.recommendedActions.length > 0));

        } catch (err) {
            console.error('[Auto-Pilot] Deferral failed', err);
        } finally {
            setProcessingActions(prev => {
                const next = new Set(prev);
                next.delete(appointmentId);
                return next;
            });
        }
    };

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
        if (isFetchingRef.current) return;
        isFetchingRef.current = true;

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

            // 1b. Fetch appointments that need attention (Admin only)
            if (profile?.role?.toLowerCase() === 'admin') {
                const { data: attentionApts } = await supabase
                    .from('appointments')
                    .select('*, client:clients(first_name, last_name, phone), profile:profiles!appointments_assigned_profile_id_fkey(full_name, id, is_online), shifted_from:profiles!appointments_shifted_from_id_fkey(full_name)')
                    .eq('requires_attention', true)
                    .eq('status', 'pending')
                    .order('scheduled_start', { ascending: true })

                setNeedsAttentionApts(attentionApts || [])
            }

            const { data: allProviders } = await supabase
                .from('profiles')
                .select('*')
                .eq('business_id', profile?.business_id)

            // 2b. Fetch today's working hours to determine scheduled availability (for Demo Mode)
            const dayOfWeek = new Date().getDay();
            const { data: todayHours } = await supabase
                .from('working_hours')
                .select('profile_id, is_active')
                .eq('day_of_week', dayOfWeek)
                .in('profile_id', allProviders?.map(p => p.id) || []);

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

                let isOnline = p.is_online;

                if (isStale) {
                    isOnline = false;
                }

                // VIRTUAL ASSISTANT LOGIC: Force online if they have a schedule today
                if (virtualAssistantEnabled) {
                    const schedule = todayHours?.find(h => h.profile_id === p.id);
                    const hasWorkToday = schedule ? schedule.is_active : null;

                    // If schedule is explicitly active, or if we are in demo mode and can't find schedule 
                    // (RLS might block providers from seeing others' schedules, so we fallback to assuming true for doctors in demo)
                    if (hasWorkToday === true || (hasWorkToday === null && (p.full_name?.startsWith('Dr.') || p.role === 'Provider'))) {
                        isOnline = true;
                    }
                }

                return { ...p, is_online: isOnline }
            }) || []

            // Filter out busy, but log who is busy
            // NEW: Don't filter out busy providers, just mark them so Admin can see them
            const free = providersWithHeartbeat.filter(p => p.is_online).map(p => {
                const isBusy = busyIds.includes(p.id);
                return {
                    ...p,
                    is_busy: isBusy
                };
            });

            console.log(`[Balancer] Online & Free Providers:`, free.map(f => f.full_name));
            setFreeProviders(free)
            setAllProviders(providersWithHeartbeat)

            // 3. Fetch Smart Recommendations (Autopilot) & Crisis Plans
            if (profile?.role?.toLowerCase() === 'admin' && profile?.business_id) {
                const { getSmartReassignments, analyzeSystemHealth, generateCrisisRecoveryPlan } = await import('../lib/balancerLogic')
                const [smart, health, crisis] = await Promise.all([
                    getSmartReassignments(profile.business_id, virtualAssistantEnabled),
                    analyzeSystemHealth(profile.business_id, virtualAssistantEnabled),
                    generateCrisisRecoveryPlan(profile.business_id)
                ])
                setSuggestions(smart.filter(s => !cooldownActionsRef.current.has(s.appointmentId)))
                setSystemHealth(health)
                // Filter crisis plans to remove any appointments currently in cooldown
                const filteredCrisis = (crisis || []).map(p => ({
                    ...p,
                    recommendedActions: p.recommendedActions.filter(a => !cooldownActionsRef.current.has(a.appointment.id))
                })).filter(p => p.recommendedActions.length > 0);
                setCrisisPlans(filteredCrisis)

                // 4. Fetch Business Name for Notifications
                const { data: bizData } = await supabase
                    .from('businesses')
                    .select('name')
                    .eq('id', profile.business_id)
                    .single()
                if (bizData) setBusinessName(bizData.name)
            }
        } catch (error) {
            console.error('Balancer Data Error:', error)
        } finally {
            setLoading(false)
            isFetchingRef.current = false;
        }
    }

    useEffect(() => {
        if (user && profile) {
            fetchData()

            // Proactive Monitor (Check for overrunning sessions every 60s)
            const overrunMonitor = setInterval(() => {
                console.log('[Balancer] Heartbeat: Checking for proactive overruns...');
                checkActiveOverruns();
            }, 60000);

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
                }, () => {
                    // DEBOUNCE: Ripple updates from DelayEngine can trigger dozens of events at once
                    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
                    debounceTimerRef.current = setTimeout(() => {
                        fetchData(true);
                    }, 1000); // 1s cooldown to let ripple settle
                })
                .subscribe()

            return () => {
                clearInterval(overrunMonitor);
                supabase.removeChannel(channel);
            }
        }
    }, [user, profile, globalView, virtualAssistantEnabled])

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

    const shiftClient = async (aptId, newProviderId, oldProviderId, isCrisis = false, fullApt = null, fullProvider = null) => {
        if (!isCrisis && !confirm('Shift this client to the new provider?')) return

        try {
            // Optimistic update for demo purposes
            setDelayedApts(prev => prev.filter(a => a.id !== aptId))

            const { error } = await supabase.rpc('reassign_appointment', {
                appt_id: aptId,
                new_provider_id: newProviderId,
                note_text: isCrisis ? 'Shifted via Crisis Load Shed' : 'Shifted via Workload Balancer',
                flag_attention: false // Clear attention flag on reassign
            });

            // Also remove from needs attention list
            setNeedsAttentionApts(prev => prev.filter(a => a.id !== aptId))

            if (!error) {
                // Log high-fidelity event with Skill Match verification
                const provider = fullProvider || freeProviders.find(p => p.id === newProviderId) || allProviders.find(p => p.id === newProviderId);
                const apt = fullApt || delayedApts.find(a => a.id === aptId);

                await logAppointment(apt || { id: aptId }, provider || { id: newProviderId }, null, profile, 'REASSIGN', {
                    previous_provider_id: oldProviderId,
                    trigger: isCrisis ? 'crisis_load_shed' : 'manual_balancer_shift',
                    skill_match: {
                        required: apt?.required_skills || [],
                        provider_skills: provider?.skills || []
                    }
                });

                // Trigger notification
                if (apt && provider) {
                    const clientName = `${apt.client?.first_name} ${apt.client?.last_name || ''}`.trim();
                    const bizName = businessName || "Our Business";
                    const startTime = format(new Date(apt.scheduled_start), 'HH:mm');

                    // 1. WhatsApp to Client
                    await sendWhatsApp(apt.client?.phone, `Hi ${clientName}, this is ${bizName}. To minimize your wait time, your session has been moved to ${provider.full_name} for ${startTime}. See you soon!`);

                    // 2. WhatsApp to New Provider
                    if (provider.phone || provider.whatsapp) {
                        await sendWhatsApp(provider.phone || provider.whatsapp, `[Reassignment] Hi ${provider.full_name}, ${clientName} has been shifted to your schedule at ${startTime}.`);
                    }

                    // 3. In-App Message to New Provider (Notify them in the app inbox)
                    await supabase.from('temporary_messages').insert({
                        sender_id: user.id,
                        receiver_id: newProviderId,
                        business_id: profile.business_id,
                        content: `[ALERT] ${clientName} has been shifted to your schedule for ${startTime}. (Reason: Workload Balance)`,
                        is_read: false
                    });

                    // 4. System Notification (Dashboard Bell + Alert)
                    await supabase.from('notifications').insert({
                        user_id: newProviderId,
                        type: 'transfer_request',
                        title: 'New Client Shifted',
                        message: `[Crisis Balance] ${clientName} shifted to your schedule for ${startTime}.`,
                        is_read: false,
                        data: {
                            appointment_id: apt.id,
                            sender_id: user.id,
                            old_provider_id: oldProviderId
                        }
                    });
                }

                if (!isCrisis) {
                    alert('Client successfully shifted and notified!');
                    fetchData(true) // Silent refresh
                }
            } else {
                throw error
            }
        } catch (error) {
            console.error('[Balancer] Shift failed:', error);
            if (error?.message?.includes('Appointment not found')) {
                console.log('[Balancer] Appointment missing (likely wiped). Silently aborting.');
                return;
            }
            alert('Action Failed: Could not process shift.');
        }
    }

    const approveSuggestion = async (sug, skipRefresh = false) => {
        if (processingActions.has(sug.appointmentId)) return;

        try {
            const { error } = await supabase.rpc('reassign_appointment', {
                appt_id: sug.appointmentId,
                new_provider_id: sug.newProviderId,
                note_text: 'Auto-pilot reassignment due to delay',
                flag_attention: false
            });

            // Also remove from needs attention list
            setNeedsAttentionApts(prev => prev.filter(a => a.id !== sug.appointmentId))

            if (error) throw error

            // Log high-fidelity event with Skill Match verification
            await logAppointment({ id: sug.appointmentId, treatment_name: sug.treatmentName }, { id: sug.newProviderId, full_name: sug.newProviderName }, null, profile, 'AUTO_REASSIGN', {
                previous_provider_id: sug.currentProviderId,
                trigger: 'autopilot_suggestion',
                delay_saved_min: sug.delayMinutes,
                skill_match: {
                    required: sug.required_skills || [],
                    provider_skills: sug.newProviderSkills || []
                }
            });

            // Notify Client & New Provider
            if (sug.newProviderWhatsapp) {
                await sendWhatsApp(sug.newProviderWhatsapp, `Hi ${sug.newProviderName}, you have a new appointment shifted to you: ${sug.clientName} at ${sug.scheduledTime}.`)
            }

            // Trigger feedback
            setSuggestions(prev => prev.filter(s => s.appointmentId !== sug.appointmentId))
            if (!skipRefresh) fetchData(true)
        } catch (err) {
            console.error('Failed to approve suggestion:', err)
            alert('Action failed. Check logs.')
        } finally {
            setProcessingActions(prev => {
                const next = new Set(prev);
                next.delete(sug.appointmentId);
                return next;
            });
        }
    }

    const approveAllSuggestions = async () => {
        if (!confirm(`Apply all ${suggestions.length} smart reassignments?`)) return
        setProcessing(true)
        try {
            // Process sequentially to avoid DB lock/contention issues
            for (const sug of suggestions) {
                await approveSuggestion(sug, true) // Skip individual refresh
            }
            alert('Autopilot complete: All suggested shifts applied!')
        } catch (e) {
            console.error('Bulk approve error:', e)
        } finally {
            setProcessing(false)
            fetchData(true) // Single refresh at the end
        }
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

            // Log high-fidelity event (replacing legacy audit table with the new hybrid system)
            await logAppointment(selectedAptForAction, null, null, profile, 'DELETE', {
                trigger: 'workload_balancer_cleanup',
                deleted_at: new Date().toISOString()
            });

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

    // Mark an attention-requiring appointment as handled
    const handleMarkAsHandled = async (aptId) => {
        try {
            await supabase
                .from('appointments')
                .update({ requires_attention: false })
                .eq('id', aptId)

            // Audit Logging
            try {
                const apt = [...delayedApts, ...needsAttentionApts].find(a => a.id === aptId);
                await logAppointment(
                    apt || { id: aptId },
                    apt?.provider || profile,
                    apt?.client,
                    profile,
                    'MARK_HANDLED',
                    { trigger: 'admin_manual_clear' }
                );
            } catch (logErr) {
                console.warn('[Balancer] Logging failed:', logErr);
            }

            setNeedsAttentionApts(prev => prev.filter(a => a.id !== aptId))
        } catch (err) {
            console.error('Failed to mark as handled:', err)
        }
    }

    // Auto-assign all needs-attention appointments to best available providers
    const [autoAssigning, setAutoAssigning] = useState(false)

    const handleAutoAssignAll = async () => {
        if (!confirm(`Auto-assign ${needsAttentionApts.length} appointment(s) to the soonest available providers with matching skills?`)) return

        setAutoAssigning(true)
        let successCount = 0

        // Fetch ALL providers in the organization (not just free ones)
        // Note: 'role' is usually in the subscriptions table, so we fetch everyone in the business
        const { data: allOrgProfiles, error: fetchError } = await supabase
            .from('profiles')
            .select(`
                id, 
                full_name, 
                skills, 
                is_online, 
                accepts_transfers, 
                whatsapp,
                subscription:subscriptions(role)
            `)
            .eq('business_id', profile?.business_id)

        if (fetchError) {
            console.error('[AutoAssign] Error fetching org providers:', fetchError)
            setAutoAssigning(false)
            alert('Failed to fetch providers: ' + fetchError.message)
            return
        }

        // Flatten roles and format providers
        const allOrgProviders = (allOrgProfiles || []).map(p => ({
            ...p,
            // Extract role from the latest subscription if available
            role: p.subscription?.[0]?.role || 'staff'
        }))

        console.log('[AutoAssign] Total providers in business:', allOrgProviders.length)

        for (const apt of needsAttentionApts) {
            try {
                // Find matching providers based on required skills
                const reqSkills = apt.required_skills || []

                // Filter ALL organization providers for skill match
                // Exclude: current assignee, original provider, providers who don't accept transfers
                const matchingProviders = allOrgProviders.filter(p => {
                    if (p.id === apt.assigned_profile_id) return false // Skip current assignee (admin)
                    if (p.id === apt.shifted_from_id) return false // Skip provider who caused transfer
                    if (!p.accepts_transfers) return false // Skip if Transfers Disabled

                    // Filter by role (staff, provider, or admin)
                    const allowedRoles = ['staff', 'provider', 'admin', 'manager', 'owner']
                    if (!allowedRoles.includes(p.role?.toLowerCase())) return false

                    if (reqSkills.length === 0) return true // No skills required

                    const providerSkills = (p.skills || []).map(s => typeof s === 'object' ? s.code : s)
                    return reqSkills.every(skill => providerSkills.includes(skill))
                })

                // SORT: Prioritize Online doctors
                const sortedMatches = [...matchingProviders].sort((a, b) => {
                    if (a.is_online && !b.is_online) return -1
                    if (!a.is_online && b.is_online) return 1
                    return 0
                })

                console.log(`[AutoAssign] ${apt.client?.first_name}: ${sortedMatches.length} matching providers (Online first: ${sortedMatches.map(p => `${p.full_name}${p.is_online ? ' (Online)' : ''}`).join(', ')}), Req. Skills:`, reqSkills)

                if (sortedMatches.length === 0) {
                    console.log(`[AutoAssign] No matching provider for ${apt.client?.first_name} with skills:`, reqSkills)
                    continue
                }

                // Pick the best available (Online first)
                const bestProvider = sortedMatches[0]

                // Reassign using RPC
                const { error } = await supabase.rpc('reassign_appointment', {
                    appt_id: apt.id,
                    new_provider_id: bestProvider.id,
                    note_text: `Auto-assigned to ${bestProvider.full_name} (skill match)`,
                    flag_attention: false // Clear the attention flag
                })

                if (!error) {
                    successCount++
                    console.log(`[AutoAssign] ${apt.client?.first_name} → ${bestProvider.full_name}`)

                    // Log the action
                    await logAppointment(apt, bestProvider, null, profile, 'AUTO_REASSIGN', {
                        previous_provider_id: apt.assigned_profile_id,
                        trigger: 'auto_assign_needs_attention',
                        skill_match: {
                            required: reqSkills,
                            provider_skills: bestProvider.skills || []
                        }
                    })

                    // Extract common details for notifications
                    const clientFullName = `${apt.client?.first_name || ''} ${apt.client?.last_name || ''}`.trim() || 'Valued Client'
                    const aptDate = format(new Date(apt.scheduled_start), 'EEEE, MMMM d')
                    const aptTime = format(new Date(apt.scheduled_start), 'HH:mm')
                    const duration = apt.duration_minutes || 30

                    // 1. Notify client via WhatsApp
                    if (apt.client?.phone) {
                        const clientMessage = `Hi ${apt.client.first_name || 'there'}, this is to inform you that your appointment has been reassigned to ${bestProvider.full_name}.\n\n📅 Date: ${aptDate}\n🕐 Time: ${aptTime}\n⏱️ Duration: ${duration} minutes\n\nIf you have any concerns or wish to reschedule, please contact our reception. We look forward to seeing you!`
                        await sendWhatsApp(apt.client.phone, clientMessage)
                    }

                    // 2. Notify receiving provider via WhatsApp and Internal Inbox
                    const providerMessage = `[Auto-Assignment] Hi ${bestProvider.full_name}, an appointment for ${clientFullName} has been auto-assigned to you.\n\n📅 Date: ${aptDate}\n🕐 Time: ${aptTime}\n⏱️ Duration: ${duration} minutes.\n\nThis was transferred due to a schedule change.`

                    if (bestProvider.whatsapp) {
                        await sendWhatsApp(bestProvider.whatsapp, providerMessage)
                    }

                    // Internal Inbox Message
                    await supabase.from('temporary_messages').insert({
                        sender_id: user.id,
                        receiver_id: bestProvider.id,
                        business_id: profile?.business_id,
                        content: providerMessage,
                        is_read: false
                    })
                }
            } catch (err) {
                console.error(`Failed to auto-assign ${apt.id}:`, err)
            }
        }

        setAutoAssigning(false)

        // Audit Logging
        try {
            await logEvent('balancer.auto_assign_all', {
                business_id: profile?.business_id,
                total_attempted: needsAttentionApts.length,
                success_count: successCount,
            }, {
                level: 'AUDIT',
                module: 'WorkloadBalancer',
                actor: { type: 'user', id: user.id, name: profile.full_name }
            });
        } catch (logErr) {
            console.warn('[Balancer] Bulk logging failed:', logErr);
        }

        alert(`Successfully auto-assigned ${successCount} of ${needsAttentionApts.length} appointments!`)
        fetchData() // Refresh data
    }

    // Crisis Handler
    const handleCrisisAction = async (plan, action, isAuto = false) => {
        if (processingActions.has(action.appointment.id)) return;

        // Add to Cooldown immediately
        cooldownActionsRef.current.add(action.appointment.id);

        setProcessingActions(prev => new Set(prev).add(action.appointment.id));

        try {
            if (action.type === 'TRANSFER_RECOMMENDATION') {
                // Find BEST capable provider (Online, Not Busy, Not Delayed)
                const reqSkills = action.appointment.required_skills || [];
                const capable = allProviders.filter(p => {
                    if (p.id === plan.providerId) return false;
                    const pSkills = (p.skills || []).map(s => typeof s === 'object' ? s.code : s);
                    return reqSkills.every(qs => pSkills.includes(qs));
                });

                // Ranking:
                // 1. Online + Not Busy + Not Delayed
                // 2. Online + Not Busy
                // 3. Online + Least Delayed
                // 4. Anyone Online
                const target = capable.find(p => p.is_online && !p.is_busy && !delayedApts.some(a => a.assigned_profile_id === p.id))
                    || capable.find(p => p.is_online && !p.is_busy)
                    || [...capable.filter(p => p.is_online)].sort((a, b) => {
                        const aDelay = delayedApts.find(apt => apt.assigned_profile_id === a.id)?.delay_minutes || 0;
                        const bDelay = delayedApts.find(apt => apt.assigned_profile_id === b.id)?.delay_minutes || 0;
                        return aDelay - bDelay;
                    })[0]
                    || capable.find(p => p.is_online)
                    || capable[0];

                if (!target) {
                    if (!isAuto) alert('CRISIS FAILED: No capable provider found to take this load.');
                    setProcessingActions(prev => {
                        const next = new Set(prev);
                        next.delete(action.appointment.id);
                        return next;
                    });
                    return;
                }

                // Atomic reassignment via RPC (Handles time-shifting and delay-reset internally)
                await shiftClient(action.appointment.id, target.id, plan.providerId, true, action.appointment, target);

                // Optimistic update for Crisis Plans (Global Clear)
                setCrisisPlans(prev => prev.map(p => ({
                    ...p,
                    recommendedActions: p.recommendedActions.filter(a => a.appointment.id !== action.appointment.id)
                })).filter(p => p.recommendedActions.length > 0));

                // Also clear from Autopilot suggestions if it exists there
                setSuggestions(prev => prev.filter(s => s.appointmentId !== action.appointment.id));

                // Extra Log with correct Actor
                await logEvent('crisis.load_shed', {
                    from: plan.providerName,
                    to: target.full_name,
                    minutes_saved: action.impact_score,
                    appointment_id: action.appointment.id,
                    business_id: profile?.business_id
                }, {
                    level: 'WARN',
                    actor: {
                        type: 'user',
                        id: profile?.id,
                        name: profile?.full_name,
                        role: profile?.role
                    }
                });

            } else if (action.type === 'DEFERRAL_RECOMMENDATION') {
                // Open Reschedule Modal for this specific client
                setSelectedAptForAction(action.appointment);
                setShowRescheduleModal(true);

                await logEvent('crisis.deferral_proposed', {
                    client: action.appointment.client?.first_name,
                    provider: plan.providerName
                }, { level: 'WARN' });
            }
        } catch (e) {
            console.error('Crisis Action Failed:', e);
            alert('Failed to execute crisis plan.');
        } finally {
            setProcessingActions(prev => {
                const next = new Set(prev);
                next.delete(action.appointment.id);
                return next;
            });
        }
    };

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

            // Log Telemetry
            await logEvent('chat.send', {
                receiver_id: selectedProvider.id,
                message_length: content.length,
                is_read_immediately: isReadImmediately
            }, {
                actor: { type: 'user', id: user.id, name: profile.full_name },
                context: { module: 'WorkloadBalancer', section: 'QuickChat' }
            });

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
            .in('role', ['Provider', 'Admin', 'Manager', 'Owner'])
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

        // Log Telemetry
        await logEvent('sos.alert', {
            sent_count: sentCount,
            system_load: systemHealth?.loadPercentage,
            reason: 'critical_capacity_overload'
        }, {
            level: 'WARN',
            actor: { type: 'user', id: user.id, name: profile.full_name },
            context: { module: 'WorkloadBalancer', section: 'SOS_Banner' }
        });
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
                                {(user?.email?.toLowerCase() === 'admin@demo.com' || profile?.role === 'admin') && (
                                    <button
                                        onClick={() => {
                                            const payload = JSON.stringify(systemHealth.atRiskAppointments || [], null, 2);
                                            navigator.clipboard.writeText(payload);
                                        }}
                                        className="ml-2 p-1.5 hover:bg-white/10 rounded-lg transition-colors text-slate-400 hover:text-white"
                                        title="Copy Data to JSON"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-copy"><rect width="14" height="14" x="8" y="8" rx="2" ry="2" /><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" /></svg>
                                    </button>
                                )}
                            </div>
                            <div className="w-full max-w-[256px] h-2 bg-slate-700 rounded-full overflow-hidden border border-white/5">
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
                                    <div key={risk.id} className={`p-3 rounded-xl flex justify-between items-center group transition-colors border ${risk.severity === 'critical' ? 'bg-purple-500/10 border-purple-500/30 hover:bg-purple-500/20' :
                                        risk.severity === 'warning' ? 'bg-amber-500/10 border-amber-500/30 hover:bg-amber-500/20' :
                                            'bg-red-500/5 border-red-500/10 hover:bg-red-500/10'
                                        }`}>
                                        <div>
                                            <p className="font-bold text-white text-sm flex items-center gap-2">
                                                {risk.client?.first_name} {risk.client?.last_name}
                                                {risk.severity === 'critical' && <span className="bg-purple-500 text-white text-[8px] px-1.5 py-0.5 rounded font-black uppercase">Reschedule Recommended</span>}
                                            </p>
                                            <div className="flex flex-wrap gap-1 mt-1 mb-1">
                                                {risk.required_skills?.map((skill, si) => (
                                                    <span key={si} className={`text-[8px] font-black px-1.5 py-0.5 rounded border uppercase tracking-widest ${risk.severity === 'critical' ? 'text-purple-300 bg-purple-500/10 border-purple-500/20' : 'text-red-300 bg-red-500/10 border-red-500/20'}`}>
                                                        {skill}
                                                    </span>
                                                ))}
                                            </div>
                                            <p className={`text-[10px] font-medium ${risk.severity === 'critical' ? 'text-purple-300' : 'text-red-300'}`}>
                                                {risk.severity === 'critical' ? 'WAIT TIME LIMIT REACHED (>120m)' : `+${risk.excessMinutes}m Overtime`} • {risk.providerName}
                                            </p>
                                        </div>
                                        <button
                                            onClick={() => {
                                                if (risk.severity === 'critical') {
                                                    setSelectedAptForAction(risk)
                                                    setShowRescheduleModal(true)
                                                } else {
                                                    openActionModal(risk)
                                                }
                                            }}
                                            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all border ${risk.severity === 'critical' ? 'bg-purple-500/10 hover:bg-purple-500 text-purple-400 hover:text-white border-purple-500/20' :
                                                'bg-red-500/10 hover:bg-red-500 text-red-400 hover:text-white border-red-500/20'
                                                }`}
                                        >
                                            {risk.recommendation || 'Suggest Move'}
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}



            {/* CRISIS MODE SECTION */}
            {
                crisisPlans.length > 0 && (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="mb-8"
                    >
                        <div className="rounded-[2rem] border border-red-500/30 bg-red-500/10 overflow-hidden relative">
                            <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 brightness-100 contrast-150 mix-blend-overlay"></div>
                            <div className="relative p-8">
                                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
                                    <div className="flex items-center gap-4">
                                        <div className="p-3 bg-red-500 rounded-2xl shadow-lg shadow-red-500/40 animate-pulse">
                                            <AlertTriangle className="text-white" size={24} strokeWidth={3} />
                                        </div>
                                        <div>
                                            <h2 className="text-2xl font-black text-white uppercase tracking-tight flex items-center gap-3">
                                                Crisis Mode Active
                                                <span className="text-xs bg-red-500 text-white px-2 py-0.5 rounded-full font-bold tracking-widest animate-pulse border border-white/20">LIVE</span>
                                                <button
                                                    onClick={() => setShowCrisisInfo(true)}
                                                    className="p-1.5 hover:bg-white/10 rounded-lg transition-colors text-red-200 hover:text-white"
                                                    title="Crisis Mode Logic Explained"
                                                >
                                                    <Info size={18} />
                                                </button>
                                            </h2>
                                            <p className="text-red-200 font-medium">Critical schedule delays detected. Immediate action recommended to prevent cascade failure.</p>
                                        </div>
                                    </div>

                                    {/* AUTO-PILOT BUTTON */}
                                    <div className="flex flex-col items-end gap-3">
                                        <button
                                            onClick={processAllCrisisActions}
                                            disabled={isAutoPiloting || processing}
                                            className={`px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-[0.2em] flex items-center gap-3 transition-all active:scale-95 shadow-2xl ${isAutoPiloting
                                                ? 'bg-slate-800 text-slate-500 border border-white/5 cursor-wait'
                                                : 'bg-white text-red-600 hover:bg-red-50 hover:text-red-700 shadow-white/10'
                                                }`}
                                        >
                                            {isAutoPiloting ? (
                                                <Loader2 size={16} className="animate-spin" />
                                            ) : (
                                                <Sparkles size={16} className="animate-bounce" />
                                            )}
                                            {isAutoPiloting ? 'Processing Queue...' : 'Auto-Resolve All'}
                                        </button>

                                        {isAutoPiloting && autoPilotStatus && (
                                            <div className="w-full max-w-[200px] space-y-2">
                                                <div className="flex justify-between text-[10px] font-bold text-red-200 uppercase tracking-widest">
                                                    <span>Progress</span>
                                                    <span>{autoPilotStatus.current} / {autoPilotStatus.total}</span>
                                                </div>
                                                <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden border border-white/5">
                                                    <motion.div
                                                        className="h-full bg-white shadow-[0_0_15px_rgba(255,255,255,0.5)]"
                                                        initial={{ width: 0 }}
                                                        animate={{ width: `${(autoPilotStatus.current / autoPilotStatus.total) * 100}%` }}
                                                    />
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    {crisisPlans.map((plan, idx) => (
                                        <div key={idx} className="bg-slate-900/80 backdrop-blur-md rounded-2xl p-6 border border-red-500/30 shadow-xl">
                                            <div className="flex justify-between items-start mb-6 border-b border-white/5 pb-4">
                                                <div>
                                                    <h3 className="font-bold text-xl text-white mb-1">{plan.providerName}</h3>
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-xs font-black uppercase tracking-widest text-red-400 bg-red-500/10 px-2 py-1 rounded border border-red-500/20">
                                                            {plan.delayMinutes > 120 ? 'CRITICAL DELAY (Exceeds 120m)' : `${plan.delayMinutes}m Delayed`}
                                                        </span>
                                                    </div>
                                                </div>
                                                <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center border border-red-500/20">
                                                    <Clock className="text-red-500" size={24} />
                                                </div>
                                            </div>

                                            <div className="space-y-4">
                                                {plan.recommendedActions.map((action, actionIdx) => {
                                                    const isEmergency = action.reason?.includes('EMERGENCY');
                                                    return (
                                                        <div key={actionIdx} className={`bg-slate-800/50 rounded-xl p-4 border transition-colors group ${isEmergency ? 'border-red-500/30 hover:border-red-500' : 'border-white/5 hover:border-red-500/30'}`}>
                                                            <div className="flex justify-between items-start gap-4 mb-3">
                                                                <div>
                                                                    <div className="flex items-center gap-2 mb-1.5">
                                                                        <span className={`text-[10px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded border ${isEmergency
                                                                            ? 'bg-red-500/10 text-red-500 border-red-500/20'
                                                                            : action.type === 'TRANSFER_RECOMMENDATION'
                                                                                ? 'bg-amber-500/10 text-amber-500 border-amber-500/20'
                                                                                : 'bg-purple-500/10 text-purple-500 border-purple-500/20'
                                                                            }`}>
                                                                            {isEmergency
                                                                                ? 'EMERGENCY CLEAR'
                                                                                : action.type === 'TRANSFER_RECOMMENDATION' ? 'Load Shed' : 'Deferral'
                                                                            }
                                                                        </span>
                                                                        <span className="text-sm font-bold text-white">
                                                                            {action.appointment.client.first_name} {action.appointment.client.last_name}
                                                                        </span>
                                                                    </div>
                                                                    <p className="text-xs text-slate-400 italic leading-tight">"{action.reason}"</p>
                                                                </div>
                                                                <div className="bg-slate-900 rounded-lg px-2.5 py-1.5 text-center min-w-[50px] border border-white/5">
                                                                    <span className={`block text-lg font-black leading-none ${isEmergency
                                                                        ? 'text-red-500'
                                                                        : action.type === 'TRANSFER_RECOMMENDATION' ? 'text-amber-500' : 'text-purple-500'
                                                                        }`}>
                                                                        {action.impact_score}
                                                                    </span>
                                                                    <span className="text-[8px] text-slate-500 font-bold uppercase tracking-tighter">Impact</span>
                                                                </div>
                                                            </div>

                                                            <button
                                                                onClick={() => handleCrisisAction(plan, action)}
                                                                disabled={processingActions.has(action.appointment.id)}
                                                                className={`w-full py-3 rounded-xl font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all active:scale-95 shadow-lg ${processingActions.has(action.appointment.id) ? 'bg-slate-700 text-slate-500' : isEmergency
                                                                    ? 'bg-red-500 hover:bg-red-400 text-white shadow-red-500/20'
                                                                    : action.type === 'TRANSFER_RECOMMENDATION'
                                                                        ? 'bg-amber-500 hover:bg-amber-400 text-slate-900 shadow-amber-500/20'
                                                                        : 'bg-purple-500 hover:bg-purple-400 text-white shadow-purple-500/20'
                                                                    }`}
                                                            >
                                                                {processingActions.has(action.appointment.id) ? (
                                                                    <Loader2 size={16} className="animate-spin" />
                                                                ) : action.type === 'TRANSFER_RECOMMENDATION' ? (
                                                                    <ArrowRightLeft size={16} />
                                                                ) : (
                                                                    <Clock size={16} />
                                                                )}
                                                                {processingActions.has(action.appointment.id)
                                                                    ? 'Processing...'
                                                                    : isEmergency ? 'Approve Clear' : (action.type === 'TRANSFER_RECOMMENDATION' ? 'Approve Transfer' : 'Approve Postpone')}
                                                            </button>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </motion.div>
                )
            }

            {/* NEEDS ATTENTION SECTION - Transferred from providers who changed hours */}
            {
                profile?.role?.toLowerCase() === 'admin' && needsAttentionApts.length > 0 && (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="glass-card border-none bg-amber-500/10 border-amber-500/20 p-8 rounded-[2rem] shadow-xl overflow-hidden relative"
                    >
                        <div className="absolute top-0 right-0 p-16 opacity-5">
                            <Users size={160} />
                        </div>

                        <div className="relative z-10">
                            <div className="flex items-center justify-between mb-6">
                                <div className="flex items-center gap-4">
                                    <div className="p-3 bg-amber-500 rounded-2xl shadow-glow shadow-amber-500/40">
                                        <AlertTriangle size={24} className="text-slate-900" />
                                    </div>
                                    <div>
                                        <h3 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
                                            Needs Your Attention
                                            <button
                                                onClick={() => setShowAttentionInfo(true)}
                                                className="p-1.5 hover:bg-white/10 rounded-lg transition-colors text-amber-200 hover:text-white"
                                                title="Needs Attention Logic Explained"
                                            >
                                                <Info size={18} />
                                            </button>
                                        </h3>
                                        <p className="text-amber-300/80 font-medium text-sm">
                                            {needsAttentionApts.length} appointment{needsAttentionApts.length !== 1 ? 's' : ''} transferred from providers who changed their working hours
                                        </p>
                                    </div>
                                </div>
                                <button
                                    onClick={handleAutoAssignAll}
                                    disabled={autoAssigning || freeProviders.filter(p => !p.is_busy).length === 0}
                                    className="px-5 py-2.5 bg-amber-500 hover:bg-amber-400 disabled:bg-slate-700 disabled:text-slate-500 text-slate-900 font-bold rounded-xl transition-all flex items-center gap-2 shadow-lg shadow-amber-500/20 text-sm"
                                >
                                    {autoAssigning ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                                    {autoAssigning ? 'Assigning...' : 'Auto-Assign All'}
                                </button>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {needsAttentionApts.map(apt => (
                                    <div key={apt.id} className="bg-white/5 border border-amber-500/20 rounded-2xl p-5 flex flex-col gap-3 hover:bg-amber-500/10 transition-colors group">
                                        <div className="flex justify-between items-start">
                                            <div className="flex items-center gap-3">
                                                <div className="w-11 h-11 rounded-xl bg-amber-500/20 flex items-center justify-center text-amber-400 font-bold text-lg">
                                                    {apt.client?.first_name?.charAt(0) || '?'}
                                                </div>
                                                <div>
                                                    <h4 className="font-bold text-white text-base">{apt.client?.first_name} {apt.client?.last_name}</h4>
                                                    <p className="text-xs text-slate-400">
                                                        {format(new Date(apt.scheduled_start), 'EEE, MMM d')} at {format(new Date(apt.scheduled_start), 'HH:mm')}
                                                    </p>
                                                </div>
                                            </div>
                                            <span className="px-2 py-1 bg-amber-500/20 text-amber-400 text-[9px] font-black uppercase tracking-widest rounded-md border border-amber-500/30">
                                                Reschedule
                                            </span>
                                        </div>

                                        {apt.shifted_from && (
                                            <p className="text-[10px] text-slate-500 font-medium italic">
                                                Transferred from: {apt.shifted_from.full_name}
                                            </p>
                                        )}

                                        <div className="flex gap-2 mt-auto pt-2">
                                            <button
                                                onClick={() => handleMarkAsHandled(apt.id)}
                                                className="flex-1 py-2 rounded-xl bg-emerald-500/10 hover:bg-emerald-500 text-emerald-400 hover:text-white text-xs font-bold border border-emerald-500/20 transition-all flex items-center justify-center gap-1.5"
                                            >
                                                <CheckCircle2 size={14} />
                                                Handled
                                            </button>
                                            <button
                                                onClick={() => openActionModal(apt)}
                                                className="flex-1 py-2 rounded-xl bg-amber-500/10 hover:bg-amber-500 text-amber-400 hover:text-slate-900 text-xs font-bold border border-amber-500/20 transition-all flex items-center justify-center gap-1.5"
                                            >
                                                <ArrowRightLeft size={14} />
                                                Reassign
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </motion.div>
                )
            }

            {
                profile?.role?.toLowerCase() === 'admin' && suggestions.length > 0 && (
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
                                        <h3 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
                                            Smart Autopilot
                                            <button
                                                onClick={() => setShowAutopilotInfo(true)}
                                                className="p-1.5 hover:bg-white/10 rounded-lg transition-colors text-indigo-300 hover:text-white"
                                                title="Smart Autopilot Logic Explained"
                                            >
                                                <Info size={18} />
                                            </button>
                                        </h3>
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
                )
            }

            {
                profile?.role?.toLowerCase() === 'admin' && (
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
                )
            }

            {
                loading ? (
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
                                                <h3 className="text-2xl font-black text-white tracking-tight mb-1 flex items-center gap-2">
                                                    Optimization Available
                                                    <button
                                                        onClick={() => setShowOptimizationInfo(true)}
                                                        className="p-1.5 hover:bg-white/10 rounded-lg transition-colors text-indigo-300 hover:text-white"
                                                        title="Optimization Logic Explained"
                                                    >
                                                        <Info size={18} />
                                                    </button>
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
                                                        if (!provider.accepts_transfers) return false; // Skip if Transfers Disabled
                                                        if (req.length === 0) return true;
                                                        const pSkills = (provider.skills || []).map(s => typeof s === 'object' ? s.code : s);
                                                        return req.every(r => pSkills.includes(r));
                                                    }).sort((a, b) => {
                                                        // LEAST LOADED FIRST
                                                        const loadA = systemHealth?.providerStats?.[a.id]?.loadPercent ?? 100;
                                                        const loadB = systemHealth?.providerStats?.[b.id]?.loadPercent ?? 100;
                                                        return loadA - loadB;
                                                    });

                                                    if (qualified.length === 0) {
                                                        const offlineQualified = allProviders.filter(p => {
                                                            if (p.is_online) return false;
                                                            if (!p.accepts_transfers) return false; // Skip if Transfers Disabled
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

                                                    return qualified.map((provider, qIdx) => (
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
                                                                            <div className="flex items-center gap-1.5">
                                                                                <span className="text-[8px] font-black uppercase tracking-widest text-emerald-500 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/10 flex items-center gap-1">
                                                                                    <CheckCircle2 size={8} /> Qualified Match
                                                                                </span>
                                                                                {qIdx === 0 && (systemHealth?.providerStats?.[provider.id]?.loadPercent < 100) && (
                                                                                    <span className="text-[8px] font-black uppercase tracking-widest text-purple-400 bg-purple-500/10 px-1.5 py-0.5 rounded border border-purple-500/20 shadow-[0_0_5px_rgba(168,85,247,0.3)] animate-pulse">
                                                                                        ⭐ Top Capacity
                                                                                    </span>
                                                                                )}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                    <div className="flex items-center gap-2 mt-0.5">
                                                                        <span className="text-xs text-slate-500 font-medium">{provider.role}</span>
                                                                        {systemHealth?.providerStats?.[provider.id] && (
                                                                            <span className={`text-[10px] font-bold ${systemHealth.providerStats[provider.id].loadPercent > 80 ? 'text-orange-400' : 'text-slate-400'}`}>
                                                                                • {systemHealth.providerStats[provider.id].loadPercent}% Load ({Math.round(systemHealth.providerStats[provider.id].freeMinutes)}m Free)
                                                                            </span>
                                                                        )}
                                                                    </div>
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
                                                                {qIdx === 0 && (systemHealth?.providerStats?.[provider.id]?.loadPercent < 100) ? <Zap size={14} /> : <ArrowLeftRight size={14} />}
                                                                {qIdx === 0 && (systemHealth?.providerStats?.[provider.id]?.loadPercent < 100) ? 'Fill Capacity' : (provider.is_online ? 'Assign' : 'Offline')}
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
                )
            }

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
                                        if (selectedAptForAction.client_id) {
                                            setShowActionModal(false)
                                            navigate(`/clients/${selectedAptForAction.client_id}`)
                                        } else {
                                            alert('Client ID not found for this appointment.')
                                        }
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

            {/* CRISIS INFO MODAL */}
            <AnimatePresence>
                {showCrisisInfo && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setShowCrisisInfo(false)}
                            className="absolute inset-0 bg-slate-900/90 backdrop-blur-xl"
                        />
                        <motion.div
                            initial={{ opacity: 0, scale: 0.9, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.9, y: 20 }}
                            className="relative w-full max-w-2xl bg-slate-900 border border-white/10 rounded-[2.5rem] shadow-2xl overflow-hidden"
                        >
                            <div className="absolute top-0 right-0 p-4 md:p-8">
                                <button
                                    onClick={() => setShowCrisisInfo(false)}
                                    className="p-2 md:p-3 bg-white/5 hover:bg-white/10 text-white rounded-xl md:rounded-2xl transition-all active:scale-95"
                                >
                                    <X size={20} className="md:w-6 md:h-6" />
                                </button>
                            </div>

                            <div className="p-6 md:p-12">
                                <div className="flex items-center gap-3 md:gap-4 mb-6 md:mb-8">
                                    <div className="p-2 md:p-3 bg-red-500 rounded-xl md:rounded-2xl shadow-lg shadow-red-500/20">
                                        <Info className="text-white w-6 h-6 md:w-8 md:h-8" />
                                    </div>
                                    <h2 className="text-2xl md:text-3xl font-black text-white tracking-tight">Crisis Mode Logic Explained</h2>
                                </div>

                                <div className="space-y-6 md:space-y-8 max-h-[70vh] md:max-h-[60vh] overflow-y-auto pr-2 md:pr-4 custom-scrollbar">
                                    <p className="text-slate-400 text-sm md:text-base font-medium leading-relaxed">
                                        The Crisis Mode Engine monitors the facility for critical schedule delays and automatically generates recovery plans using two primary strategies.
                                    </p>

                                    <div className="space-y-4 md:space-y-6 pb-4">
                                        {/* Strategy 1: Load Shedding */}
                                        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl md:rounded-2xl p-4 md:p-6 shadow-lg shadow-amber-500/5">
                                            <div className="flex items-center gap-3 mb-3 md:mb-4">
                                                <div className="p-1.5 md:p-2 bg-amber-500 rounded-lg text-slate-900 shadow-lg shadow-amber-500/20">
                                                    <ArrowRightLeft size={18} className="md:w-5 md:h-5" />
                                                </div>
                                                <h3 className="text-lg md:text-xl font-bold text-amber-500 uppercase tracking-tight">1. Load Shedding (Transfer)</h3>
                                            </div>
                                            <div className="space-y-2 md:space-y-4 text-slate-300 text-sm md:text-base">
                                                <p><span className="text-white font-bold opacity-70">Strategy:</span> "Move the work to someone else."</p>
                                                <p><span className="text-white font-bold opacity-70">When it happens:</span> When a provider is running late (usually {'>'} 45 mins), but there are other qualified doctors online with open gaps in their schedule.</p>
                                                <div className="bg-white/5 rounded-xl p-3 md:p-4 border border-white/5">
                                                    <p className="text-white font-black text-[10px] uppercase tracking-widest mb-2 text-amber-500/80">The Logic:</p>
                                                    <ul className="list-disc list-inside space-y-1 text-slate-400 text-xs md:text-sm font-medium">
                                                        <li>Reassigns to the <span className="text-white">Best Capable Provider</span> (Online, Not Busy, Least Delayed).</li>
                                                        <li>Prioritizes moving <span className="text-white">longer tasks first</span> to recover the most time for the queue.</li>
                                                    </ul>
                                                </div>
                                                <p className="text-amber-400/80 font-bold text-xs md:text-sm mt-3 md:mt-4 italic border-l-2 border-amber-500/30 pl-3">Goal: Balance the team's workload so that one person isn't drowned while others are sitting free.</p>
                                            </div>
                                        </div>

                                        {/* Strategy 2: Emergency Clearance */}
                                        <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-xl md:rounded-2xl p-4 md:p-6 shadow-lg shadow-indigo-500/5">
                                            <div className="flex items-center gap-3 mb-3 md:mb-4">
                                                <div className="p-1.5 md:p-2 bg-indigo-500 rounded-lg text-white shadow-lg shadow-indigo-500/20">
                                                    <Target size={18} className="md:w-5 md:h-5" />
                                                </div>
                                                <h3 className="text-lg md:text-xl font-bold text-indigo-400 uppercase tracking-tight">2. Emergency Clearance (Path Clearing)</h3>
                                            </div>
                                            <div className="space-y-2 md:space-y-4 text-slate-300 text-sm md:text-base">
                                                <p><span className="text-white font-bold opacity-70">Strategy:</span> "Clear the Path for Priority Care."</p>
                                                <p><span className="text-white font-bold opacity-70">When it happens:</span> When a high-priority session (Surgery, VIP, Critical) is at risk of delay due to general cluster workload.</p>
                                                <div className="bg-white/5 rounded-xl p-3 md:p-4 border border-white/5">
                                                    <p className="text-white font-black text-[10px] uppercase tracking-widest mb-2 text-indigo-400/80">The Logic:</p>
                                                    <ul className="list-disc list-inside space-y-1 text-slate-400 text-xs md:text-sm font-medium">
                                                        <li>Identifies all <span className="text-white">lower-priority tasks</span> sitting ahead of the priority session.</li>
                                                        <li>Agresively moves them to other providers to ensure the priority task starts on time.</li>
                                                    </ul>
                                                </div>
                                                <p className="text-indigo-400/80 font-bold text-xs md:text-sm mt-3 md:mt-4 italic border-l-2 border-indigo-500/30 pl-3">Goal: Ensure the "Critical Path" (e.g., Surgical Prep) proceeds without even 1 minute of delay.</p>
                                            </div>
                                        </div>

                                        {/* Strategy 3: Deferral */}
                                        <div className="bg-red-500/10 border border-red-500/20 rounded-xl md:rounded-2xl p-4 md:p-6 shadow-lg shadow-red-500/5">
                                            <div className="flex items-center gap-3 mb-3 md:mb-4">
                                                <div className="p-1.5 md:p-2 bg-red-500 rounded-lg text-white shadow-lg shadow-red-500/20">
                                                    <AlertTriangle size={18} className="md:w-5 md:h-5" />
                                                </div>
                                                <h3 className="text-lg md:text-xl font-bold text-red-500 uppercase tracking-tight">3. Deferral (Postpone)</h3>
                                            </div>
                                            <div className="space-y-2 md:space-y-4 text-slate-300 text-sm md:text-base">
                                                <p><span className="text-white font-bold opacity-70">Strategy:</span> "Push the work to a different day."</p>
                                                <p><span className="text-white font-bold opacity-70">When it happens:</span> The "Emergency Brake." Triggers when a provider is severely behind and <span className="text-white">nobody else on the team</span> has the capacity or skills to take over today.</p>
                                                <p><span className="text-white font-bold opacity-70">The Action:</span> Suggests rescheduling the client (usually the last in the queue) to a future date or the next available opening.</p>
                                                <p className="text-red-400/80 font-bold text-xs md:text-sm mt-3 md:mt-4 italic border-l-2 border-red-500/30 pl-3">Goal: Prevent a "death spiral" and ensure the rest of today's clients actually get seen.</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="mt-6 md:mt-10">
                                    <button
                                        onClick={() => setShowCrisisInfo(false)}
                                        className="w-full py-3 md:py-4 bg-white hover:bg-slate-100 text-slate-900 font-extrabold md:font-black rounded-xl md:rounded-2xl transition-all shadow-xl active:scale-95 flex items-center justify-center gap-2 text-sm md:text-base"
                                    >
                                        RETURN TO WORKLOAD
                                        <ArrowRightLeft size={18} />
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* NEEDS ATTENTION INFO MODAL */}
            <AnimatePresence>
                {showAttentionInfo && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setShowAttentionInfo(false)}
                            className="absolute inset-0 bg-slate-900/90 backdrop-blur-xl"
                        />
                        <motion.div
                            initial={{ opacity: 0, scale: 0.9, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.9, y: 20 }}
                            className="relative w-full max-w-2xl bg-slate-900 border border-amber-500/30 rounded-[2.5rem] shadow-2xl overflow-hidden"
                        >
                            <div className="absolute top-0 right-0 p-4 md:p-8">
                                <button
                                    onClick={() => setShowAttentionInfo(false)}
                                    className="p-2 md:p-3 bg-white/5 hover:bg-white/10 text-white rounded-xl md:rounded-2xl transition-all active:scale-95"
                                >
                                    <X size={20} className="md:w-6 md:h-6" />
                                </button>
                            </div>

                            <div className="p-6 md:p-12">
                                <div className="flex items-center gap-3 md:gap-4 mb-6 md:mb-8">
                                    <div className="p-2 md:p-3 bg-amber-500 rounded-xl md:rounded-2xl shadow-lg shadow-amber-500/20">
                                        <Info className="text-slate-900 w-6 h-6 md:w-8 md:h-8" />
                                    </div>
                                    <h2 className="text-2xl md:text-3xl font-black text-white tracking-tight">Schedule Alignment Explained</h2>
                                </div>

                                <div className="space-y-6 md:space-y-8 max-h-[70vh] md:max-h-[60vh] overflow-y-auto pr-2 md:pr-4 custom-scrollbar">
                                    <p className="text-slate-400 text-sm md:text-base font-medium leading-relaxed">
                                        The "Needs Your Attention" board tracks appointments that have been displaced due to changes in provider schedules.
                                    </p>

                                    <div className="space-y-4 md:space-y-6 pb-4">
                                        {/* Logic: Displacement */}
                                        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl md:rounded-2xl p-4 md:p-6 shadow-lg shadow-amber-500/5">
                                            <div className="flex items-center gap-3 mb-3 md:mb-4">
                                                <div className="p-1.5 md:p-2 bg-amber-500 rounded-lg text-slate-900 shadow-lg shadow-amber-500/20">
                                                    <Clock size={18} className="md:w-5 md:h-5" />
                                                </div>
                                                <h3 className="text-lg md:text-xl font-bold text-amber-500 uppercase tracking-tight">The Displacement Logic</h3>
                                            </div>
                                            <div className="space-y-2 md:space-y-4 text-slate-300 text-sm md:text-base">
                                                <p><span className="text-white font-bold opacity-70">Trigger:</span> When a doctor disables their working day or shifts their hours while they already had appointments booked.</p>
                                                <p><span className="text-white font-bold opacity-70">Impact:</span> To prevent appointments from "vanishing," the system automatically catches them and assigns them to the Admin pool for triage.</p>
                                                <div className="bg-white/5 rounded-xl p-3 md:p-4 border border-white/5">
                                                    <ul className="list-disc list-inside space-y-1 text-slate-400 text-xs md:text-sm font-medium">
                                                        <li>Ensures <span className="text-white">zero client loss</span> during schedule pivots.</li>
                                                        <li>Flags these sessions as <span className="text-white">requiring immediate attention</span>.</li>
                                                    </ul>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Logic: Resolution */}
                                        <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-xl md:rounded-2xl p-4 md:p-6 shadow-lg shadow-indigo-500/5">
                                            <div className="flex items-center gap-3 mb-3 md:mb-4">
                                                <div className="p-1.5 md:p-2 bg-indigo-500 rounded-lg text-white shadow-lg shadow-indigo-500/20">
                                                    <Sparkles size={18} className="md:w-5 md:h-5" />
                                                </div>
                                                <h3 className="text-lg md:text-xl font-bold text-indigo-400 uppercase tracking-tight">Resolution Tools</h3>
                                            </div>
                                            <div className="space-y-4 md:space-y-6 text-slate-300 text-sm md:text-base">
                                                <div className="border-l-2 border-indigo-500/30 pl-4">
                                                    <p className="font-bold text-white text-sm mb-1 uppercase tracking-wider">1. Auto-Assign All</p>
                                                    <p className="text-slate-400 text-xs md:text-sm">The smartest option. Scans all online providers for matching skills and available time slots to automatically rehome every displaced client.</p>
                                                </div>
                                                <div className="border-l-2 border-amber-500/30 pl-4">
                                                    <p className="font-bold text-white text-sm mb-1 uppercase tracking-wider">2. Manual Reassign</p>
                                                    <p className="text-slate-400 text-xs md:text-sm">Gives you full control. Pick a specific provider who you know can handle the session.</p>
                                                </div>
                                                <div className="border-l-2 border-emerald-500/30 pl-4">
                                                    <p className="font-bold text-white text-sm mb-1 uppercase tracking-wider">3. Mark as Handled</p>
                                                    <p className="text-slate-400 text-xs md:text-sm">Use this if you have manually rescheduled the client or resolved the conflict outside of the automated flow.</p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="mt-6 md:mt-10">
                                    <button
                                        onClick={() => setShowAttentionInfo(false)}
                                        className="w-full py-3 md:py-4 bg-white hover:bg-slate-100 text-slate-900 font-extrabold md:font-black rounded-xl md:rounded-2xl transition-all shadow-xl active:scale-95 flex items-center justify-center gap-2 text-sm md:text-base"
                                    >
                                        RETURN TO WORKLOAD
                                        <ArrowLeftRight size={18} />
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* AUTOPILOT INFO MODAL */}
            <AnimatePresence>
                {showAutopilotInfo && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setShowAutopilotInfo(false)}
                            className="absolute inset-0 bg-slate-900/90 backdrop-blur-xl"
                        />
                        <motion.div
                            initial={{ opacity: 0, scale: 0.9, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.9, y: 20 }}
                            className="relative w-full max-w-2xl bg-slate-900 border border-indigo-500/30 rounded-[2.5rem] shadow-2xl overflow-hidden"
                        >
                            <div className="absolute top-0 right-0 p-4 md:p-8">
                                <button
                                    onClick={() => setShowAutopilotInfo(false)}
                                    className="p-2 md:p-3 bg-white/5 hover:bg-white/10 text-white rounded-xl md:rounded-2xl transition-all active:scale-95"
                                >
                                    <X size={20} className="md:w-6 md:h-6" />
                                </button>
                            </div>

                            <div className="p-6 md:p-12">
                                <div className="flex items-center gap-3 md:gap-4 mb-6 md:mb-8">
                                    <div className="p-2 md:p-3 bg-indigo-500 rounded-xl md:rounded-2xl shadow-lg shadow-indigo-500/20">
                                        <Sparkles className="text-white w-6 h-6 md:w-8 md:h-8" />
                                    </div>
                                    <h2 className="text-2xl md:text-3xl font-black text-white tracking-tight">Autopilot Intelligence Explained</h2>
                                </div>

                                <div className="space-y-6 md:space-y-8 max-h-[70vh] md:max-h-[60vh] overflow-y-auto pr-2 md:pr-4 custom-scrollbar">
                                    <p className="text-slate-400 text-sm md:text-base font-medium leading-relaxed">
                                        The Smart Autopilot is a proactive optimization engine that identifies the most efficient way to clear schedule delays across the entire facility.
                                    </p>

                                    <div className="space-y-4 md:space-y-6 pb-4">
                                        {/* Logic: gap hunting */}
                                        <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-xl md:rounded-2xl p-4 md:p-6 shadow-lg shadow-indigo-500/5">
                                            <div className="flex items-center gap-3 mb-3 md:mb-4">
                                                <div className="p-1.5 md:p-2 bg-indigo-500 rounded-lg text-white shadow-lg shadow-indigo-500/20">
                                                    <Target size={18} className="md:w-5 md:h-5" />
                                                </div>
                                                <h3 className="text-lg md:text-xl font-bold text-indigo-400 uppercase tracking-tight">Proactive Gap Hunting</h3>
                                            </div>
                                            <div className="space-y-2 md:space-y-4 text-slate-300 text-sm md:text-base">
                                                <p><span className="text-white font-bold opacity-70">The Engine:</span> Continually monitors every provider's queue in real-time. It looks for "Air Pockets"—available time slots that are currently going unused.</p>
                                                <p><span className="text-white font-bold opacity-70">The Opportunity:</span> When it finds a pocket, it automatically identifies clients downstream who are suffering from delays and suggests moving them to the free staff.</p>
                                            </div>
                                        </div>

                                        {/* Logic: Smart matching */}
                                        <div className="bg-purple-500/10 border border-purple-500/20 rounded-xl md:rounded-2xl p-4 md:p-6 shadow-lg shadow-purple-500/5">
                                            <div className="flex items-center gap-3 mb-3 md:mb-4">
                                                <div className="p-1.5 md:p-2 bg-purple-500 rounded-lg text-white shadow-lg shadow-purple-500/20">
                                                    <Zap size={18} className="md:w-5 md:h-5" />
                                                </div>
                                                <h3 className="text-lg md:text-xl font-bold text-purple-400 uppercase tracking-tight">Multi-Factor Selection</h3>
                                            </div>
                                            <div className="space-y-4 md:space-y-6 text-slate-300 text-sm md:text-base">
                                                <div className="border-l-2 border-indigo-500/30 pl-4">
                                                    <p className="font-bold text-white text-sm mb-1 uppercase tracking-wider">Skill-Perfect Reassignments</p>
                                                    <p className="text-slate-400 text-xs md:text-sm">Never suggests a move unless the receiving provider has the exact skill set required for the specific treatment.</p>
                                                </div>
                                                <div className="border-l-2 border-purple-500/30 pl-4">
                                                    <p className="font-bold text-white text-sm mb-1 uppercase tracking-wider">Delay Minimization</p>
                                                    <p className="text-slate-400 text-xs md:text-sm">Calculates the total minutes saved facility-wide. It prioritizes "High Impact" moves that clear the most aggregate delay.</p>
                                                </div>
                                                <div className="border-l-2 border-emerald-500/30 pl-4">
                                                    <p className="font-bold text-white text-sm mb-1 uppercase tracking-wider">Available Capacity</p>
                                                    <p className="text-slate-400 text-xs md:text-sm">Sorts suggestions by "Top Capacity"—ensuring staff with the least workload are tapped first to balance the team's stress levels.</p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="mt-6 md:mt-10">
                                    <button
                                        onClick={() => setShowAutopilotInfo(false)}
                                        className="w-full py-3 md:py-4 bg-white hover:bg-slate-100 text-slate-900 font-extrabold md:font-black rounded-xl md:rounded-2xl transition-all shadow-xl active:scale-95 flex items-center justify-center gap-2 text-sm md:text-base"
                                    >
                                        RETURN TO WORKLOAD
                                        <ArrowRightLeft size={18} />
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
            {/* OPTIMIZATION INFO MODAL */}
            <AnimatePresence>
                {showOptimizationInfo && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setShowOptimizationInfo(false)}
                            className="absolute inset-0 bg-slate-900/90 backdrop-blur-xl"
                        />
                        <motion.div
                            initial={{ opacity: 0, scale: 0.9, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.9, y: 20 }}
                            className="relative w-full max-w-2xl bg-slate-900 border border-emerald-500/30 rounded-[2.5rem] shadow-2xl overflow-hidden"
                        >
                            <div className="absolute top-0 right-0 p-4 md:p-8">
                                <button
                                    onClick={() => setShowOptimizationInfo(false)}
                                    className="p-2 md:p-3 bg-white/5 hover:bg-white/10 text-white rounded-xl md:rounded-2xl transition-all active:scale-95"
                                >
                                    <X size={20} className="md:w-6 md:h-6" />
                                </button>
                            </div>

                            <div className="p-6 md:p-12">
                                <div className="flex items-center gap-3 md:gap-4 mb-6 md:mb-8">
                                    <div className="p-2 md:p-3 bg-emerald-500 rounded-xl md:rounded-2xl shadow-lg shadow-emerald-500/20">
                                        <Zap className="text-white w-6 h-6 md:w-8 md:h-8" />
                                    </div>
                                    <h2 className="text-2xl md:text-3xl font-black text-white tracking-tight">Delay Recovery Logic</h2>
                                </div>

                                <div className="space-y-6 md:space-y-8 max-h-[70vh] md:max-h-[60vh] overflow-y-auto pr-2 md:pr-4 custom-scrollbar">
                                    <p className="text-slate-400 text-sm md:text-base font-medium leading-relaxed">
                                        The <strong>Optimization Available</strong> dashboard is a tactical response unit that activates when the system detects active schedule overruns.
                                    </p>

                                    <div className="space-y-4 md:space-y-6 pb-4">
                                        {/* Logic: Delay Mitigation */}
                                        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl md:rounded-2xl p-4 md:p-6 shadow-lg shadow-emerald-500/5">
                                            <div className="flex items-center gap-3 mb-3 md:mb-4">
                                                <div className="p-1.5 md:p-2 bg-emerald-500 rounded-lg text-white shadow-lg shadow-emerald-500/20">
                                                    <Clock size={18} className="md:w-5 md:h-5" />
                                                </div>
                                                <h3 className="text-lg md:text-xl font-bold text-emerald-400 uppercase tracking-tight">Active Delay Mitigation</h3>
                                            </div>
                                            <div className="space-y-2 md:space-y-4 text-slate-300 text-sm md:text-base">
                                                <p><span className="text-white font-bold opacity-70">The Trigger:</span> This card only appears when one or more providers are running behind their scheduled finish times.</p>
                                                <p><span className="text-white font-bold opacity-70">The Logic:</span> It scans the entire facility for staff who are currently "Free" or "Available" and identifies the fastest way to move delayed clients to them.</p>
                                                <div className="bg-white/5 rounded-xl p-3 md:p-4 border border-white/5">
                                                    <ul className="list-disc list-inside space-y-1 text-slate-400 text-xs md:text-sm font-medium">
                                                        <li>Prioritizes <span className="text-white">"Minutes Saved"</span> to fix the biggest delays first.</li>
                                                        <li>Calculates the <span className="text-white">Total Facility Recovery</span> (aggregate time saved).</li>
                                                    </ul>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Logic: Selection Criteria */}
                                        <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-xl md:rounded-2xl p-4 md:p-6 shadow-lg shadow-indigo-500/5">
                                            <div className="flex items-center gap-3 mb-3 md:mb-4">
                                                <div className="p-1.5 md:p-2 bg-indigo-500 rounded-lg text-white shadow-lg shadow-indigo-500/20">
                                                    <Target size={18} className="md:w-5 md:h-5" />
                                                </div>
                                                <h3 className="text-lg md:text-xl font-bold text-indigo-400 uppercase tracking-tight">Selection Criteria</h3>
                                            </div>
                                            <div className="space-y-4 md:space-y-6 text-slate-300 text-sm md:text-base">
                                                <div className="border-l-2 border-emerald-500/30 pl-4">
                                                    <p className="font-bold text-white text-sm mb-1 uppercase tracking-wider">Tactical Skill Check</p>
                                                    <p className="text-slate-400 text-xs md:text-sm">Only suggests rebalancing if the receiving provider has a 100% skill-match for the delayed treatment.</p>
                                                </div>
                                                <div className="border-l-2 border-indigo-500/30 pl-4">
                                                    <p className="font-bold text-white text-sm mb-1 uppercase tracking-wider">Capacity Shielding</p>
                                                    <p className="text-slate-400 text-xs md:text-sm">Ensures that the providers receiving clinical shifts have enough remaining capacity today to handle the additional load without going into overtime themselves.</p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="mt-6 md:mt-10">
                                    <button
                                        onClick={() => setShowOptimizationInfo(false)}
                                        className="w-full py-3 md:py-4 bg-white hover:bg-slate-100 text-slate-900 font-extrabold md:font-black rounded-xl md:rounded-2xl transition-all shadow-xl active:scale-95 flex items-center justify-center gap-2 text-sm md:text-base"
                                    >
                                        RETURN TO WORKLOAD
                                        <ArrowRightLeft size={18} />
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div >
    )
}

export default WorkloadBalancer
