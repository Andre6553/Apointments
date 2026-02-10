import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { User, Save, Check, Loader2, Trash2, Edit2, XCircle, Shield, ShieldOff, AlertTriangle, Sparkles, Building2, LogOut } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

const TreatmentRow = ({ code, label, isPriority, treatment, currencySymbol, onSave }) => {
    const [duration, setDuration] = useState(treatment?.duration_minutes || 30)
    const [cost, setCost] = useState(treatment?.cost || 0)
    const [isSaving, setIsSaving] = useState(false)
    const [isDirty, setIsDirty] = useState(false)

    useEffect(() => {
        setDuration(treatment?.duration_minutes || 30)
        setCost(treatment?.cost || 0)
        setIsDirty(false)
    }, [treatment])

    const handleSave = async () => {
        if (!isDirty) return

        setIsSaving(true)
        await onSave(duration, cost)
        setIsSaving(false)
        setIsDirty(false)
    }

    const handleChange = (setter) => (e) => {
        setter(e.target.value)
        setIsDirty(true)
    }

    return (
        <div className={`grid grid-cols-12 gap-3 items-center p-4 rounded-xl border transition-all group ${isPriority ? 'bg-amber-500/5 border-amber-500/20' : 'bg-white/[0.02] border-white/5 hover:bg-white/[0.04]'}`}>
            {/* Service Name */}
            <div className="col-span-3 flex items-center gap-2 overflow-hidden">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 ${isPriority ? 'bg-amber-500/20 text-amber-400' : 'bg-indigo-500/10 text-indigo-400'}`}>
                    {code}
                </div>
                <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-white truncate" title={label}>{label}</p>
                    {isPriority && <span className="text-[9px] text-amber-500 font-bold uppercase">⭐ VIP Priority</span>}
                </div>
            </div>

            {/* Duration Field */}
            <div className="col-span-3">
                <div className="relative group/input">
                    <input
                        type="number"
                        className="glass-input w-full h-10 text-sm text-center bg-transparent border-transparent group-hover/input:border-white/10 focus:border-primary/50 transition-all"
                        value={duration}
                        onChange={handleChange(setDuration)}
                        onBlur={handleSave}
                        min="5"
                        step="5"
                    />
                    <span className="absolute left-1/2 ml-2 top-1/2 -translate-y-1/2 text-xs text-slate-500 pointer-events-none opacity-50 group-hover/input:opacity-100 transition-opacity">min</span>
                </div>
            </div>

            {/* Cost Field */}
            <div className="col-span-3">
                <div className="relative group/input">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none">{currencySymbol}</span>
                    <input
                        type="number"
                        className="glass-input w-full h-10 text-sm text-center bg-transparent border-transparent group-hover/input:border-white/10 focus:border-primary/50 transition-all"
                        value={cost}
                        onChange={handleChange(setCost)}
                        onBlur={handleSave}
                        min="0"
                        step="10"
                    />
                </div>
            </div>

            {/* Status */}
            <div className="col-span-3 flex justify-end gap-2 items-center h-10">
                <AnimatePresence>
                    {isSaving ? (
                        <motion.div
                            initial={{ opacity: 0, x: -5 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0 }}
                            className="flex items-center gap-1.5 text-emerald-400 text-[10px] font-bold"
                        >
                            <Loader2 size={10} className="animate-spin" />
                            Saving...
                        </motion.div>
                    ) : isDirty && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="text-amber-500/80 text-[10px] italic pr-2"
                        >
                            Unsaved
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    )
}

const ProfileSettings = () => {
    const { user, profile, fetchProfile, updateProfile } = useAuth()
    const [fullName, setFullName] = useState('')
    const [whatsapp, setWhatsapp] = useState('')
    const [currencySymbol, setCurrencySymbol] = useState('$')
    const [acceptsTransfers, setAcceptsTransfers] = useState(true)
    const [loading, setLoading] = useState(false)
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [isFetchingTreatments, setIsFetchingTreatments] = useState(false)
    const [togglingProtection, setTogglingProtection] = useState(false)
    const [status, setStatus] = useState(null) // 'saved' | 'error'
    const [treatments, setTreatments] = useState([])
    const [businessSkills, setBusinessSkills] = useState([])

    const [isLeavingOrg, setIsLeavingOrg] = useState(false)

    // Skills State (assigned by Admin, provider can only toggle priority)
    const [skills, setSkills] = useState([]) // e.g. [{ label: 'Haircut', code: 'HC', priority: true }]

    // Helper to save treatment updates from rows
    const handleSaveTreatment = async (skill, duration, cost) => {
        const isObj = typeof skill === 'object'
        const code = isObj ? skill.code : skill
        // Find existing treatment by name OR by required_skills match
        const treatment = treatments.find(t =>
            t.name?.toUpperCase() === code?.toUpperCase() ||
            (Array.isArray(t.required_skills) && t.required_skills.includes(code))
        )

        try {
            let result;
            const payload = {
                duration_minutes: parseInt(duration),
                cost: parseFloat(cost)
            }

            if (treatment?.id) {
                // Update
                const { data, error } = await supabase.from('treatments').update(payload).eq('id', treatment.id).select().single()
                if (error) throw error
                result = data
            } else {
                // Insert
                const { data, error } = await supabase.from('treatments').insert([{
                    profile_id: user.id,
                    name: code,
                    required_skills: [code],
                    ...payload
                }]).select().single()
                if (error) throw error
                result = data
            }

            // Optimistic / Real Update
            if (result) {
                setTreatments(prev => {
                    const exists = prev.find(p => p.id === result.id)
                    if (exists) return prev.map(p => p.id === result.id ? result : p)
                    return [...prev, result]
                })
            }
        } catch (err) {
            console.error('Error saving treatment:', err)
        }
    }


    useEffect(() => {
        if (profile) {
            setFullName(profile.full_name || '')
            setWhatsapp(profile.whatsapp || '')
            setAcceptsTransfers(profile.accepts_transfers ?? true)
            setAcceptsTransfers(profile.accepts_transfers ?? true)
            setCurrencySymbol(profile.currency_symbol || '$')
            setSkills(profile.skills || [])
            fetchTreatments()
            if (profile.business_id) fetchBusinessSkills()
        }
    }, [profile])

    const fetchBusinessSkills = async () => {
        try {
            const { data, error } = await supabase
                .from('business_skills')
                .select('*')
                .eq('business_id', profile.business_id)
            if (error) throw error
            setBusinessSkills(data || [])
        } catch (err) {
            console.error('Error fetching business skills:', err)
        }
    }

    const fetchTreatments = async () => {
        if (!user) return
        setIsFetchingTreatments(true)
        try {
            const { data, error } = await supabase
                .from('treatments')
                .select('*')
                .eq('profile_id', user.id)
                .order('created_at', { ascending: true })
            if (error) throw error
            setTreatments(data || [])
        } catch (err) {
            console.error('Error fetching treatments:', err)
        } finally {
            setIsFetchingTreatments(false)
        }
    }

    const handleLeaveOrganization = async () => {
        if (!profile?.business_id) return

        // Safety: Owners cannot leave their own business through this simple button
        if (profile.business?.owner_id === user.id) {
            alert("As the Business Owner, you cannot leave the organization. Please contact support or manage ownership in Organization settings.")
            return
        }

        if (!confirm(`Are you sure you want to leave "${profile.business?.name}"? You will lose access to team data immediately.`)) return

        setIsLeavingOrg(true)
        try {
            const { error } = await supabase
                .from('profiles')
                .update({ business_id: null })
                .eq('id', user.id)

            if (error) throw error
            await fetchProfile(user.id)
            setStatus('saved')
            setTimeout(() => setStatus(null), 3000)
        } catch (err) {
            console.error('Error leaving organization:', err)
            setStatus('error')
        } finally {
            setIsLeavingOrg(false)
        }
    }

    const handleUpdateProfile = async (e) => {
        e.preventDefault()
        if (!user) return
        performProfileUpdate({
            full_name: fullName,
            whatsapp: whatsapp,
            accepts_transfers: acceptsTransfers,
            currency_symbol: currencySymbol
        })
    }

    const performProfileUpdate = async (updates) => {
        setIsSubmitting(true)
        setStatus(null)

        try {
            const { error } = await supabase
                .from('profiles')
                .update(updates)
                .eq('id', user.id)

            if (error) throw error

            await fetchProfile(user.id)
            setStatus('saved')
            setTimeout(() => setStatus(null), 3000)
        } catch (error) {
            console.error('Error updating profile:', error)
            setStatus('error')
        } finally {
            setIsSubmitting(false)
        }
    }

    // Note: Skills are assigned by Admin via EditStaffModal. Provider can only toggle VIP/priority flag.

    // Note: Treatment saving is now handled inline in the JSX (skill-based rows)

    const toggleProtection = async () => {
        setTogglingProtection(true)
        try {
            await updateProfile({ report_protection_enabled: !profile?.report_protection_enabled })
        } catch (error) {
            console.error('Toggle failed:', error)
        } finally {
            setTogglingProtection(false)
        }
    }

    return (
        <div className="max-w-2xl space-y-8">
            <div>
                <h3 className="text-2xl font-bold text-white mb-1 font-heading">Account Settings</h3>
                <p className="text-slate-500 text-sm font-medium">Manage your public profile and contact information</p>
            </div>

            <form onSubmit={handleUpdateProfile} className="space-y-6">
                <div className="glass-card p-8 border-white/5 space-y-6">
                    <div className="space-y-2">
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">Full Name</label>
                        <div className="relative group">
                            <User className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-primary transition-colors" size={18} />
                            <input
                                type="text"
                                value={fullName}
                                onChange={(e) => setFullName(e.target.value)}
                                className="glass-input w-full pl-12 h-14"
                                placeholder="Your full name"
                                required
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">WhatsApp Number</label>
                            <div className="relative group">
                                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-primary transition-colors">
                                    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.414 0 .018 5.396.015 12.03a11.847 11.847 0 001.592 5.96L0 24l6.117-1.605a11.803 11.803 0 005.925 1.583h.005c6.637 0 12.032-5.396 12.035-12.031a11.815 11.815 0 00-3.534-8.514z" /></svg>
                                </div>
                                <input
                                    type="tel"
                                    value={whatsapp}
                                    onChange={(e) => setWhatsapp(e.target.value)}
                                    className="glass-input w-full pl-12 h-14"
                                    placeholder="+27 12 345 6789"
                                    required
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">Currency Symbol</label>
                            <div className="relative group">
                                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-primary font-bold transition-colors">$</div>
                                <input
                                    type="text"
                                    value={currencySymbol}
                                    onChange={(e) => setCurrencySymbol(e.target.value)}
                                    className="glass-input w-full pl-12 h-14"
                                    placeholder="$"
                                    maxLength={3}
                                    required
                                />
                            </div>
                        </div>
                    </div>

                    {/* Skills Editor - VIP Toggle Only (Skills assigned by Admin) */}
                    <div className="space-y-4 pt-4 border-t border-white/5">
                        <div className="flex items-center justify-between">
                            <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">My Skills</label>
                            <span className="text-[10px] text-slate-600 font-medium">Assigned by Admin</span>
                        </div>
                        <div className="bg-slate-900/50 rounded-2xl p-4 border border-white/5">
                            <div className="flex flex-wrap gap-2 mb-3">
                                {skills.map((skill, idx) => {
                                    const isObj = typeof skill === 'object'
                                    const code = isObj ? skill.code : skill
                                    const skillInfo = businessSkills.find(s => s.code === code)
                                    const label = isObj ? skill.label : (skillInfo?.name || code)
                                    const isPriority = isObj && skill.priority === true

                                    const togglePriority = () => {
                                        const newSkills = skills.map((s, i) => {
                                            if (i !== idx) return s;
                                            const sObj = typeof s === 'object' ? s : { label: s, code: s };
                                            return { ...sObj, priority: !sObj.priority };
                                        });
                                        setSkills(newSkills);
                                        performProfileUpdate({ skills: newSkills });
                                    };

                                    return (
                                        <div key={`${code}-${idx}`} className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-2 shadow-lg transition-all cursor-pointer ${isPriority ? 'bg-amber-500 text-slate-900 shadow-amber-500/30' : 'bg-indigo-500 text-white shadow-indigo-500/20'}`}
                                            onClick={togglePriority}
                                            title={isPriority ? 'Click to unmark as VIP' : 'Click to mark as VIP (Priority)'}
                                        >
                                            <Sparkles size={14} className={isPriority ? 'fill-current' : ''} />
                                            <span>
                                                {label} <span className="opacity-50 font-normal">({code})</span>
                                            </span>
                                        </div>
                                    )
                                })}
                                {skills.length === 0 && <span className="text-slate-500 text-sm italic">No skills assigned yet. Ask your Admin to assign skills to your profile.</span>}
                            </div>
                            <p className="text-[10px] text-amber-500/80 ml-1 italic">
                                <Sparkles size={10} className="inline mr-1" />
                                Click a skill to mark it as <strong>VIP/Priority</strong>. Appointments requiring these skills are protected during crises.
                            </p>
                        </div>
                    </div>

                    <div className="pt-4 border-t border-white/5 space-y-4">
                        <div className="flex items-center justify-between p-4 rounded-2xl bg-white/[0.02] border border-white/5">
                            <div className="flex items-center gap-3">
                                <div className={`p-2 rounded-lg ${profile?.report_protection_enabled ? 'bg-indigo-500/10 text-indigo-400' : 'bg-slate-800 text-slate-500'}`}>
                                    {profile?.report_protection_enabled ? <Shield size={18} /> : <ShieldOff size={18} />}
                                </div>
                                <div>
                                    <p className="text-sm font-bold text-white">Report Protection</p>
                                    <p className="text-[10px] text-slate-500 font-medium uppercase tracking-wider">Require password for analytics</p>
                                </div>
                            </div>
                            <button
                                onClick={toggleProtection}
                                disabled={togglingProtection}
                                className={`relative w-12 h-6 rounded-full transition-colors duration-300 ${profile?.report_protection_enabled ? 'bg-primary' : 'bg-slate-700'}`}
                            >
                                <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all duration-300 ${profile?.report_protection_enabled ? 'left-7' : 'left-1'}`} />
                            </button>
                        </div>
                    </div>

                    <div className="space-y-4 pt-2 border-t border-white/5">
                        <div className="flex items-center justify-between">
                            <div className="space-y-1">
                                <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">Accept Transfers</label>
                                <p className="text-[10px] text-slate-500 font-medium max-w-[250px]">
                                    Allow other providers to transfer their clients to your schedule.
                                </p>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input
                                    type="checkbox"
                                    className="sr-only peer"
                                    checked={acceptsTransfers}
                                    onChange={(e) => setAcceptsTransfers(e.target.checked)}
                                />
                                <div className="w-11 h-6 bg-slate-800 border border-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-slate-400 after:border-slate-500 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary peer-checked:after:bg-white peer-checked:border-primary/50"></div>
                            </label>
                        </div>
                    </div>

                    <div className="pt-4 flex items-center gap-4">
                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className="bg-primary hover:bg-indigo-600 text-white px-8 h-14 rounded-2xl font-bold flex items-center justify-center gap-2 transition-all shadow-lg shadow-primary/20 disabled:opacity-50"
                        >
                            {isSubmitting ? (
                                <Loader2 className="animate-spin" size={20} />
                            ) : (
                                <>
                                    <Save size={20} />
                                    <span>Save Changes</span>
                                </>
                            )}
                        </button>

                        <AnimatePresence>
                            {status === 'saved' && (
                                <motion.div
                                    initial={{ opacity: 0, x: -10 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0 }}
                                    className="flex items-center gap-2 text-emerald-400 font-bold text-sm"
                                >
                                    <div className="w-6 h-6 rounded-full bg-emerald-500/10 flex items-center justify-center">
                                        <Check size={14} />
                                    </div>
                                    Profile Updated
                                </motion.div>
                            )}
                            {status === 'error' && (
                                <motion.div
                                    initial={{ opacity: 0, x: -10 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0 }}
                                    className="flex items-center gap-2 text-rose-400 font-bold text-sm"
                                >
                                    <AlertTriangle size={18} />
                                    Failed to update
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </div>
            </form>

            <div className="space-y-6">
                <div>
                    <h3 className="text-xl font-bold text-white mb-1 font-heading">Treatment Menu</h3>
                    <p className="text-slate-500 text-xs font-medium uppercase tracking-widest">Define your services, durations, and costs</p>
                </div>

                <div className="glass-card p-8 border-white/5 space-y-6">
                    {/* Skill-Based Service List */}
                    <div className="space-y-3">
                        {skills.length === 0 ? (
                            <div className="py-8 text-center text-slate-500 italic text-sm">
                                No skills assigned yet. Ask your Admin to assign skills to your profile.
                            </div>
                        ) : (
                            <>
                                {/* Header Row */}
                                <div className="grid grid-cols-12 gap-3 px-4 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                                    <div className="col-span-3">Service (Skill)</div>
                                    <div className="col-span-3">Duration</div>
                                    <div className="col-span-3">Cost</div>
                                    <div className="col-span-3"></div>
                                </div>

                                {/* Skill/Service Rows */}
                                {skills.map((skill, idx) => {
                                    const isObj = typeof skill === 'object'
                                    const code = isObj ? skill.code : skill
                                    const skillInfo = businessSkills.find(s => s.code === code)
                                    const label = isObj ? skill.label : (skillInfo?.name || code)
                                    const isPriority = isObj && skill.priority === true

                                    const treatment = treatments.find(t =>
                                        t.name?.toUpperCase() === code?.toUpperCase() ||
                                        (Array.isArray(t.required_skills) && t.required_skills.includes(code))
                                    )

                                    return (
                                        <TreatmentRow
                                            key={`${code}-${idx}`}
                                            code={code}
                                            label={label}
                                            isPriority={isPriority}
                                            treatment={treatment}
                                            currencySymbol={currencySymbol}
                                            onSave={(d, c) => handleSaveTreatment(skill, d, c)}
                                        />
                                    )
                                })}
                            </>
                        )}
                    </div>

                    <p className="text-[10px] text-slate-500 text-center pt-2">
                        Services are based on your assigned skills. Contact Admin to add/remove skills.
                    </p>
                </div>
            </div>


            {
                profile?.business_id && (
                    <div className="glass-card p-8 border-white/5 space-y-6">
                        <div className="flex items-center gap-4">
                            <div className="p-3 rounded-2xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                                <Building2 size={24} />
                            </div>
                            <div>
                                <h4 className="font-bold text-white">Organization Membership</h4>
                                <p className="text-xs text-slate-500">Currently linked to {profile.business?.name}</p>
                            </div>
                        </div>

                        <div className="p-6 rounded-2xl bg-amber-500/5 border border-amber-500/10 space-y-4">
                            <div className="flex gap-3">
                                <AlertTriangle className="text-amber-500 shrink-0" size={18} />
                                <div className="space-y-1">
                                    <p className="text-sm font-bold text-amber-500">Resignation Notice</p>
                                    <p className="text-xs text-slate-400 leading-relaxed">
                                        Leaving this organization will remove your access to the shared dashboard,
                                        team schedule, and the business client list. Your profile will return to
                                        individual status.
                                    </p>
                                </div>
                            </div>

                            <button
                                onClick={handleLeaveOrganization}
                                disabled={isLeavingOrg}
                                className="w-full h-12 rounded-xl border border-white/10 hover:bg-rose-500/10 hover:border-rose-500/30 text-slate-400 hover:text-rose-400 font-bold text-sm flex items-center justify-center gap-2 transition-all group"
                            >
                                {isLeavingOrg ? (
                                    <Loader2 size={18} className="animate-spin" />
                                ) : (
                                    <LogOut size={18} className="group-hover:-translate-x-1 transition-transform" />
                                )}
                                Leave Organization
                            </button>
                        </div>
                    </div>
                )
            }

            <div className="glass-card p-6 border-white/5 bg-white/[0.02]">
                <div className="flex items-center gap-4 text-slate-500">
                    <div className="w-10 h-10 rounded-xl bg-surface border border-white/5 flex items-center justify-center">
                        <User size={18} />
                    </div>
                    <div>
                        <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Account Email</p>
                        <p className="text-sm font-medium">{user?.email}</p>
                    </div>
                </div>
            </div>
        </div >
    )
}

export default ProfileSettings
