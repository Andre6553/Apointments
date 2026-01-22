import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { Search, Plus, Trash2, Phone, Mail, User, AlertCircle, Loader2 } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

const ClientList = () => {
    const [clients, setClients] = useState([])
    const [loading, setLoading] = useState(true)
    const [showAdd, setShowAdd] = useState(false)
    const [search, setSearch] = useState('')
    const [newClient, setNewClient] = useState({ firstName: '', lastName: '', phone: '', email: '' })
    const [isSubmitting, setIsSubmitting] = useState(false)

    const fetchClients = async () => {
        setLoading(true)
        const { data: { user } } = await supabase.auth.getUser()
        const { data, error } = await supabase
            .from('clients')
            .select('*')
            .eq('owner_id', user.id)
            .order('created_at', { ascending: false })

        if (data) setClients(data)
        setLoading(false)
    }

    useEffect(() => {
        fetchClients()
    }, [])

    const handleAddClient = async (e) => {
        e.preventDefault()
        setIsSubmitting(true)
        const { data: { user } } = await supabase.auth.getUser()

        const { error } = await supabase.from('clients').insert([{
            owner_id: user.id,
            first_name: newClient.firstName,
            last_name: newClient.lastName,
            phone: newClient.phone,
            email: newClient.email
        }])

        if (!error) {
            setNewClient({ firstName: '', lastName: '', phone: '', email: '' })
            setShowAdd(false)
            fetchClients()
        } else {
            alert(error.message)
        }
        setIsSubmitting(false)
    }

    const deleteClient = async (id) => {
        if (!confirm('Are you sure you want to delete this client?')) return
        const { error } = await supabase.from('clients').delete().eq('id', id)
        if (!error) fetchClients()
    }

    const filteredClients = clients.filter(c =>
        `${c.first_name} ${c.last_name}`.toLowerCase().includes(search.toLowerCase()) ||
        c.phone.includes(search)
    )

    return (
        <div className="space-y-8">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                <div>
                    <h2 className="text-3xl font-extrabold text-white tracking-tight">Client Directory</h2>
                    <p className="text-slate-500 mt-1">Manage and track your client relationships</p>
                </div>
                <button
                    onClick={() => setShowAdd(!showAdd)}
                    className="w-full md:w-auto flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-6 py-4 rounded-[1.5rem] font-bold transition-all shadow-xl shadow-blue-600/20 active:scale-95"
                >
                    {showAdd ? <><X size={20} /> Cancel</> : <><Plus size={20} /> Add New Client</>}
                </button>
            </div>

            <AnimatePresence>
                {showAdd && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: -20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: -20 }}
                        className="bg-slate-900/50 backdrop-blur-xl border border-white/5 p-8 rounded-[2rem] shadow-2xl"
                    >
                        <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
                            <User size={20} className="text-blue-400" />
                            Client Registration
                        </h3>
                        <form onSubmit={handleAddClient} className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest ml-1">First Name</label>
                                <input
                                    placeholder="e.g. Sarah"
                                    className="w-full bg-slate-800/50 p-4 rounded-xl border border-slate-700 focus:border-blue-500 outline-none transition-all"
                                    value={newClient.firstName}
                                    onChange={e => setNewClient({ ...newClient, firstName: e.target.value })}
                                    required
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest ml-1">Last Name</label>
                                <input
                                    placeholder="e.g. Connor"
                                    className="w-full bg-slate-800/50 p-4 rounded-xl border border-slate-700 focus:border-blue-500 outline-none transition-all"
                                    value={newClient.lastName}
                                    onChange={e => setNewClient({ ...newClient, lastName: e.target.value })}
                                    required
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest ml-1">WhatsApp / Phone</label>
                                <input
                                    type="tel"
                                    placeholder="+27 82 123 4567"
                                    className="w-full bg-slate-800/50 p-4 rounded-xl border border-slate-700 focus:border-blue-500 outline-none transition-all"
                                    value={newClient.phone}
                                    onChange={e => setNewClient({ ...newClient, phone: e.target.value })}
                                    required
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest ml-1">Email (Optional)</label>
                                <input
                                    type="email"
                                    placeholder="sarah@example.com"
                                    className="w-full bg-slate-800/50 p-4 rounded-xl border border-slate-700 focus:border-blue-500 outline-none transition-all"
                                    value={newClient.email}
                                    onChange={e => setNewClient({ ...newClient, email: e.target.value })}
                                />
                            </div>
                            <button
                                disabled={isSubmitting}
                                className="md:col-span-2 bg-gradient-to-r from-blue-600 to-emerald-600 hover:shadow-lg hover:shadow-blue-500/20 py-4 rounded-xl font-bold transition-all flex items-center justify-center gap-2"
                            >
                                {isSubmitting ? <Loader2 className="animate-spin" /> : 'Register Client'}
                            </button>
                        </form>
                    </motion.div>
                )}
            </AnimatePresence>

            <div className="relative group">
                <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-blue-400 transition-colors" size={20} />
                <input
                    placeholder="Search by name or phone number..."
                    className="w-full bg-slate-900/50 border border-white/5 p-5 pl-14 rounded-[1.5rem] outline-none focus:border-blue-500/50 transition-all text-lg shadow-inner"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {loading ? (
                    <div className="col-span-full flex flex-col items-center py-20 text-slate-500">
                        <Loader2 className="w-10 h-10 animate-spin mb-4" />
                        <p>Loading directory...</p>
                    </div>
                ) : filteredClients.length === 0 ? (
                    <div className="col-span-full border border-dashed border-white/10 rounded-[2rem] p-20 text-center">
                        <AlertCircle className="mx-auto text-slate-700 mb-4" size={48} />
                        <p className="text-slate-500">No clients found matching your search.</p>
                    </div>
                ) : filteredClients.map(c => (
                    <motion.div
                        layout
                        key={c.id}
                        className="group relative bg-slate-900/40 hover:bg-slate-800/50 border border-white/5 p-6 rounded-[2rem] transition-all hover:shadow-2xl hover:border-white/10"
                    >
                        <div className="flex justify-between items-start mb-6">
                            <div className="w-14 h-14 rounded-2xl bg-blue-600/10 flex items-center justify-center text-blue-400 font-bold text-xl border border-blue-500/10">
                                {c.first_name[0]}{c.last_name[0]}
                            </div>
                            <button
                                onClick={() => deleteClient(c.id)}
                                className="p-2 text-slate-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                            >
                                <Trash2 size={18} />
                            </button>
                        </div>

                        <h3 className="text-xl font-bold mb-4">{c.first_name} {c.last_name}</h3>

                        <div className="space-y-3">
                            <div className="flex items-center gap-3 text-slate-400 hover:text-blue-400 transition-colors cursor-pointer group/row">
                                <div className="p-2 bg-slate-800/50 rounded-lg group-hover/row:bg-blue-500/20 transition-all">
                                    <Phone size={14} className="group-hover/row:scale-110 transition-transform" />
                                </div>
                                <span className="text-sm font-medium">{c.phone}</span>
                            </div>
                            {c.email && (
                                <div className="flex items-center gap-3 text-slate-400 hover:text-emerald-400 transition-colors cursor-pointer group/row">
                                    <div className="p-2 bg-slate-800/50 rounded-lg group-hover/row:bg-emerald-500/20 transition-all">
                                        <Mail size={14} className="group-hover/row:scale-110 transition-transform" />
                                    </div>
                                    <span className="text-sm font-medium truncate">{c.email}</span>
                                </div>
                            )}
                        </div>
                    </motion.div>
                ))}
            </div>
        </div>
    )
}

export default ClientList
