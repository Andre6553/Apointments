import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, User, Phone, Mail, Save, MessageCircle, CheckCircle2, AlertCircle, Loader2, Send } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useToast } from '../contexts/ToastContext'

const EditClientModal = ({ isOpen, onClose, client, onUpdate }) => {
    const [formData, setFormData] = useState({
        first_name: '',
        last_name: '',
        phone: '',
        email: '',
        whatsapp_opt_in: null
    })
    const [loading, setLoading] = useState(false)
    const [testLoading, setTestLoading] = useState(false)
    const showToast = useToast()

    useEffect(() => {
        if (client) {
            setFormData({
                first_name: client.first_name || '',
                last_name: client.last_name || '',
                phone: client.phone || '',
                email: client.email || '',
                whatsapp_opt_in: client.whatsapp_opt_in
            })
        }
    }, [client])

    const handleSubmit = async (e) => {
        e.preventDefault()
        setLoading(true)
        try {
            const { error } = await supabase
                .from('clients')
                .update(formData)
                .eq('id', client.id)

            if (error) throw error

            showToast('Client updated successfully', 'success')
            onUpdate && onUpdate()
            onClose()
        } catch (error) {
            console.error('Error updating client:', error)
            showToast('Failed to update client', 'error')
        } finally {
            setLoading(false)
        }
    }

    const handleTestMessage = async () => {
        if (!formData.phone) return showToast('Phone number required', 'error')

        setTestLoading(true)
        try {
            const response = await fetch('http://localhost:3001/send-whatsapp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    to: formData.phone,
                    message: `Welcome to Appointments Tracker! WhatsApp Integration Verified ✅`
                })
            })

            const data = await response.json()

            if (response.ok) {
                showToast(`Message sent! SID: ${data.sid}`, 'success')
            } else {
                console.error('Twilio Response:', data)
                throw new Error(data.message || data.error || 'Twilio Rejected Request')
            }
        } catch (error) {
            console.error('Twilio Error:', error)
            showToast('Failed to send: ' + error.message, 'error')
        } finally {
            setTestLoading(false)
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
                        className="relative w-full max-w-lg glass-card p-0 overflow-hidden shadow-2xl border border-white/10"
                    >
                        {/* Header */}
                        <div className="p-6 border-b border-white/5 bg-white/[0.02] flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="p-2.5 rounded-xl bg-primary/20 border border-primary/20 text-primary">
                                    <User size={20} />
                                </div>
                                <div>
                                    <h3 className="text-xl font-heading font-bold text-white leading-none">Edit Client</h3>
                                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1.5">UPDATE DETAILS</p>
                                </div>
                            </div>
                            <button onClick={onClose} className="p-2 text-slate-500 hover:text-white hover:bg-white/5 rounded-xl transition-all">
                                <X size={20} />
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="p-6 space-y-6">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">First Name</label>
                                    <input
                                        value={formData.first_name}
                                        onChange={e => setFormData({ ...formData, first_name: e.target.value })}
                                        className="glass-input w-full"
                                        required
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">Last Name</label>
                                    <input
                                        value={formData.last_name}
                                        onChange={e => setFormData({ ...formData, last_name: e.target.value })}
                                        className="glass-input w-full"
                                        required
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">Phone Number</label>
                                <div className="relative">
                                    <Phone className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                                    <input
                                        value={formData.phone}
                                        onChange={e => setFormData({ ...formData, phone: e.target.value })}
                                        className="glass-input w-full pl-11"
                                        required
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">Email Address</label>
                                <div className="relative">
                                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                                    <input
                                        type="email"
                                        value={formData.email}
                                        onChange={e => setFormData({ ...formData, email: e.target.value })}
                                        className="glass-input w-full pl-11"
                                    />
                                </div>
                            </div>

                            {/* WhatsApp Integration Section */}
                            <div className="rounded-2xl bg-emerald-500/5 border border-emerald-500/20 p-5 space-y-4">
                                <div className="flex items-center gap-3 mb-2">
                                    <div className="p-2 rounded-lg bg-emerald-500/20 text-emerald-400">
                                        <MessageCircle size={20} />
                                    </div>
                                    <h4 className="font-bold text-white text-sm">WhatsApp Notifications</h4>
                                </div>

                                <div className="flex items-center justify-between bg-surface/50 p-3 rounded-xl border border-white/5">
                                    <span className="text-xs font-bold text-slate-300">Receive Updates?</span>
                                    <div className="flex bg-slate-900 rounded-lg p-1 border border-white/5">
                                        <button
                                            type="button"
                                            onClick={() => setFormData({ ...formData, whatsapp_opt_in: true })}
                                            className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${formData.whatsapp_opt_in === true ? 'bg-emerald-500 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
                                        >
                                            YES
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setFormData({ ...formData, whatsapp_opt_in: false })}
                                            className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${formData.whatsapp_opt_in === false ? 'bg-slate-700 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
                                        >
                                            NO
                                        </button>
                                    </div>
                                </div>

                                {formData.whatsapp_opt_in === true && (
                                    <div className="flex items-center justify-between gap-4 animate-in fade-in slide-in-from-top-2">
                                        <p className="text-[10px] text-emerald-400/80 leading-relaxed max-w-[200px]">
                                            Client wants to receive notifications via WhatsApp.
                                        </p>
                                        <button
                                            type="button"
                                            onClick={handleTestMessage}
                                            disabled={testLoading}
                                            className="px-4 py-2 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 border border-emerald-500/30 rounded-lg text-xs font-bold transition-all flex items-center gap-2"
                                        >
                                            {testLoading ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                                            Test
                                        </button>
                                    </div>
                                )}
                            </div>

                            <div className="pt-2 flex gap-3">
                                <button
                                    type="button"
                                    onClick={onClose}
                                    className="flex-1 py-3 rounded-xl bg-surface border border-white/5 text-slate-400 font-bold hover:text-white transition-all text-sm"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="flex-[2] py-3 rounded-xl bg-primary hover:bg-indigo-600 text-white font-bold transition-all flex items-center justify-center gap-2 shadow-lg shadow-primary/20 text-sm"
                                >
                                    {loading ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                                    Save Changes
                                </button>
                            </div>
                        </form>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    )
}

export default EditClientModal
