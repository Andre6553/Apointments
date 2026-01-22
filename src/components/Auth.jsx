import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { motion, AnimatePresence } from 'framer-motion';
import { Mail, Lock, User, Briefcase, ChevronRight, LogIn, UserPlus, Sparkles } from 'lucide-react';

const Auth = () => {
    const [loading, setLoading] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isSignUp, setIsSignUp] = useState(false);
    const [fullName, setFullName] = useState('');
    const [role, setRole] = useState('Provider');

    const handleAuth = async (e) => {
        e.preventDefault();
        setLoading(true);

        try {
            if (isSignUp) {
                const { data: { user }, error } = await supabase.auth.signUp({
                    email,
                    password,
                    options: {
                        data: {
                            full_name: fullName,
                            role: role
                        }
                    }
                });
                if (error) throw error;

                alert('Success! Please confirm your email.');
            } else {
                const { error } = await supabase.auth.signInWithPassword({
                    email,
                    password,
                });
                if (error) throw error;
            }
        } catch (error) {
            alert(error.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="relative min-h-screen w-full flex items-center justify-center p-4 overflow-hidden">
            {/* Background Decorative Elements */}
            <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-primary/20 rounded-full blur-[120px] mix-blend-screen" />
            <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-secondary/10 rounded-full blur-[120px] mix-blend-screen" />

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="relative w-full max-w-md z-10"
            >
                <div className="text-center mb-10">
                    <motion.div
                        initial={{ scale: 0.8 }}
                        animate={{ scale: 1 }}
                        className="relative inline-block p-4 rounded-3xl bg-gradient-to-br from-primary to-indigo-600 shadow-2xl shadow-primary/30 mb-6 group"
                    >
                        <User className="w-8 h-8 text-white relative z-10" />
                        <div className="absolute inset-0 bg-white/20 blur-lg rounded-3xl opacity-0 group-hover:opacity-100 transition-opacity" />
                    </motion.div>
                    <h1 className="text-4xl font-heading font-extrabold tracking-tight text-white mb-2">
                        Appointment <span className="bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">Tracker</span>
                    </h1>
                    <div className="flex items-center justify-center gap-2 text-slate-400 text-sm font-medium tracking-wide uppercase">
                        <Sparkles size={14} className="text-primary" />
                        Professional Schedule Management
                        <Sparkles size={14} className="text-secondary" />
                    </div>
                </div>

                <div className="glass-card p-8 md:p-10 border-t-white/10 border-l-white/10 shadow-2xl">
                    <div className="flex bg-surface p-1.5 rounded-2xl mb-8 border border-white/5">
                        <button
                            onClick={() => setIsSignUp(false)}
                            className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold transition-all ${!isSignUp ? 'bg-primary text-white shadow-lg shadow-primary/25' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
                        >
                            <LogIn size={18} /> Sign In
                        </button>
                        <button
                            onClick={() => setIsSignUp(true)}
                            className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold transition-all ${isSignUp ? 'bg-primary text-white shadow-lg shadow-primary/25' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
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
                                        <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">Full Name</label>
                                        <div className="relative group">
                                            <User className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-primary transition-colors" size={18} />
                                            <input
                                                type="text"
                                                name="fullName"
                                                autoComplete="name"
                                                value={fullName}
                                                onChange={(e) => setFullName(e.target.value)}
                                                className="glass-input w-full pl-12"
                                                placeholder="John Doe"
                                                required
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">Account Role</label>
                                        <div className="relative group">
                                            <Briefcase className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-primary transition-colors" size={18} />
                                            <select
                                                value={role}
                                                onChange={(e) => setRole(e.target.value)}
                                                className="glass-input w-full pl-12 appearance-none cursor-pointer"
                                            >
                                                <option value="Provider">Service Provider</option>
                                                <option value="Admin">Administrator</option>
                                            </select>
                                            <ChevronRight className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 rotate-90 pointer-events-none" size={16} />
                                        </div>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        <div className="space-y-2">
                            <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">Email Address</label>
                            <div className="relative group">
                                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-primary transition-colors" size={18} />
                                <input
                                    type="email"
                                    name="email"
                                    autoComplete="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="glass-input w-full pl-12"
                                    placeholder="your@email.com"
                                    required
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">Password</label>
                            <div className="relative group">
                                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-primary transition-colors" size={18} />
                                <input
                                    type="password"
                                    name="password"
                                    autoComplete={isSignUp ? "new-password" : "current-password"}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="glass-input w-full pl-12"
                                    placeholder="••••••••"
                                    required
                                />
                            </div>
                        </div>

                        <button
                            disabled={loading}
                            className="w-full group relative flex items-center justify-center p-4 rounded-2xl bg-primary text-white font-bold hover:bg-indigo-600 hover:shadow-2xl hover:shadow-primary/20 active:scale-[0.98] transition-all disabled:opacity-50 mt-8 disabled:cursor-not-allowed"
                        >
                            {loading ? (
                                <div className="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                            ) : (
                                <>
                                    <span>{isSignUp ? 'Create Account' : 'Sign In'}</span>
                                    <ChevronRight className="ml-2 group-hover:translate-x-1 transition-transform" size={20} />
                                </>
                            )}
                        </button>
                    </form>
                </div>

                <p className="text-center mt-8 text-slate-500 text-[10px] uppercase tracking-widest">
                    Secured by Supabase Security & RLS
                </p>
            </motion.div>
        </div>
    );
};

export default Auth;
