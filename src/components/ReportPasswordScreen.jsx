import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Lock, Key, MessageSquare, Loader2, AlertTriangle, ShieldCheck, ArrowRight } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'

const ReportPasswordScreen = ({ onVerified }) => {
    const { verifyPassword, profile } = useAuth()
    const [password, setPassword] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState(null)
    const [recoveryStatus, setRecoveryStatus] = useState('idle') // idle, sending, sent, error

    const handleSubmit = async (e) => {
        e.preventDefault()
        setLoading(true)
        setError(null)

        const isValid = await verifyPassword(password)
        if (isValid) {
            onVerified()
        } else {
            setError('Incorrect credentials. Access denied.')
            setLoading(false)
        }
    }

    const handleForgotPassword = async () => {
        setRecoveryStatus('sending')
        try {
            const message = `🔐 *REPORT ACCESS RECOVERY*\n\nHello ${profile?.full_name},\n\nYou requested access to your Reports. Since this page is protected, please use your login password to unlock it.\n\n*If you forgot your login password*, you can reset it here: ${window.location.origin}/reset-password\n\n_Security: This request was triggered from the Reports page._`

            const response = await fetch('http://localhost:3001/send-whatsapp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    to: profile?.whatsapp || profile?.phone,
                    message
                })
            })

            if (!response.ok) throw new Error('Recovery failed')

            setRecoveryStatus('sent')
            setTimeout(() => setRecoveryStatus('idle'), 5000)
        } catch (err) {
            console.error('WhatsApp Error:', err)
            setRecoveryStatus('error')
        }
    }

    return (
        <div className="min-h-[70vh] flex items-center justify-center p-6">
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="w-full max-w-md glass-card border-white/10 shadow-2xl relative overflow-hidden"
            >
                {/* Background Decor */}
                <div className="absolute top-0 right-0 p-8 opacity-5">
                    <ShieldCheck size={160} />
                </div>

                <div className="p-8 text-center relative z-10">
                    <div className="w-16 h-16 bg-primary/20 text-primary rounded-2xl flex items-center justify-center mx-auto mb-6 border border-primary/20 shadow-lg shadow-primary/10">
                        <Lock size={32} />
                    </div>

                    <h2 className="text-2xl font-heading font-black text-white mb-2 uppercase tracking-tight">Access Restricted</h2>
                    <p className="text-slate-500 text-sm font-medium mb-8 leading-relaxed px-4">
                        This section contains sensitive financial data. Please verify your identity to proceed.
                    </p>

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="relative group">
                            <Key size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-primary transition-colors" />
                            <input
                                type="password"
                                placeholder="Enter login password..."
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="glass-input w-full pl-12 h-14 font-bold"
                                required
                                autoFocus
                            />
                        </div>

                        <AnimatePresence mode="wait">
                            {error && (
                                <motion.div
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: 'auto' }}
                                    exit={{ opacity: 0, height: 0 }}
                                    className="flex items-center gap-2 text-rose-400 text-xs font-bold justify-center bg-rose-400/10 p-3 rounded-xl border border-rose-400/20"
                                >
                                    <AlertTriangle size={14} />
                                    {error}
                                </motion.div>
                            )}
                        </AnimatePresence>

                        <button
                            disabled={loading}
                            className="w-full bg-primary hover:bg-indigo-600 text-white h-14 rounded-xl font-bold shadow-lg shadow-primary/20 active:scale-[0.98] transition-all flex items-center justify-center gap-3 disabled:opacity-50"
                        >
                            {loading ? <Loader2 className="animate-spin" size={20} /> : (
                                <>
                                    <span>Verify & Unlock</span>
                                    <ArrowRight size={18} />
                                </>
                            )}
                        </button>
                    </form>

                    <div className="mt-8 pt-6 border-t border-white/5">
                        <button
                            onClick={handleForgotPassword}
                            disabled={recoveryStatus !== 'idle'}
                            className={`flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-widest transition-all ${recoveryStatus === 'sent' ? 'text-emerald-400' :
                                    recoveryStatus === 'error' ? 'text-rose-400' :
                                        'text-slate-500 hover:text-white'
                                }`}
                        >
                            {recoveryStatus === 'sending' ? <Loader2 size={14} className="animate-spin" /> : <MessageSquare size={14} />}
                            {recoveryStatus === 'sending' ? 'Sending Code...' :
                                recoveryStatus === 'sent' ? 'Recovery details sent to WhatsApp!' :
                                    recoveryStatus === 'error' ? 'Failed to send WhatsApp. Try again.' :
                                        'Forgot Password? Get recovery link via WhatsApp'}
                        </button>
                    </div>
                </div>
            </motion.div>
        </div>
    )
}

export default ReportPasswordScreen
