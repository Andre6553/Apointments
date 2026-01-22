import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '../hooks/useAuth'
import { Mail, Lock, User, Briefcase, ChevronRight, LogIn, UserPlus } from 'lucide-react'

const Auth = () => {
    const [loading, setLoading] = useState(false)
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [isSignUp, setIsSignUp] = useState(false)
    const [fullName, setFullName] = useState('')
    const [role, setRole] = useState('Provider')

    const handleAuth = async (e) => {
        e.preventDefault()
        setLoading(true)

        try {
            if (isSignUp) {
                const { data: { user }, error } = await supabase.auth.signUp({
                    email,
                    password,
                })
                if (error) throw error

                if (user) {
                    const { error: profileError } = await supabase
                        .from('profiles')
                        .insert([{ id: user.id, email, full_name: fullName, role }])
                    if (profileError) throw profileError
                }
                alert('Success! Please confirm your email.')
            } else {
                const { error } = await supabase.auth.signInWithPassword({
                    email,
                    password,
                })
                if (error) throw error
            }
        } catch (error) {
            alert(error.message)
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="relative min-h-screen w-full bg-[#020617] flex items-center justify-center p-4 overflow-hidden">
            {/* Background Decorative Elements */}
            <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-600/10 rounded-full blur-[120px]" />
            <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-emerald-600/10 rounded-full blur-[120px]" />

            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="relative w-full max-w-md z-10"
            >
                <div className="text-center mb-10">
                    <motion.div
                        initial={{ y: -20 }}
                        animate={{ y: 0 }}
                        className="inline-block p-4 rounded-3xl bg-blue-600/10 border border-blue-500/20 mb-6"
                    >
                        <Briefcase className="w-8 h-8 text-blue-400" />
                    </motion.div>
                    <h1 className="text-4xl font-extrabold tracking-tight text-white mb-2">
                        B.L.A.S.T. <span className="bg-gradient-to-r from-blue-400 to-emerald-400 bg-clip-text text-transparent text-shadow-glow">Tracker</span>
                    </h1>
                    <p className="text-slate-400">Professional Appointment Management</p>
                </div>

                <div className="bg-slate-900/40 backdrop-blur-2xl border border-white/5 rounded-[2.5rem] p-8 md:p-10 shadow-3xl">
                    <div className="flex bg-slate-800/50 p-1.5 rounded-2xl mb-8">
                        <button
                            onClick={() => setIsSignUp(false)}
                            className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold transition-all ${!isSignUp ? 'bg-slate-700 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
                        >
                            <LogIn size={18} /> Sign In
                        </button>
                        <button
                            onClick={() => setIsSignUp(true)}
                            className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold transition-all ${isSignUp ? 'bg-slate-700 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
                        >
                            <UserPlus size={18} /> Sign Up
                        </button>
                    </div>

                    <form onSubmit={handleAuth} className="space-y-5">
                        <AnimatePresence mode="wait">
                            {isSignUp && (
                                <motion.div
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: 'auto' }}
                                    exit={{ opacity: 0, height: 0 }}
                                    className="space-y-5 overflow-hidden"
                                >
                                    <div className="space-y-2">
                                        <label className="text-sm font-semibold text-slate-300 ml-1">Full Name</label>
                                        <div className="relative">
                                            <User className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                                            <input
                                                type="text"
                                                value={fullName}
                                                onChange={(e) => setFullName(e.target.value)}
                                                className="w-full bg-slate-800/50 border border-slate-700 p-4 pl-12 rounded-2xl outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all text-white placeholder:text-slate-600"
                                                placeholder="Andre Johnson"
                                                required
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-sm font-semibold text-slate-300 ml-1">Specialty</label>
                                        <div className="relative">
                                            <Briefcase className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                                            <select
                                                value={role}
                                                onChange={(e) => setRole(e.target.value)}
                                                className="w-full bg-slate-800/50 border border-slate-700 p-4 pl-12 rounded-2xl outline-none focus:border-blue-500 transition-all text-white appearance-none cursor-pointer"
                                            >
                                                <option value="Provider">General Provider</option>
                                                <option value="Doctor">Doctor</option>
                                                <option value="Nail Artist">Nail Artist</option>
                                                <option value="Stylist">Stylist</option>
                                            </select>
                                        </div>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        <div className="space-y-2">
                            <label className="text-sm font-semibold text-slate-300 ml-1">Email Address</label>
                            <div className="relative">
                                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                                <input
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="w-full bg-slate-800/50 border border-slate-700 p-4 pl-12 rounded-2xl outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all text-white placeholder:text-slate-600"
                                    placeholder="andre@example.com"
                                    required
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-semibold text-slate-300 ml-1">Password</label>
                            <div className="relative">
                                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                                <input
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="w-full bg-slate-800/50 border border-slate-700 p-4 pl-12 rounded-2xl outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all text-white placeholder:text-slate-600"
                                    placeholder="••••••••"
                                    required
                                />
                            </div>
                        </div>

                        <button
                            disabled={loading}
                            className="w-full group relative flex items-center justify-center p-4 rounded-2xl bg-gradient-to-r from-blue-600 to-emerald-600 text-white font-bold hover:shadow-2xl hover:shadow-blue-500/20 active:scale-[0.98] transition-all disabled:opacity-50 mt-8"
                        >
                            {loading ? (
                                <div className="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                            ) : (
                                <>
                                    <span>{isSignUp ? 'Create My Account' : 'Sign Into Dashboard'}</span>
                                    <ChevronRight className="ml-2 group-hover:translate-x-1 transition-transform" size={20} />
                                </>
                            )}
                        </button>
                    </form>
                </div>

                <p className="text-center mt-8 text-slate-500 text-sm">
                    Protected by Supabase Security & RLS
                </p>
            </motion.div>
        </div>
    )
}

export default Auth
