import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { User, Save, Check, Loader2, Trash2, Edit2, XCircle, Shield, ShieldOff, AlertTriangle, Sparkles } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

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

    const [newTreatment, setNewTreatment] = useState({ name: '', duration: 30, cost: 0 })
    const [editingId, setEditingId] = useState(null)
    const [editValues, setEditValues] = useState({ name: '', duration: 30, cost: 0 })

    useEffect(() => {
        if (profile) {
            setFullName(profile.full_name || '')
            setWhatsapp(profile.whatsapp || '')
            setAcceptsTransfers(profile.accepts_transfers ?? true)
            setCurrencySymbol(profile.currency_symbol || '$')
            fetchTreatments()
        }
    }, [profile])

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

    const handleUpdateProfile = async (e) => {
        e.preventDefault()
        if (!user) return

        setIsSubmitting(true)
        setStatus(null)

        try {
            const { error } = await supabase
                .from('profiles')
                .update({
                    full_name: fullName,
                    whatsapp: whatsapp,
                    accepts_transfers: acceptsTransfers,
                    currency_symbol: currencySymbol
                })
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

    const handleAddTreatment = async (e) => {
        e.preventDefault()
        if (!user || !newTreatment.name) return

        try {
            const { data, error } = await supabase
                .from('treatments')
                .insert([{
                    profile_id: user.id,
                    name: newTreatment.name,
                    duration_minutes: parseInt(newTreatment.duration),
                    cost: parseFloat(newTreatment.cost)
                }])
                .select()
                .single()

            if (error) throw error
            setTreatments([...treatments, data])
            setNewTreatment({ name: '', duration: 30, cost: 0 })
        } catch (err) {
            console.error('Error adding treatment:', err)
            alert('Failed to add treatment. (Note: Name must be unique)')
        }
    }

    const handleUpdateTreatment = async (id) => {
        try {
            const { error } = await supabase
                .from('treatments')
                .update({
                    name: editValues.name,
                    duration_minutes: parseInt(editValues.duration),
                    cost: parseFloat(editValues.cost)
                })
                .eq('id', id)

            if (error) throw error
            setTreatments(treatments.map(t => t.id === id ? { ...t, ...editValues, duration_minutes: parseInt(editValues.duration), cost: parseFloat(editValues.cost) } : t))
            setEditingId(null)
        } catch (err) {
            console.error('Error updating treatment:', err)
            alert('Failed to update treatment.')
        }
    }

    const handleDeleteTreatment = async (id) => {
        try {
            const { error } = await supabase.from('treatments').delete().eq('id', id)
            if (error) throw error
            setTreatments(treatments.filter(t => t.id !== id))
        } catch (err) {
            console.error('Error deleting treatment:', err)
        }
    }

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
                    {/* Add Treatment Form */}
                    <form onSubmit={handleAddTreatment} className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end pb-6 border-b border-white/5">
                        <div className="md:col-span-6 space-y-2">
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Service Name</label>
                            <input
                                type="text"
                                placeholder="e.g. Full Set Nails"
                                className="glass-input w-full h-12 text-sm"
                                value={newTreatment.name}
                                onChange={e => setNewTreatment({ ...newTreatment, name: e.target.value })}
                                required
                            />
                        </div>
                        <div className="md:col-span-2 space-y-2">
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Min</label>
                            <input
                                type="number"
                                placeholder="30"
                                className="glass-input w-full h-12 text-sm text-center"
                                value={newTreatment.duration}
                                onChange={e => setNewTreatment({ ...newTreatment, duration: e.target.value })}
                                required
                            />
                        </div>
                        <div className="md:col-span-4 space-y-2">
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Cost ({currencySymbol})</label>
                            <div className="flex gap-2">
                                <input
                                    type="number"
                                    placeholder="0"
                                    className="glass-input w-full h-12 text-sm"
                                    value={newTreatment.cost}
                                    onChange={e => setNewTreatment({ ...newTreatment, cost: e.target.value })}
                                    required
                                />
                                <button type="submit" className="h-12 w-12 bg-primary rounded-xl flex items-center justify-center text-white shadow-lg shadow-primary/20 hover:scale-105 transition-transform shrink-0">
                                    <Save size={18} />
                                </button>
                            </div>
                        </div>
                    </form>

                    {/* Treatment List */}
                    <div className="space-y-3">
                        {isFetchingTreatments ? (
                            <div className="py-8 text-center text-slate-500 italic text-sm flex items-center justify-center gap-2">
                                <Loader2 size={16} className="animate-spin" /> Fetching treatments...
                            </div>
                        ) : treatments.length === 0 ? (
                            <div className="py-8 text-center text-slate-500 italic text-sm">No treatments defined yet.</div>
                        ) : (
                            <div className="grid grid-cols-1 gap-3">
                                {treatments.map(t => (
                                    <div key={t.id} className="flex items-center justify-between p-4 rounded-xl bg-white/[0.02] border border-white/5 hover:bg-white/[0.04] transition-all group">
                                        {editingId === t.id ? (
                                            <div className="flex-1 grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
                                                <div className="md:col-span-5">
                                                    <input
                                                        type="text"
                                                        className="glass-input w-full h-10 text-xs"
                                                        value={editValues.name}
                                                        onChange={e => setEditValues({ ...editValues, name: e.target.value })}
                                                    />
                                                </div>
                                                <div className="md:col-span-2">
                                                    <input
                                                        type="number"
                                                        className="glass-input w-full h-10 text-xs text-center"
                                                        value={editValues.duration}
                                                        onChange={e => setEditValues({ ...editValues, duration: e.target.value })}
                                                    />
                                                </div>
                                                <div className="md:col-span-3">
                                                    <input
                                                        type="number"
                                                        className="glass-input w-full h-10 text-xs text-center"
                                                        value={editValues.cost}
                                                        onChange={e => setEditValues({ ...editValues, cost: e.target.value })}
                                                    />
                                                </div>
                                                <div className="md:col-span-2 flex gap-1 justify-end">
                                                    <button onClick={() => handleUpdateTreatment(t.id)} className="p-2 text-emerald-400 hover:bg-emerald-500/10 rounded-lg shrink-0">
                                                        <Check size={16} />
                                                    </button>
                                                    <button onClick={() => setEditingId(null)} className="p-2 text-slate-500 hover:bg-white/5 rounded-lg shrink-0">
                                                        <XCircle size={16} />
                                                    </button>
                                                </div>
                                            </div>
                                        ) : (
                                            <>
                                                <div className="flex items-center gap-4">
                                                    <div className="w-10 h-10 rounded-lg bg-indigo-500/10 flex items-center justify-center text-indigo-400 font-bold text-xs">
                                                        {t.duration_minutes}'
                                                    </div>
                                                    <div>
                                                        <p className="text-sm font-bold text-white">{t.name}</p>
                                                        <p className="text-xs text-slate-500 font-medium">{currencySymbol}{t.cost}</p>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button
                                                        onClick={() => {
                                                            setEditingId(t.id)
                                                            setEditValues({ name: t.name, duration: t.duration_minutes, cost: t.cost })
                                                        }}
                                                        className="p-2 text-slate-500 hover:text-primary transition-colors hover:bg-white/5 rounded-lg"
                                                    >
                                                        <Edit2 size={16} />
                                                    </button>
                                                    <button
                                                        onClick={() => handleDeleteTreatment(t.id)}
                                                        className="p-2 text-slate-500 hover:text-rose-400 transition-colors hover:bg-white/5 rounded-lg"
                                                    >
                                                        <Trash2 size={16} />
                                                    </button>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>

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
        </div>
    )
}

export default ProfileSettings
