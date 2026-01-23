import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { User, Save, Check, Loader2, AlertTriangle } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

const ProfileSettings = () => {
    const { user, profile, fetchProfile } = useAuth()
    const [fullName, setFullName] = useState('')
    const [whatsapp, setWhatsapp] = useState('')
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [status, setStatus] = useState(null) // 'saved' | 'error'

    useEffect(() => {
        if (profile) {
            setFullName(profile.full_name || '')
            setWhatsapp(profile.whatsapp || '')
        }
    }, [profile])

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
                    whatsapp: whatsapp
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
