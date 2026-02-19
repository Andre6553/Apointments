import { useState, useEffect } from 'react'
import { X, CheckCircle2, Sparkles, Plus, Loader2, Save } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'

const CompletedSessionModal = ({ isOpen, onClose, onRefresh, appointment }) => {
    const { profile } = useAuth()
    const [loading, setLoading] = useState(false)
    const [treatments, setTreatments] = useState([])
    const [formData, setFormData] = useState({
        cost: 0,
        additional_services: [],
        treatmentName: ''
    })
    const [isDropdownOpen, setIsDropdownOpen] = useState(false)

    // Initialize data from appointment
    useEffect(() => {
        if (appointment) {
            setFormData({
                cost: parseFloat(appointment.cost) || 0,
                additional_services: appointment.additional_services || [],
                treatmentName: appointment.treatment_name || ''
            })
            fetchTreatments(appointment.assigned_profile_id)
        }
    }, [appointment])

    const fetchTreatments = async (providerId) => {
        if (!providerId || !profile?.business_id) return
        try {
            // 1. Fetch provider skills
            const { data: pData } = await supabase
                .from('profiles')
                .select('skills')
                .eq('id', providerId)
                .single()

            const pSkills = pData?.skills || []
            const pSkillCodes = pSkills.map(s => (typeof s === 'object' ? s.code : s).toUpperCase())

            // 2. Fetch all treatments for the business
            const { data: allTreatments } = await supabase
                .from('treatments')
                .select('*')
                .eq('business_id', profile.business_id)
                .order('name')

            if (allTreatments) {
                // 3. Map to usable objects
                const mapped = allTreatments.map(t => {
                    const reqSkills = t.required_skills?.map(s => String(s).toUpperCase()) || []

                    // Check if provider has ALL required skills for this treatment
                    // If treatment has no required skills, assuming they have it? Or assuming it's generic?
                    // Usually if reqSkills is empty, anyone can do it.
                    const hasSkill = reqSkills.length === 0 || reqSkills.every(req => pSkillCodes.includes(req))

                    // Find specific price overlay if they have the skill
                    // We assume the skill object matching the *first* required skill holds the price? 
                    // Or we just look for a skill obj that matches any of the requirements?
                    // This logic is a bit fuzzy in the existing app, but usually:
                    const skillOverlay = pSkills.find(s => typeof s === 'object' && reqSkills.includes(s.code?.toUpperCase()))

                    let finalPrice = parseFloat(t.price) || 0

                    // Check for skill overlay price
                    if (hasSkill && skillOverlay) {
                        const overlayPrice = parseFloat(skillOverlay.price)
                        // Only override if overlayPrice is a valid number (allowing 0)
                        if (!isNaN(overlayPrice)) {
                            finalPrice = overlayPrice
                        }
                    }

                    return {
                        ...t,
                        price: finalPrice,
                        hasSkill: hasSkill,
                        display_name: t.name // Keep original name
                    }
                })

                setTreatments(mapped.sort((a, b) => a.name.localeCompare(b.name)))
            }
        } catch (err) {
            console.error('Error fetching treatments:', err)
        }
    }

    const handleAddService = (serviceId) => {
        const service = treatments.find(t => t.id === serviceId)
        if (!service) return

        let finalPrice = service.price

        if (!service.hasSkill || finalPrice === 0) {
            // Unskilled OR Price is 0 - Manual Price Override
            const defaultPrice = finalPrice > 0 ? finalPrice : ''
            const manual = window.prompt(`Enter charge for "${service.name}":`, defaultPrice)
            if (manual === null) return // Cancelled
            finalPrice = parseFloat(manual)
            if (isNaN(finalPrice)) {
                alert("Invalid price entered.")
                return
            }
        }

        setFormData(prev => ({
            ...prev,
            additional_services: [...prev.additional_services, {
                id: service.id,
                name: service.name,
                price: finalPrice
            }],
            cost: prev.cost + finalPrice,
            treatmentName: prev.treatmentName ? `${prev.treatmentName} + ${service.name}` : service.name
        }))
    }

    const handleRemoveService = (index) => {
        const svc = formData.additional_services[index]
        const newServices = [...formData.additional_services]
        newServices.splice(index, 1)

        setFormData(prev => ({
            ...prev,
            additional_services: newServices,
            cost: prev.cost - (svc.price || 0),
            treatmentName: prev.treatmentName.replace(` + ${svc.name}`, '').replace(`${svc.name} + `, '').replace(svc.name, prev.treatmentName.split(' + ')[0]) // simplistic cleanup
        }))
    }

    const handleSave = async () => {
        setLoading(true)
        try {
            // Sanitize payload
            const payload = {
                cost: parseFloat(formData.cost) || 0,
                additional_services: formData.additional_services.map(s => ({
                    ...s,
                    price: parseFloat(s.price) || 0
                })),
                treatment_name: formData.treatmentName || ''
            }

            console.log('Updating session with payload:', payload)

            const { error } = await supabase
                .from('appointments')
                .update(payload)
                .eq('id', appointment.id)

            if (error) {
                console.error('Supabase update error:', error)
                throw error
            }

            onRefresh()
            onClose()
        } catch (err) {
            console.error('Save failed:', err)
            alert('Failed to update session')
        } finally {
            setLoading(false)
        }
    }

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
                    />

                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="relative w-full max-w-lg glass-card border-white/10 shadow-2xl z-[210] flex flex-col"
                    >
                        {/* Header */}
                        <div className="p-6 border-b border-white/5 bg-emerald-500/5 flex justify-between items-center">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-emerald-500/10 rounded-lg text-emerald-400">
                                    <CheckCircle2 size={20} />
                                </div>
                                <div>
                                    <h3 className="font-bold text-white text-lg">Completed Session</h3>
                                    <p className="text-xs text-emerald-500/60 font-medium uppercase tracking-wider">Review & Add Services</p>
                                </div>
                            </div>
                            <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-lg text-slate-500 hover:text-white transition-colors">
                                <X size={20} />
                            </button>
                        </div>

                        <div className="p-6 space-y-6">
                            {/* Summary Card */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="p-4 bg-white/5 rounded-xl border border-white/5">
                                    <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest block mb-1">Client</label>
                                    <div className="font-bold text-white truncate">{appointment?.client?.first_name} {appointment?.client?.last_name}</div>
                                </div>
                                <div className="p-4 bg-white/5 rounded-xl border border-white/5">
                                    <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest block mb-1">Original Svc</label>
                                    <div className="font-bold text-white truncate">{appointment?.treatment_name?.split(' + ')[0]}</div>
                                </div>
                            </div>

                            {/* Services List */}
                            <div className="space-y-3">
                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Services Performed</label>
                                <div className="flex flex-wrap gap-2">
                                    {/* Primary (Immutable-ish for visual clarity) */}
                                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm font-bold">
                                        <Sparkles size={14} />
                                        {appointment?.treatment_name?.split(' + ')[0]}
                                        <span className="opacity-60 text-xs ml-1">(Primary)</span>
                                    </div>

                                    {/* Added Services */}
                                    {formData.additional_services.map((svc, idx) => (
                                        <div key={idx} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-sm font-bold">
                                            <span>{svc.name}</span>
                                            <span className="text-xs opacity-60 ml-1">{profile?.currency_symbol || '$'}{svc.price}</span>
                                            <button
                                                onClick={() => handleRemoveService(idx)}
                                                className="ml-1 p-0.5 hover:bg-rose-500/20 text-indigo-300 hover:text-rose-400 rounded-full transition-colors"
                                            >
                                                <X size={12} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Add Service */}
                            <div className="space-y-2 pt-4 border-t border-white/5">
                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Add Additional Service</label>
                                <div className="relative">
                                    <button
                                        onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                                        className="w-full bg-slate-900/50 border border-white/10 rounded-xl px-4 py-3 text-sm text-slate-300 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50 transition-all hover:bg-white/5 pl-10 text-left flex items-center justify-between"
                                    >
                                        <span>+ Select service to add...</span>
                                    </button>
                                    <Plus className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" size={16} />

                                    <AnimatePresence>
                                        {isDropdownOpen && (
                                            <>
                                                <div className="fixed inset-0 z-[220]" onClick={() => setIsDropdownOpen(false)} />
                                                <motion.div
                                                    initial={{ opacity: 0, y: -10 }}
                                                    animate={{ opacity: 1, y: 0 }}
                                                    exit={{ opacity: 0, y: -10 }}
                                                    className="absolute bottom-full left-0 right-0 mb-2 py-4 bg-slate-950 border border-slate-800 rounded-xl shadow-2xl overflow-hidden z-[9999] max-h-[85vh] overflow-y-auto ring-1 ring-white/10"
                                                >
                                                    {treatments.map(t => (
                                                        <button
                                                            key={t.id}
                                                            onClick={() => {
                                                                handleAddService(t.id)
                                                                setIsDropdownOpen(false)
                                                            }}
                                                            className={`w-full text-left px-4 py-3 text-sm transition-colors hover:bg-white/5 flex items-center justify-between group border-b border-white/5 last:border-0 ${!t.hasSkill ? 'text-amber-400 hover:text-amber-300' : 'text-slate-200 hover:text-white'
                                                                }`}
                                                        >
                                                            <span className="font-medium">{t.name}</span>
                                                            <span className={`text-xs font-bold px-2 py-0.5 rounded ${!t.hasSkill ? 'bg-amber-500/10 text-amber-500' : 'bg-emerald-500/10 text-emerald-500 opacity-60 group-hover:opacity-100'
                                                                }`}>
                                                                {t.hasSkill ? ((t.price > 0) ? (profile?.currency_symbol || '$') + t.price : 'Set Price') : 'Custom Price'}
                                                            </span>
                                                        </button>
                                                    ))}
                                                </motion.div>
                                            </>
                                        )}
                                    </AnimatePresence>
                                </div>
                            </div>

                            {/* Footer / Total */}
                            <div className="flex items-center justify-between pt-4 border-t border-white/5 mt-4">
                                <div>
                                    <p className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Total Billable</p>
                                    <p className="text-2xl font-black text-white">{profile?.currency_symbol || '$'}{formData.cost.toFixed(2)}</p>
                                </div>
                                <button
                                    onClick={handleSave}
                                    disabled={loading}
                                    className="flex items-center gap-2 px-6 py-3 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl font-bold text-sm shadow-lg shadow-emerald-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {loading ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                                    <span>Update Session</span>
                                </button>
                            </div>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    )
}

export default CompletedSessionModal
