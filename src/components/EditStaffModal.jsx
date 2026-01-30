import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, User, Phone, Mail, Save, Loader2, Shield, Sparkles, PlusCircle, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useToast } from '../contexts/ToastContext'

const EditStaffModal = ({ isOpen, onClose, member, onUpdate }) => {
    const [firstName, setFirstName] = useState('')
    const [lastName, setLastName] = useState('')
    const [whatsapp, setWhatsapp] = useState('')
    const [email, setEmail] = useState('')
    const [loading, setLoading] = useState(false)
    const [availableSkills, setAvailableSkills] = useState([])
    const [providerSkills, setProviderSkills] = useState([])
    const showToast = useToast()

    useEffect(() => {
        if (isOpen && member?.business_id) {
            fetchAvailableSkills()
        }
    }, [isOpen, member?.id, member?.business_id])

    const fetchAvailableSkills = async () => {
        try {
            const { data, error } = await supabase
                .from('business_skills')
                .select('*')
                .eq('business_id', member.business_id)
                .order('name')
            if (error) throw error
            setAvailableSkills(data || [])
        } catch (err) {
            console.error('Error fetching available skills:', err)
        }
    }

    useEffect(() => {
        if (member) {
            const names = (member.full_name || '').trim().split(' ')
            setFirstName(names[0] || '')
            setLastName(names.slice(1).join(' ') || '')
            setWhatsapp(member.whatsapp || '')
            setEmail(member.email || '')

            // Normalize skills to a simple array of codes for the UI
            const skills = member.skills || []
            setProviderSkills(skills.map(s => typeof s === 'object' ? s.code : s))
        }
    }, [member])

    const toggleSkill = (code) => {
        setProviderSkills(prev =>
            prev.includes(code)
                ? prev.filter(s => s !== code)
                : [...prev, code]
        )
    }

    const handleSubmit = async (e) => {
        e.preventDefault()
        setLoading(true)
        try {
            const { error } = await supabase
                .from('profiles')
                .update({
                    full_name: `${firstName} ${lastName}`.trim(),
                    whatsapp,
                    email,
                    skills: providerSkills // Saving as array of codes
                })
                .eq('id', member.id)

            if (error) throw error

            showToast('Team member updated', 'success')
            if (onUpdate) onUpdate()
            onClose()
        } catch (error) {
            console.error('Error updating staff:', error)
            showToast('Failed to update staff member', 'error')
        } finally {
            setLoading(false)
        }
    }

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="absolute inset-0 bg-slate-950/80 backdrop-blur-md"
                    />

                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        className="relative w-full max-w-lg glass-card p-0 flex flex-col max-h-[85vh] overflow-hidden shadow-2xl border border-white/10"
                    >
                        {/* Header */}
                        <div className="p-6 border-b border-white/5 bg-white/[0.02] flex items-center justify-between shrink-0">
                            <div className="flex items-center gap-3">
                                <div className="p-2.5 rounded-xl bg-indigo-500/20 border border-indigo-500/20 text-indigo-400">
                                    <Shield size={20} />
                                </div>
                                <div>
                                    <h3 className="text-xl font-heading font-bold text-white leading-none">Edit Provider</h3>
                                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1.5">Administrative Override</p>
                                </div>
                            </div>
                            <button onClick={onClose} className="p-2 text-slate-500 hover:text-white hover:bg-white/5 rounded-xl transition-all">
                                <X size={20} />
                            </button>
                        </div>

                        {/* Form Content */}
                        <div className="flex-1 overflow-y-auto p-6">
                            <form id="edit-staff-form" onSubmit={handleSubmit} className="space-y-6">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">First Name</label>
                                        <input
                                            value={firstName}
                                            onChange={e => setFirstName(e.target.value)}
                                            className="glass-input w-full"
                                            placeholder="Name"
                                            required
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">Last Name</label>
                                        <input
                                            value={lastName}
                                            onChange={e => setLastName(e.target.value)}
                                            className="glass-input w-full"
                                            placeholder="Surname"
                                            required
                                        />
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">WhatsApp Number</label>
                                    <div className="relative">
                                        <Phone className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                                        <input
                                            value={whatsapp}
                                            onChange={e => setWhatsapp(e.target.value)}
                                            className="glass-input w-full pl-11"
                                            placeholder="+27..."
                                            required
                                        />
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">Email Address</label>
                                    <div className="relative border-b border-white/5 pb-2">
                                        <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                                        <input
                                            type="email"
                                            value={email}
                                            onChange={e => setEmail(e.target.value)}
                                            className="glass-input w-full pl-11"
                                            placeholder="email@example.com"
                                            required
                                        />
                                    </div>
                                    <p className="text-[10px] text-amber-500/80 font-medium italic mt-1 px-1">
                                        Note: Changing email here updates the contact record but not the login credentials.
                                    </p>
                                </div>

                                {/* Managed Skills Section */}
                                <div className="space-y-4 pt-4 border-t border-white/5">
                                    <div className="flex items-center gap-2 text-slate-400 ml-1">
                                        <Sparkles size={14} className="text-primary" />
                                        <span className="text-xs font-bold uppercase tracking-widest text-slate-400">Provider Skills</span>
                                    </div>

                                    {/* Skill Selector Dropdown */}
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Assign New Skill</label>
                                        <select
                                            className="glass-input w-full text-sm"
                                            value=""
                                            onChange={(e) => {
                                                if (e.target.value) toggleSkill(e.target.value)
                                            }}
                                        >
                                            <option value="">Select a skill to add...</option>
                                            {availableSkills.filter(s => !providerSkills.includes(s.code)).length === 0 ? (
                                                <option disabled value="">No more skills available to add</option>
                                            ) : (
                                                availableSkills
                                                    .filter(s => !providerSkills.includes(s.code))
                                                    .map(skill => (
                                                        <option key={skill.id} value={skill.code} className="bg-slate-900">
                                                            {skill.name} ({skill.code})
                                                        </option>
                                                    ))
                                            )}
                                        </select>
                                    </div>

                                    {/* Active Skill Tags */}
                                    <div className="flex flex-wrap gap-2 min-h-[40px] p-3 rounded-xl bg-white/[0.02] border border-white/5">
                                        {providerSkills.length === 0 ? (
                                            <span className="text-[10px] text-slate-600 font-medium uppercase tracking-widest py-2">No skills assigned</span>
                                        ) : (
                                            providerSkills.map(code => {
                                                const skillInfo = availableSkills.find(s => s.code === code)
                                                return (
                                                    <div
                                                        key={code}
                                                        className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-primary/10 border border-primary/20 text-primary transition-all group/tag"
                                                    >
                                                        <span className="text-[10px] font-black uppercase tracking-tighter">{code}</span>
                                                        <span className="text-[10px] font-bold whitespace-nowrap">{skillInfo?.name || code}</span>
                                                        <button
                                                            type="button"
                                                            onClick={() => toggleSkill(code)}
                                                            className="text-primary/40 hover:text-rose-400 transition-colors"
                                                        >
                                                            <X size={10} />
                                                        </button>
                                                    </div>
                                                )
                                            })
                                        )}
                                    </div>
                                </div>
                            </form>
                        </div>

                        {/* Actions */}
                        <div className="p-4 border-t border-white/5 bg-white/[0.02] flex gap-3 shrink-0">
                            <button
                                type="button"
                                onClick={onClose}
                                className="flex-1 py-3 rounded-xl bg-surface border border-white/5 text-slate-400 font-bold hover:text-white transition-all text-sm"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                form="edit-staff-form"
                                disabled={loading}
                                className="flex-[2] py-3 rounded-xl bg-primary hover:bg-indigo-600 text-white font-bold transition-all flex items-center justify-center gap-2 shadow-lg shadow-primary/20 text-sm"
                            >
                                {loading ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                                Save Changes
                            </button>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    )
}

export default EditStaffModal
