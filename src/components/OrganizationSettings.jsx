import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { Building2, Save, Users, Plus, Loader2, Trash2, ShieldCheck, Mail, CheckCircle2, Sparkles } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useToast } from '../contexts/ToastContext'
import EditStaffModal from './EditStaffModal'
import { getCache, setCache, CACHE_KEYS } from '../lib/cache'
import { getDemoStatus, seedBusinessSkills } from '../lib/demoSeeder'
import { sendWhatsApp } from '../lib/notifications'
import { format, addDays, isWithinInterval, parseISO, startOfDay, endOfDay } from 'date-fns'

const OrganizationSettings = () => {
    const { profile, fetchProfile } = useAuth()
    const [businessName, setBusinessName] = useState('')
    const [isUpdatingName, setIsUpdatingName] = useState(false)
    const [staff, setStaff] = useState(() => getCache(CACHE_KEYS.STAFF) || [])
    const [isLoadingStaff, setIsLoadingStaff] = useState(!getCache(CACHE_KEYS.STAFF))
    const [newStaffEmail, setNewStaffEmail] = useState('')
    const [isAddingStaff, setIsAddingStaff] = useState(false)
    const [transferFrom, setTransferFrom] = useState('')
    const [transferTo, setTransferTo] = useState('')
    const [isTransferring, setIsTransferring] = useState(false)
    const [selectedStaff, setSelectedStaff] = useState(null)
    const [isEditModalOpen, setIsEditModalOpen] = useState(false)
    const [skills, setSkills] = useState([])
    const [isLoadingSkills, setIsLoadingSkills] = useState(false)
    const [newSkillName, setNewSkillName] = useState('')
    const [newSkillCode, setNewSkillCode] = useState('')
    const [isAddingSkill, setIsAddingSkill] = useState(false)
    const [isSeedingDemo, setIsSeedingDemo] = useState(false)

    // --- WhatsApp Feature States ---
    const [reminderMessage, setReminderMessage] = useState(`Dear [Client Name] please remember your appointment on [Date] at [Time]\n\n‼️Please NOTE CANCELLATION less than 24 hours, FULL FEE will be charged.\n💅🏻EFT payments in Salon or Card machine. 3% yoco fee will be added\n💅🏻Please be on time\n💅🏻Please confirm`)
    const [targetStartDay, setTargetStartDay] = useState('Wednesday')
    const [targetEndDay, setTargetEndDay] = useState('Saturday')
    const [isSendingReminders, setIsSendingReminders] = useState(false)
    const [reminderStats, setReminderStats] = useState(null)

    const [broadcastMessage, setBroadcastMessage] = useState('')
    const [broadcastImage, setBroadcastImage] = useState(null)
    const [broadcastPreview, setBroadcastPreview] = useState(null)
    const [isSendingBroadcast, setIsSendingBroadcast] = useState(false)
    const [isUploading, setIsUploading] = useState(false)

    // Progress State
    const [reminderProgress, setReminderProgress] = useState(0)
    const [broadcastProgress, setBroadcastProgress] = useState(0)

    const showToast = useToast()
    const isDemoOn = getDemoStatus()

    const handleSeedDemoSkills = async () => {
        setIsSeedingDemo(true)
        try {
            await seedBusinessSkills(profile.business_id)
            showToast('Medical demo skills loaded', 'success')
            fetchSkills()
        } catch (err) {
            console.error('Error seeding demo skills:', err)
            showToast('Failed to load demo skills', 'error')
        } finally {
            setIsSeedingDemo(false)
        }
    }

    useEffect(() => {
        if (profile?.business?.name) {
            setBusinessName(profile.business.name)
        }
    }, [profile])

    useEffect(() => {
        if (profile?.business_id) {
            fetchStaff()
            fetchSkills()
            fetchWhatsAppSettings()
        }
    }, [profile?.business_id])

    const fetchWhatsAppSettings = async () => {
        try {
            const { data, error } = await supabase
                .from('business_settings')
                .select('whatsapp_reminder_template, whatsapp_reminder_start_day, whatsapp_reminder_end_day, whatsapp_broadcast_template')
                .eq('business_id', profile.business_id)
                .single()

            if (data) {
                if (data.whatsapp_reminder_template) setReminderMessage(data.whatsapp_reminder_template)
                if (data.whatsapp_reminder_start_day) setTargetStartDay(data.whatsapp_reminder_start_day)
                if (data.whatsapp_reminder_end_day) setTargetEndDay(data.whatsapp_reminder_end_day)
                if (data.whatsapp_broadcast_template) setBroadcastMessage(data.whatsapp_broadcast_template)
            }
        } catch (err) {
            console.error('Error fetching WhatsApp settings:', err)
        }
    }

    const fetchStaff = async () => {
        setIsLoadingStaff(true)
        try {
            const cached = getCache(CACHE_KEYS.STAFF);
            if (cached) setStaff(cached);

            const { data, error } = await supabase
                .from('profiles')
                .select('*')
                .eq('business_id', profile.business_id)

            if (error) throw error
            setStaff(data || [])
            setCache(CACHE_KEYS.STAFF, data || [])
        } catch (err) {
            console.error('Error fetching staff:', err)
        } finally {
            setIsLoadingStaff(false)
        }
    }

    const fetchSkills = async () => {
        setIsLoadingSkills(true)
        try {
            const { data, error } = await supabase
                .from('business_skills')
                .select('*')
                .eq('business_id', profile.business_id)
                .order('name')

            if (error) throw error
            setSkills(data || [])
        } catch (err) {
            console.error('Error fetching skills:', err)
        } finally {
            setIsLoadingSkills(false)
        }
    }

    const handleAddSkill = async (e) => {
        e.preventDefault()
        if (!newSkillName.trim() || !newSkillCode.trim()) return

        setIsAddingSkill(true)
        const code = newSkillCode.trim().toUpperCase()

        // 1. Check for duplicates locally first
        if (skills.some(s => s.code === code)) {
            showToast(`Sorry, the code "${code}" is already being used. Please create a unique code for each skill.`, 'error')
            setIsAddingSkill(false)
            return
        }

        try {
            const { error } = await supabase
                .from('business_skills')
                .insert({
                    business_id: profile.business_id,
                    name: newSkillName.trim(),
                    code: code
                })

            if (error) throw error
            showToast('Skill added successfully', 'success')
            setNewSkillName('')
            setNewSkillCode('')
            fetchSkills()
        } catch (err) {
            console.error('Error adding skill:', err)
            showToast('Failed to add skill', 'error')
        } finally {
            setIsAddingSkill(false)
        }
    }

    const removeSkill = async (skillId) => {
        if (!confirm('Are you sure you want to remove this skill? This might affect service requirements.')) return

        try {
            const { error } = await supabase
                .from('business_skills')
                .delete()
                .eq('id', skillId)

            if (error) throw error
            showToast('Skill removed', 'success')
            setSkills(prev => prev.filter(s => s.id !== skillId))
        } catch (err) {
            console.error('Error removing skill:', err)
            showToast('Failed to remove skill', 'error')
        }
    }

    const handleUpdateBusinessName = async (e) => {
        e.preventDefault()
        if (!profile?.business_id) return

        setIsUpdatingName(true)
        try {
            const { error } = await supabase
                .from('businesses')
                .update({ name: businessName })
                .eq('id', profile.business_id)

            if (error) throw error
            await fetchProfile(profile.id)
            showToast('Business name updated', 'success')
        } catch (err) {
            console.error('Error updating business:', err)
            showToast('Failed to update business name', 'error')
        } finally {
            setIsUpdatingName(false)
        }
    }

    const handleAddStaff = async (e) => {
        e.preventDefault()
        if (!newStaffEmail.trim()) return

        setIsAddingStaff(true)
        try {
            const { data: targetProfile, error: findError } = await supabase
                .rpc('find_profile_by_email', { email_query: newStaffEmail.trim() })

            if (findError || !targetProfile) {
                showToast('User not found. Ensure they have signed up first.', 'error')
                return
            }

            // 2. Update their business_id
            const { error: updateError } = await supabase
                .from('profiles')
                .update({ business_id: profile.business_id })
                .eq('id', targetProfile.id)

            if (updateError) throw updateError

            showToast(`${targetProfile.full_name} added to team`, 'success')
            setNewStaffEmail('')
            fetchStaff() // Will update cache
        } catch (err) {
            console.error('Error adding staff:', err)
            showToast('Failed to add staff member', 'error')
        } finally {
            setIsAddingStaff(false)
        }
    }

    const removeStaff = async (staffId) => {
        if (!confirm('Are you sure you want to remove this member from your organization?')) return

        try {
            const { error } = await supabase
                .from('profiles')
                .update({ business_id: null })
                .eq('id', staffId)

            if (error) throw error
            showToast('Staff member removed', 'success')

            // Optimistic update
            const newStaff = staff.filter(s => s.id !== staffId);
            setStaff(newStaff)
            setCache(CACHE_KEYS.STAFF, newStaff)
        } catch (err) {
            console.error('Error removing staff:', err)
            showToast('Failed to remove staff', 'error')
            fetchStaff() // Revert/Refresh on error
        }
    }

    const handleBulkTransfer = async () => {
        if (!transferFrom || !transferTo) {
            showToast('Please select both providers', 'error')
            return
        }
        if (transferFrom === transferTo) {
            showToast('Cannot transfer to the same provider', 'error')
            return
        }

        const fromName = staff.find(s => s.id === transferFrom)?.full_name || 'Source'
        const toName = staff.find(s => s.id === transferTo)?.full_name || 'Destination'

        if (!confirm(`Are you sure you want to transfer ALL clients from ${fromName} to ${toName}?`)) return

        setIsTransferring(true)
        try {
            // 1. Transfer Client Ownership
            const { error: clientError } = await supabase
                .from('clients')
                .update({ owner_id: transferTo })
                .eq('owner_id', transferFrom)
                .eq('business_id', profile.business_id)

            if (clientError) throw clientError

            // 2. Transfer all Appointments (Past and Future) to the new provider
            const { error: apptError } = await supabase
                .from('appointments')
                .update({ assigned_profile_id: transferTo })
                .eq('assigned_profile_id', transferFrom)
                .eq('business_id', profile.business_id)

            if (apptError) throw apptError

            showToast(`Transfer complete: Clients and Appointments moved`, 'success')
            setTransferFrom('')
            setTransferTo('')
            fetchStaff()
        } catch (err) {
            console.error('Transfer failed:', err)
            showToast('Transfer failed', 'error')
        } finally {
            setIsTransferring(false)
        }
    }

    // --- WhatsApp Logic ---

    const getNextDayOfWeek = (dayName) => {
        const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
        const dayIdx = days.indexOf(dayName.toLowerCase())
        if (dayIdx === -1) return null

        const today = new Date()
        const currentDay = today.getDay()
        let distance = dayIdx - currentDay

        // Fix: If today is the day we want, distance is 0. 
        // original logic: if (distance <= 0) distance += 7
        // valid logic: 
        // if user selects "Monday" and today is "Monday", do they mean TODAY or NEXT Monday?
        // Usually in a "Range" context (Monday to Friday), they mean the current upcoming week, including today.
        // So if distance < 0, add 7. If distance == 0, keep it 0 (Today).

        if (distance < 0) distance += 7
        return addDays(today, distance)
    }

    const handleSendReminders = async () => {
        if (!reminderMessage.trim()) {
            showToast('Please enter a message', 'error')
            return
        }

        // Calculate Target Date Range based on inputs
        // Logic: "On Monday (today), send for Wednesday -> Saturday"
        // This tool assumes "Today" is the trigger day, and we look for the *next* occurrence of StartDay and EndDay

        // However, the user asked for a selector.
        // Let's interpret: "Find appointments between Next [StartDay] and Next [EndDay]"

        let startDate, endDate

        if (targetStartDay === 'Today') {
            startDate = new Date()
        } else {
            startDate = getNextDayOfWeek(targetStartDay)
        }

        if (targetEndDay === 'Today') {
            endDate = new Date()
        } else {
            endDate = getNextDayOfWeek(targetEndDay)
        }

        // If end day is before start day in the week cycle, add 7 days to end date (wrap around)
        // But for simplicity, let's just trust getNextDayOfWeek returns the very next one.
        // If user says "Wed to Sat", and today is Mon: Wed is +2, Sat is +5. Range: Wed->Sat.
        // If user says "Sun to Tue", and today is Fri: Sun is +2, Tue is +4. Range: Sun->Tue.
        // Adjustment: if endDate < startDate, assumes endDate is the following week? 
        // Let's strictly follow the "Next Occurrence" logic for now, but sort them.

        let start = startDate < endDate ? startDate : endDate
        let end = startDate < endDate ? endDate : startDate

        // Actually, user likely means "Start Day" to "End Day" sequence. 
        // If Start=Wed, End=Sat -> Wed, Thu, Fri, Sat.
        if (endDate < startDate) {
            // If End is "earlier" in the week index but technically "next", we might need to push it a week if the intention was a span?
            // Simple approach: Use absolute dates.
            end = addDays(end, 7)
        }

        // Just ensure we cover the whole day
        const rangeStart = startOfDay(start).toISOString()
        const rangeEnd = endOfDay(end).toISOString()

        if (!confirm(`Send reminders to all appointments from ${format(start, 'MMM do')} to ${format(end, 'MMM do')}?`)) return

        setIsSendingReminders(true)
        setReminderStats(null)
        setReminderProgress(0)

        // Save Settings
        try {
            await supabase
                .from('business_settings')
                .upsert({
                    business_id: profile.business_id,
                    whatsapp_reminder_template: reminderMessage,
                    whatsapp_reminder_start_day: targetStartDay,
                    whatsapp_reminder_end_day: targetEndDay
                })
        } catch (err) {
            console.error('Failed to save settings:', err)
        }

        try {
            // 1. Fetch Appointments
            const { data: appointments, error } = await supabase
                .from('appointments')
                .select(`
                    id, scheduled_start,
                    client:clients(first_name, last_name, phone, whatsapp_opt_in),
                    provider:profiles!appointments_assigned_profile_id_fkey(full_name)
                `)
                .eq('business_id', profile.business_id)
                .eq('business_id', profile.business_id)
                .gte('scheduled_start', rangeStart)
                .lte('scheduled_start', rangeEnd)
                .in('status', ['pending', 'confirmed']) // Broaden status to include confirmed

            console.log('DEBUG Whatsapp Reminders:', {
                rangeStart,
                rangeEnd,
                business_id: profile.business_id,
                appointmentsFound: appointments?.length,
                error
            })

            if (error) throw error

            if (!appointments || appointments.length === 0) {
                showToast('No appointments found in this range', 'error')
                setIsSendingReminders(false)
                return
            }

            showToast(`Found ${appointments.length} clients. Sending reminders one by one...`, 'info')

            let sentCount = 0
            let failCount = 0

            // 2. Send Loop
            for (const apt of appointments) {
                if (!apt.client?.phone) continue

                // Templating
                let msg = reminderMessage
                    .replace(/\[Client Name\]/g, apt.client.first_name || 'Client')
                    .replace(/\[Date\]/g, format(new Date(apt.scheduled_start), 'MMM do'))
                    .replace(/\[Time\]/g, format(new Date(apt.scheduled_start), 'HH:mm'))
                    .replace(/\[Provider\]/g, apt.provider?.full_name || 'Us')

                // Send
                const res = await sendWhatsApp(apt.client.phone, msg)
                if (res.success) sentCount++
                else failCount++

                // Rate Limiting: 1.5s delay
                await new Promise(r => setTimeout(r, 1500))
            }

            showToast(`Sent ${sentCount} reminders (${failCount} failed)`, 'success')
            setReminderStats({ sent: sentCount, failed: failCount, total: appointments.length })

        } catch (err) {
            console.error('Reminder blast failed:', err)
            showToast('Failed to process reminders', 'error')
        } finally {
            setIsSendingReminders(false)
        }
    }

    const handleImageUpload = async (e) => {
        const file = e.target.files[0]
        if (!file) return

        if (file.size > 5 * 1024 * 1024) { // 5MB limit
            showToast('Image too large (Max 5MB)', 'error')
            return
        }

        const preview = URL.createObjectURL(file)
        setBroadcastPreview(preview)
        setBroadcastImage(file)
    }

    const handleSendBroadcast = async () => {
        if (!broadcastMessage.trim()) {
            showToast('Please enter a message', 'error')
            return
        }

        if (!confirm('This will send a message to ALL clients in your organization. Are you sure?')) return

        setIsSendingBroadcast(true)
        setIsUploading(true)
        setBroadcastProgress(0)
        let publicUrl = null

        // Save Template
        try {
            await supabase
                .from('business_settings')
                .upsert({
                    business_id: profile.business_id,
                    whatsapp_broadcast_template: broadcastMessage
                })
        } catch (err) {
            console.error('Failed to save broadcast template:', err)
        }

        try {
            // 1. Upload Image if exists
            if (broadcastImage) {
                const fileExt = broadcastImage.name.split('.').pop()
                const fileName = `${profile.business_id}/broadcast_${Date.now()}.${fileExt}`

                // Delete old ones? (Optional cleanup, but Storage is cheap-ish. Let's just upload new)
                // User asked: "current photo upload must delete the previouse upload"
                // detailed cleanup might be slow, let's just overwrite a "latest" file?
                // Or list and delete. 
                // Listing is safer to avoid stale files.

                const { data: listData } = await supabase.storage.from('organization-assets').list(profile.business_id)
                if (listData && listData.length > 0) {
                    const filesToRemove = listData.map(x => `${profile.business_id}/${x.name}`)
                    await supabase.storage.from('organization-assets').remove(filesToRemove)
                }

                const { error: uploadError } = await supabase.storage
                    .from('organization-assets')
                    .upload(fileName, broadcastImage, { upsert: true })

                if (uploadError) throw uploadError

                const { data: { publicUrl: url } } = supabase.storage
                    .from('organization-assets')
                    .getPublicUrl(fileName)

                publicUrl = url
            }
            setIsUploading(false)

            // 2. Fetch All Clients
            const { data: clients, error: clientError } = await supabase
                .from('clients')
                .select('id, first_name, phone')
                .eq('business_id', profile.business_id)

            if (clientError) throw clientError

            if (!clients || clients.length === 0) {
                showToast('No clients found', 'error')
                return
            }

            showToast(`Found ${clients.length} clients. Sending broadcast one by one...`, 'info')

            let sentCount = 0

            // 3. Send Loop
            for (const client of clients) {
                if (!client.phone) continue

                let msg = broadcastMessage
                    .replace(/\[Client Name\]/g, client.first_name || 'Client')

                await sendWhatsApp(client.phone, msg, publicUrl)
                sentCount++

                // Rate Limiting: 1.5s delay
                await new Promise(r => setTimeout(r, 1500))
            }

            showToast(`Broadcast sent to ${sentCount} clients`, 'success')
            setBroadcastMessage('')
            setBroadcastImage(null)
            setBroadcastPreview(null)

        } catch (err) {
            console.error('Broadcast failed:', err)
            showToast('Failed to send broadcast', 'error')
        } finally {
            setIsSendingBroadcast(false)
            setIsUploading(false)
        }
    }

    // Shared Busy State to prevent concurrency
    const isBusy = isSendingReminders || isSendingBroadcast

    return (
        <div className="max-w-4xl space-y-8 pb-12">
            <div>
                <h3 className="text-2xl font-bold text-white mb-1 font-heading">Organization Management</h3>
                <p className="text-slate-500 text-sm font-medium">Manage your business details and team members</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                {/* Business Info Section */}
                <div className="lg:col-span-12">
                    <div className="glass-card p-8 border-white/5 space-y-6">
                        <div className="flex items-center gap-4 mb-2">
                            <div className="p-3 rounded-2xl bg-rose-500/10 text-rose-400 border border-rose-500/20">
                                <Building2 size={24} />
                            </div>
                            <div>
                                <h4 className="font-bold text-white">Business Details</h4>
                                <p className="text-xs text-slate-500">Your organization's identity</p>
                            </div>
                        </div>

                        <form onSubmit={handleUpdateBusinessName} className="space-y-6">
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">Business Name</label>
                                <input
                                    type="text"
                                    value={businessName}
                                    onChange={(e) => setBusinessName(e.target.value)}
                                    className="glass-input h-14 w-full text-lg"
                                    placeholder="e.g. Rose's Nails"
                                    required
                                />
                            </div>
                            <button
                                type="submit"
                                disabled={isUpdatingName}
                                className="bg-primary hover:bg-indigo-600 px-10 py-4 rounded-2xl font-bold flex items-center gap-2 transition-all shadow-lg shadow-primary/20 active:scale-95"
                            >
                                {isUpdatingName ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                                <span>Save Changes</span>
                            </button>
                        </form>
                    </div>
                </div>

                {/* Team Management Section */}
                <div className="lg:col-span-12">
                    <div className="glass-card p-8 border-white/5 space-y-8">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <div className="p-3 rounded-2xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                                    <Users size={24} />
                                </div>
                                <div>
                                    <h4 className="font-bold text-white">Team Members</h4>
                                    <p className="text-xs text-slate-500">Manage who has access to your business</p>
                                </div>
                            </div>
                        </div>

                        {/* Add Staff Form */}
                        <form onSubmit={handleAddStaff} className="bg-white/[0.02] border border-white/5 p-6 rounded-2xl space-y-6">
                            <div className="space-y-2">
                                <div className="flex items-center gap-3 text-slate-400 mb-2 ml-1">
                                    <Mail size={16} />
                                    <span className="text-xs font-bold uppercase tracking-widest">Add Provider by Email</span>
                                </div>
                                <input
                                    type="email"
                                    value={newStaffEmail}
                                    onChange={(e) => setNewStaffEmail(e.target.value)}
                                    className="glass-input h-14 w-full text-lg"
                                    placeholder="Enter colleague's email..."
                                    required
                                />
                            </div>
                            <button
                                type="submit"
                                disabled={isAddingStaff}
                                className="bg-emerald-500 hover:bg-emerald-600 px-10 py-4 rounded-2xl font-bold flex items-center gap-2 transition-all shadow-lg shadow-emerald-500/20 active:scale-95 text-white"
                            >
                                {isAddingStaff ? <Loader2 size={18} className="animate-spin" /> : <Plus size={18} />}
                                <span>Add to Team</span>
                            </button>
                        </form>

                        {/* Staff List */}
                        <div className="space-y-3">
                            {isLoadingStaff ? (
                                <div className="py-12 flex flex-col items-center gap-4 text-slate-500">
                                    <Loader2 className="animate-spin text-primary" size={32} />
                                    <p className="text-xs font-bold uppercase tracking-widest">Loading Team...</p>
                                </div>
                            ) : staff.length === 0 ? (
                                <div className="py-12 text-center text-slate-500 border border-dashed border-white/10 rounded-2xl">
                                    No other providers linked yet. Add them by email above!
                                </div>
                            ) : (
                                staff.map((member) => (
                                    <div
                                        key={member.id}
                                        onClick={() => {
                                            setSelectedStaff(member)
                                            setIsEditModalOpen(true)
                                        }}
                                        className="group flex items-center justify-between p-4 rounded-xl bg-white/[0.02] border border-white/5 hover:bg-white/[0.04] transition-all cursor-pointer"
                                    >
                                        <div className="flex items-center gap-4">
                                            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500/20 to-transparent flex items-center justify-center text-indigo-400 font-bold border border-white/5">
                                                {member.full_name?.[0] || 'U'}
                                            </div>
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <p className="font-bold text-white">{member.full_name}</p>
                                                    {member.role === 'Admin' && (
                                                        <span className="bg-primary/20 text-primary text-[8px] font-black uppercase tracking-tighter px-1.5 py-0.5 rounded border border-primary/20">Admin</span>
                                                    )}
                                                </div>
                                                <p className="text-xs text-slate-500">{member.email}</p>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-2">
                                            {/* Don't allow removing yourself */}
                                            {member.id !== profile?.id && (
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation()
                                                        removeStaff(member.id)
                                                    }}
                                                    className="p-2.5 text-slate-500 hover:text-rose-400 opacity-0 group-hover:opacity-100 transition-all rounded-xl hover:bg-rose-500/10"
                                                    title="Remove from organization"
                                                >
                                                    <Trash2 size={18} />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>

                {/* Business Skills Section */}
                <div className="lg:col-span-12">
                    <div className="glass-card p-8 border-white/5 space-y-8">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <div className="p-3 rounded-2xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
                                    <Sparkles size={24} />
                                </div>
                                <div>
                                    <h4 className="font-bold text-white">Business Skills</h4>
                                    <p className="text-xs text-slate-500">Global skills available to assign to providers</p>
                                </div>
                            </div>

                            {/* Demo Quick Fill (Exclusively for admin@demo.com) */}
                            {profile?.email === 'admin@demo.com' && isDemoOn && (
                                <button
                                    onClick={handleSeedDemoSkills}
                                    disabled={isSeedingDemo}
                                    className="px-4 py-2 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-[10px] font-black uppercase tracking-widest hover:bg-indigo-500/20 transition-all flex items-center gap-2"
                                >
                                    {isSeedingDemo ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                                    Quick Fill Medical Skills
                                </button>
                            )}
                        </div>

                        {/* Add Skill Form */}
                        <form onSubmit={handleAddSkill} className="bg-white/[0.02] border border-white/5 p-6 rounded-2xl space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">Skill Name</label>
                                    <input
                                        type="text"
                                        value={newSkillName}
                                        onChange={(e) => setNewSkillName(e.target.value)}
                                        className="glass-input h-14 w-full text-lg"
                                        placeholder="e.g. Botox Specialist"
                                        required
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">Internal Code</label>
                                    <input
                                        type="text"
                                        value={newSkillCode}
                                        onChange={(e) => setNewSkillCode(e.target.value)}
                                        className="glass-input h-14 w-full text-lg"
                                        placeholder="e.g. BTX"
                                        required
                                    />
                                </div>
                            </div>
                            <button
                                type="submit"
                                disabled={isAddingSkill}
                                className="bg-primary hover:bg-indigo-600 px-10 py-4 rounded-2xl font-bold flex items-center gap-2 transition-all shadow-lg shadow-primary/20 active:scale-95 text-white"
                            >
                                {isAddingSkill ? <Loader2 size={18} className="animate-spin" /> : <Plus size={18} />}
                                <span>Register Skill</span>
                            </button>
                        </form>

                        {/* Skills List */}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                            {isLoadingSkills ? (
                                <div className="col-span-full py-12 flex flex-col items-center gap-4 text-slate-500">
                                    <Loader2 className="animate-spin text-primary" size={32} />
                                    <p className="text-xs font-bold uppercase tracking-widest">Loading Skills...</p>
                                </div>
                            ) : skills.length === 0 ? (
                                <div className="col-span-full py-12 text-center text-slate-500 border border-dashed border-white/10 rounded-2xl">
                                    No global skills defined yet. Add your first one above!
                                </div>
                            ) : (
                                skills.map((skill) => (
                                    <div
                                        key={skill.id}
                                        className="group flex items-center justify-between p-4 rounded-xl bg-white/[0.02] border border-white/5 hover:bg-white/[0.04] transition-all"
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary font-bold text-xs">
                                                {skill.code}
                                            </div>
                                            <div>
                                                <p className="font-bold text-white text-sm">{skill.name}</p>
                                                <p className="text-[10px] text-slate-500 font-medium uppercase tracking-wider">{skill.code}</p>
                                            </div>
                                        </div>

                                        <button
                                            onClick={() => removeSkill(skill.id)}
                                            className="p-2 text-slate-500 hover:text-rose-400 opacity-0 group-hover:opacity-100 transition-all rounded-lg hover:bg-rose-500/10"
                                            title="Delete skill"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>

                {/* Client Transfer Section */}
                <div className="lg:col-span-12">
                    <div className="glass-card p-8 border-white/5 space-y-6 bg-amber-500/5">
                        <div className="flex items-center gap-4">
                            <div className="p-3 rounded-2xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
                                <ShieldCheck size={24} />
                            </div>
                            <div>
                                <h4 className="font-bold text-white">Client Continuity</h4>
                                <p className="text-xs text-slate-500">Bulk transfer clients between team members (e.g. if a provider leaves)</p>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-end">
                            <div className="space-y-2">
                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Transfer From</label>
                                <select
                                    className="glass-input h-12 w-full text-sm"
                                    value={transferFrom}
                                    onChange={(e) => setTransferFrom(e.target.value)}
                                >
                                    <option value="" className="bg-surface">Select Provider...</option>
                                    {staff.map(s => (
                                        <option key={s.id} value={s.id} className="bg-surface">
                                            {s.full_name} ({s.role})
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="space-y-2">
                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Transfer To</label>
                                <select
                                    className="glass-input h-12 w-full text-sm"
                                    value={transferTo}
                                    onChange={(e) => setTransferTo(e.target.value)}
                                >
                                    <option value="" className="bg-surface">Select Provider...</option>
                                    {staff.map(s => (
                                        <option key={s.id} value={s.id} className="bg-surface">
                                            {s.full_name} ({s.role})
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <button
                                onClick={handleBulkTransfer}
                                disabled={isTransferring || !transferFrom || !transferTo}
                                className="h-12 bg-amber-500 hover:bg-amber-600 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                            >
                                {isTransferring ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle2 size={18} />}
                                <span>Execute Transfer</span>
                            </button>
                        </div>
                    </div>
                </div>

                {/* WhatsApp Automation Section */}
                <div className="lg:col-span-12">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

                        {/* 1. Appointment Reminders */}
                        <div className="glass-card p-8 border-white/5 space-y-6">
                            <div className="flex items-center gap-4">
                                <div className="p-3 rounded-2xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                    <Mail size={24} />
                                </div>
                                <div>
                                    <h4 className="font-bold text-white">Smart Reminders</h4>
                                    <p className="text-xs text-slate-500">Bulk send reminders for a specific date range</p>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">From Day</label>
                                        <select
                                            value={targetStartDay}
                                            onChange={(e) => setTargetStartDay(e.target.value)}
                                            className="glass-input h-12 w-full text-sm bg-surface"
                                            disabled={isBusy}
                                        >
                                            {['Today', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map(d => (
                                                <option key={d} value={d}>{d}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">To Day</label>
                                        <select
                                            value={targetEndDay}
                                            onChange={(e) => setTargetEndDay(e.target.value)}
                                            className="glass-input h-12 w-full text-sm bg-surface"
                                            disabled={isBusy}
                                        >
                                            {['Today', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map(d => (
                                                <option key={d} value={d}>{d}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Message Template</label>
                                    <textarea
                                        value={reminderMessage}
                                        onChange={(e) => setReminderMessage(e.target.value)}
                                        className="glass-input w-full p-4 text-sm min-h-[120px]"
                                        placeholder="Enter reminder message..."
                                        disabled={isBusy}
                                    />
                                    <p className="text-[10px] text-slate-500">Available variables: [Client Name], [Date], [Time], [Provider]</p>
                                </div>

                                <button
                                    onClick={handleSendReminders}
                                    disabled={isBusy}
                                    className="w-full h-14 bg-emerald-500 hover:bg-emerald-600 rounded-xl font-bold text-white flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-500/20 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {isSendingReminders ? <Loader2 size={20} className="animate-spin" /> : <Mail size={20} />}
                                    <span>{isSendingReminders ? 'Sending Reminders...' : 'Send Reminders'}</span>
                                </button>

                                {isSendingReminders && (
                                    <div className="w-full bg-white/10 rounded-full h-2 overflow-hidden">
                                        <div
                                            className="bg-emerald-500 h-full transition-all duration-300 ease-out"
                                            style={{ width: `${reminderProgress}%` }}
                                        />
                                    </div>
                                )}

                                {reminderStats && (
                                    <div className="text-center text-xs text-slate-400 bg-white/5 rounded-lg p-2">
                                        Processed {reminderStats.total} appointments. <br />
                                        <span className="text-emerald-400">{reminderStats.sent} Sent</span> • <span className="text-rose-400">{reminderStats.failed} Failed</span>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* 2. Marketing Broadcast */}
                        <div className="glass-card p-8 border-white/5 space-y-6">
                            <div className="flex items-center gap-4">
                                <div className="p-3 rounded-2xl bg-purple-500/10 text-purple-400 border border-purple-500/20">
                                    <Sparkles size={24} />
                                </div>
                                <div>
                                    <h4 className="font-bold text-white">Marketing Broadcast</h4>
                                    <p className="text-xs text-slate-500">Send a message + photo to ALL clients</p>
                                </div>
                            </div>

                            <div className="space-y-4">
                                {/* Image Upload */}
                                <div
                                    className={`relative w-full h-40 rounded-xl border border-dashed border-white/20 flex flex-col items-center justify-center transition-all overflow-hidden ${isBusy ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-white/5'}`}
                                    onClick={() => !isBusy && document.getElementById('broadcast-upload').click()}
                                >
                                    {broadcastPreview ? (
                                        <img src={broadcastPreview} alt="Preview" className="w-full h-full object-cover" />
                                    ) : (
                                        <>
                                            <div className="p-3 rounded-full bg-white/10 text-slate-400 mb-2">
                                                <Plus size={20} />
                                            </div>
                                            <p className="text-xs text-slate-400 font-medium">Click to upload photo</p>
                                        </>
                                    )}
                                    <input
                                        id="broadcast-upload"
                                        type="file"
                                        accept="image/*"
                                        className="hidden"
                                        onChange={handleImageUpload}
                                        disabled={isBusy}
                                    />
                                </div>


                                <div className="space-y-2">
                                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Broadcast Message</label>
                                    <textarea
                                        value={broadcastMessage}
                                        onChange={(e) => setBroadcastMessage(e.target.value)}
                                        className="glass-input w-full p-4 text-sm min-h-[80px]"
                                        placeholder="Check out our new specials!..."
                                        disabled={isBusy}
                                    />
                                    <p className="text-[10px] text-slate-500">Available variables: [Client Name]</p>
                                </div>

                                <button
                                    onClick={handleSendBroadcast}
                                    disabled={isBusy}
                                    className="w-full h-14 bg-purple-500 hover:bg-purple-600 rounded-xl font-bold text-white flex items-center justify-center gap-2 transition-all shadow-lg shadow-purple-500/20 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {isSendingBroadcast ? (
                                        <div className="flex items-center gap-2">
                                            <Loader2 size={20} className="animate-spin" />
                                            <span>{isUploading ? 'Uploading...' : 'Sending...'}</span>
                                        </div>
                                    ) : (
                                        <>
                                            <Mail size={20} />
                                            <span>Send Broadcast</span>
                                        </>
                                    )}
                                </button>

                                {isSendingBroadcast && (
                                    <div className="w-full bg-white/10 rounded-full h-2 overflow-hidden">
                                        <div
                                            className="bg-purple-500 h-full transition-all duration-300 ease-out"
                                            style={{ width: `${broadcastProgress}%` }}
                                        />
                                    </div>
                                )}
                            </div>
                        </div>

                    </div>
                </div>
            </div >

            <EditStaffModal
                isOpen={isEditModalOpen}
                onClose={() => setIsEditModalOpen(false)}
                member={selectedStaff}
                onUpdate={fetchStaff}
            />
        </div >
    )
}

export default OrganizationSettings
