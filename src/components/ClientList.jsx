import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Search, Plus, Trash2, Phone, Mail, User, AlertCircle, Loader2, X, Edit2, MessageCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../hooks/useAuth';
import EditClientModal from './EditClientModal';

const ClientList = () => {
    const [clients, setClients] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showAdd, setShowAdd] = useState(false);
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(0);
    const [hasMore, setHasMore] = useState(true);
    const [newClient, setNewClient] = useState({ firstName: '', lastName: '', phone: '', email: '' });
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [editingClient, setEditingClient] = useState(null);
    const [isEditOpen, setIsEditOpen] = useState(false);
    const [debouncedSearch, setDebouncedSearch] = useState('');

    const { profile } = useAuth();
    const PAGE_SIZE = 20;

    // Debounce search input
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearch(search);
            setPage(0); // Reset page on new search
        }, 500);
        return () => clearTimeout(timer);
    }, [search]);

    const fetchClients = async (isLoadMore = false) => {
        setLoading(true);
        try {
            let query = supabase
                .from('clients')
                .select('*')
                .order('created_at', { ascending: false })
                .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

            if (debouncedSearch) {
                // Server-side search
                const term = `%${debouncedSearch}%`;
                query = query.or(`first_name.ilike.${term},last_name.ilike.${term},phone.ilike.${term}`);
            }

            const { data, error } = await query;
            if (error) throw error;

            if (isLoadMore) {
                setClients(prev => [...prev, ...(data || [])]);
            } else {
                setClients(data || []);
            }

            setHasMore((data || []).length === PAGE_SIZE);
        } catch (err) {
            console.error('Error fetching clients:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        // Fetch only when page, debouncedSearch changes
        fetchClients(page > 0);
    }, [page, debouncedSearch]);

    const handleLoadMore = () => {
        setPage(prev => prev + 1);
    };

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
            // Reset and refetch
            setPage(0);
            if (page === 0) fetchClients();
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
        if (!error) {
            // Remove from local state to avoid refetch
            setClients(prev => prev.filter(c => c.id !== id));
        }
    };

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
                {loading && page === 0 ? (
                    <div className="col-span-full flex flex-col items-center py-24 text-slate-500">
                        <Loader2 className="w-12 h-12 animate-spin mb-6 text-primary" />
                        <p className="text-sm font-bold uppercase tracking-widest animate-pulse">Loading Directory...</p>
                    </div>
                ) : clients.length === 0 ? (
                    <div className="col-span-full glass-card border-dashed border-white/10 p-24 text-center">
                        <div className="w-20 h-20 bg-surface/50 rounded-full flex items-center justify-center mx-auto mb-6 border border-white/5">
                            <AlertCircle className="text-slate-500" size={40} />
                        </div>
                        <h3 className="text-xl font-bold text-white mb-2">No clients found</h3>
                        <p className="text-slate-500">Try adjusting your search or add a new client.</p>
                    </div>
                ) : (
                    <>
                        {clients.map(c => (
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

                                    {/* WhatsApp Status Indicator */}
                                    <div className="flex items-center gap-4 text-slate-400 p-2 -mx-2 bg-white/[0.02] rounded-xl border border-white/5">
                                        <div className={`p-2 rounded-lg border border-white/5 ${c.whatsapp_opt_in === true ? 'bg-emerald-500/10 text-emerald-400' :
                                            c.whatsapp_opt_in === false ? 'bg-rose-500/10 text-rose-400' :
                                                'bg-surface text-slate-500'
                                            }`}>
                                            <MessageCircle size={16} className={c.whatsapp_opt_in === null ? 'opacity-50' : ''} />
                                        </div>
                                        <div className="flex flex-col">
                                            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">WhatsApp Status</span>
                                            <span className={`text-xs font-bold ${c.whatsapp_opt_in === true ? 'text-emerald-400' :
                                                c.whatsapp_opt_in === false ? 'text-rose-400' :
                                                    'text-slate-500'
                                                }`}>
                                                {c.whatsapp_opt_in === true ? 'Opted In' :
                                                    c.whatsapp_opt_in === false ? 'Opted Out' : 'Not Set'}
                                            </span>
                                        </div>
                                        <button
                                            onClick={() => {
                                                setEditingClient(c)
                                                setIsEditOpen(true)
                                            }}
                                            className="ml-auto text-xs font-bold text-primary hover:text-white hover:underline decoration-primary underline-offset-4"
                                        >
                                            Manage
                                        </button>
                                    </div>
                                </div>
                            </motion.div>
                        ))}
                    </>
                )}
            </div>

            {hasMore && !loading && clients.length > 0 && (
                <div className="flex justify-center pt-4">
                    <button
                        onClick={handleLoadMore}
                        className="px-8 py-3 bg-surface hover:bg-white/5 text-slate-400 hover:text-white border border-white/5 rounded-xl font-bold transition-all flex items-center gap-2 mb-8"
                    >
                        Load More Clients
                    </button>
                </div>
            )}

            {loading && page > 0 && (
                <div className="flex justify-center py-8">
                    <Loader2 className="w-8 h-8 animate-spin text-primary" />
                </div>
            )}

            <EditClientModal
                isOpen={isEditOpen}
                onClose={() => { setIsEditOpen(false); setEditingClient(null) }}
                client={editingClient}
                onUpdate={fetchClients}
            />
        </div>
    );
};

export default ClientList;
