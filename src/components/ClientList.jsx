import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Search, Plus, Trash2, Phone, Mail, User, AlertCircle, Loader2, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const ClientList = () => {
    const [clients, setClients] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showAdd, setShowAdd] = useState(false);
    const [search, setSearch] = useState('');
    const [newClient, setNewClient] = useState({ firstName: '', lastName: '', phone: '', email: '' });
    const [isSubmitting, setIsSubmitting] = useState(false);

    const fetchClients = async () => {
        setLoading(true);
        const { data: { user } } = await supabase.auth.getUser();
        const { data, error } = await supabase
            .from('clients')
            .select('*')
            .eq('owner_id', user.id)
            .order('created_at', { ascending: false });

        if (data) setClients(data);
        setLoading(false);
    };

    useEffect(() => {
        fetchClients();
    }, []);

    const handleAddClient = async (e) => {
        e.preventDefault();
        setIsSubmitting(true);

        try {
            const { data: { user } } = await supabase.auth.getUser();

            if (!user) {
                throw new Error('You must be logged in to add a client.');
            }

            const { error } = await supabase.from('clients').insert([{
                owner_id: user.id,
                first_name: newClient.firstName,
                last_name: newClient.lastName,
                phone: newClient.phone,
                email: newClient.email
            }]);

            if (error) throw error;

            setNewClient({ firstName: '', lastName: '', phone: '', email: '' });
            setShowAdd(false);
            fetchClients();
        } catch (error) {
            console.error('Error adding client:', error);
            alert(error.message || 'Failed to add client');
        } finally {
            setIsSubmitting(false);
        }
    };

    const deleteClient = async (id) => {
        if (!confirm('Are you sure you want to delete this client?')) return;
        const { error } = await supabase.from('clients').delete().eq('id', id);
        if (!error) fetchClients();
    };

    const filteredClients = clients.filter(c =>
        `${c.first_name} ${c.last_name}`.toLowerCase().includes(search.toLowerCase()) ||
        c.phone.includes(search)
    );

    return (
        <div className="space-y-8">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div className="relative w-full sm:max-w-md group">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-primary transition-colors" size={20} />
                    <input
                        placeholder="Search clients by name..."
                        className="glass-input w-full pl-12 py-3.5"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                    />
                </div>
                <button
                    onClick={() => setShowAdd(!showAdd)}
                    className="w-full sm:w-auto flex items-center justify-center gap-2 bg-primary hover:bg-indigo-600 text-white px-6 py-3.5 rounded-xl font-bold transition-all shadow-lg shadow-primary/25 active:scale-95 text-sm uppercase tracking-wide"
                >
                    {showAdd ? <><X size={18} /> Cancel</> : <><Plus size={18} /> Add Client</>}
                </button>
            </div>

            <AnimatePresence>
                {showAdd && (
                    <motion.div
                        initial={{ opacity: 0, height: 0, overflow: 'hidden' }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                    >
                        <div className="glass-card p-6 md:p-8 mb-4 border-l-4 border-l-primary bg-surface/30">
                            <h3 className="text-xl font-bold mb-8 flex items-center gap-3 font-heading text-white">
                                <div className="p-2 bg-primary/20 rounded-lg">
                                    <User size={24} className="text-primary" />
                                </div>
                                Add New Client
                            </h3>
                            <form onSubmit={handleAddClient} className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">First Name</label>
                                    <input
                                        placeholder="e.g. Sarah"
                                        className="glass-input w-full bg-slate-900/40"
                                        value={newClient.firstName}
                                        onChange={e => setNewClient({ ...newClient, firstName: e.target.value })}
                                        required
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">Last Name</label>
                                    <input
                                        placeholder="e.g. Connor"
                                        className="glass-input w-full bg-slate-900/40"
                                        value={newClient.lastName}
                                        onChange={e => setNewClient({ ...newClient, lastName: e.target.value })}
                                        required
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">WhatsApp / Phone</label>
                                    <input
                                        type="tel"
                                        placeholder="+27 82 123 4567"
                                        className="glass-input w-full bg-slate-900/40"
                                        value={newClient.phone}
                                        onChange={e => setNewClient({ ...newClient, phone: e.target.value })}
                                        required
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">Email <span className="text-slate-600">(Optional)</span></label>
                                    <input
                                        type="email"
                                        placeholder="client@example.com"
                                        className="glass-input w-full bg-slate-900/40"
                                        value={newClient.email}
                                        onChange={e => setNewClient({ ...newClient, email: e.target.value })}
                                    />
                                </div>
                                <button
                                    disabled={isSubmitting}
                                    className="md:col-span-2 bg-primary hover:bg-indigo-600 text-white py-4 rounded-xl font-bold transition-all flex items-center justify-center gap-2 shadow-lg shadow-primary/25 mt-2 hover:-translate-y-1"
                                >
                                    {isSubmitting ? <Loader2 className="animate-spin w-5 h-5" /> : 'Register Client'}
                                </button>
                            </form>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {loading ? (
                    <div className="col-span-full flex flex-col items-center py-24 text-slate-500">
                        <Loader2 className="w-12 h-12 animate-spin mb-6 text-primary" />
                        <p className="text-sm font-bold uppercase tracking-widest animate-pulse">Loading Directory...</p>
                    </div>
                ) : filteredClients.length === 0 ? (
                    <div className="col-span-full glass-card border-dashed border-white/10 p-24 text-center">
                        <div className="w-20 h-20 bg-surface/50 rounded-full flex items-center justify-center mx-auto mb-6 border border-white/5">
                            <AlertCircle className="text-slate-500" size={40} />
                        </div>
                        <h3 className="text-xl font-bold text-white mb-2">No clients found</h3>
                        <p className="text-slate-500">Try adjusting your search or add a new client.</p>
                    </div>
                ) : filteredClients.map(c => (
                    <motion.div
                        layout
                        key={c.id}
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="group relative glass-card p-6 hover:border-primary/30 transition-all duration-300 hover:shadow-glow group"
                    >
                        <div className="flex justify-between items-start mb-6">
                            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/20 to-indigo-500/10 flex items-center justify-center text-primary font-bold text-2xl border border-primary/20 group-hover:scale-105 transition-transform">
                                {c.first_name[0]}{c.last_name[0]}
                            </div>
                            <button
                                onClick={() => deleteClient(c.id)}
                                className="p-2.5 text-slate-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all rounded-xl hover:bg-red-500/10"
                            >
                                <Trash2 size={18} />
                            </button>
                        </div>

                        <h3 className="text-xl font-heading font-bold text-white mb-6 group-hover:text-primary transition-colors">{c.first_name} {c.last_name}</h3>

                        <div className="space-y-4">
                            <a href={`tel:${c.phone}`} className="flex items-center gap-4 text-slate-400 group/item hover:text-white transition-colors cursor-pointer p-2 hover:bg-white/5 rounded-lg -mx-2">
                                <div className="p-2 bg-surface rounded-lg group-hover/item:text-primary transition-colors border border-white/5">
                                    <Phone size={16} />
                                </div>
                                <span className="text-sm font-medium">{c.phone}</span>
                            </a>
                            {c.email && (
                                <a href={`mailto:${c.email}`} className="flex items-center gap-4 text-slate-400 group/item hover:text-white transition-colors cursor-pointer p-2 hover:bg-white/5 rounded-lg -mx-2">
                                    <div className="p-2 bg-surface rounded-lg group-hover/item:text-secondary transition-colors border border-white/5">
                                        <Mail size={16} />
                                    </div>
                                    <span className="text-sm font-medium truncate">{c.email}</span>
                                </a>
                            )}
                        </div>
                    </motion.div>
                ))}
            </div>
        </div>
    );
};

export default ClientList;
