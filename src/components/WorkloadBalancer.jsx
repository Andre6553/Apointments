import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { ArrowLeftRight, UserCheck, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { motion } from 'framer-motion'

const WorkloadBalancer = () => {
    const [delayedApts, setDelayedApts] = useState([])
    const [freeProviders, setFreeProviders] = useState([])
    const [loading, setLoading] = useState(true)

    const fetchData = async () => {
        setLoading(true)

        // 1. Find delayed appointments (delay > 15 mins)
        const { data: delayed } = await supabase
            .from('appointments')
            .select('*, client:clients(first_name, last_name), profile:profiles(full_name)')
            .gt('delay_minutes', 15)
            .eq('status', 'pending')

        if (delayed) setDelayedApts(delayed)

        // 2. Find providers who are currently FREE (no active appointment)
        const { data: allProviders } = await supabase
            .from('profiles')
            .select('*')

        const { data: activeApts } = await supabase
            .from('appointments')
            .select('assigned_profile_id')
            .eq('status', 'active')

        const busyIds = activeApts?.map(a => a.assigned_profile_id) || []
        const free = allProviders?.filter(p => !busyIds.includes(p.id)) || []

        setFreeProviders(free)
        setLoading(false)
    }

    useEffect(() => {
        fetchData()
    }, [])

    const shiftClient = async (aptId, newProviderId, oldProviderId) => {
        if (!confirm('Shift this client to the new provider?')) return

        const { error } = await supabase
            .from('appointments')
            .update({
                assigned_profile_id: newProviderId,
                shifted_from_id: oldProviderId,
                status: 'pending', // Reset status if it was changed
                notes: 'Shifted due to delay'
            })
            .eq('id', aptId)

        if (!error) {
            alert('Client successfully shifted!')
            fetchData()
        } else {
            alert(error.message)
        }
    }

    return (
        <div className="space-y-8">
            <div>
                <h2 className="text-2xl font-bold">Workload Balancer</h2>
                <p className="text-slate-500">Suggested shifts to resolve schedule delays</p>
            </div>

            {loading ? (
                <p>Analyzing system workload...</p>
            ) : delayedApts.length === 0 ? (
                <div className="bg-emerald-500/10 border border-emerald-500/20 p-8 rounded-3xl text-center">
                    <CheckCircle2 size={48} className="mx-auto text-emerald-400 mb-4" />
                    <p className="text-emerald-400 font-medium">All systems green. No significant delays detected.</p>
                </div>
            ) : (
                <div className="space-y-4">
                    {delayedApts.map(apt => (
                        <div key={apt.id} className="bg-slate-900 border border-white/5 p-6 rounded-3xl">
                            <div className="flex justify-between items-start mb-6">
                                <div className="flex items-center gap-4">
                                    <div className="bg-red-500/20 p-3 rounded-2xl">
                                        <AlertTriangle className="text-red-400" size={24} />
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-lg">{apt.client?.first_name} is waiting</h3>
                                        <p className="text-slate-500 text-sm">Assigned to {apt.profile?.full_name} • <span className="text-red-400">{apt.delay_minutes}m late</span></p>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-3">
                                <p className="text-xs font-bold uppercase tracking-wider text-slate-600">Available Alternatives</p>
                                {freeProviders.length === 0 ? (
                                    <p className="text-sm text-slate-500 italic">No free providers available at the moment.</p>
                                ) : freeProviders.map(provider => (
                                    provider.id !== apt.assigned_profile_id && (
                                        <div key={provider.id} className="flex justify-between items-center p-3 rounded-xl bg-white/5 hover:bg-white/10 transition-all border border-white/5">
                                            <div className="flex items-center gap-3">
                                                <UserCheck size={18} className="text-blue-400" />
                                                <span className="font-medium text-sm">{provider.full_name} ({provider.role})</span>
                                            </div>
                                            <button
                                                onClick={() => shiftClient(apt.id, provider.id, apt.assigned_profile_id)}
                                                className="bg-blue-600 hover:bg-blue-500 text-white text-xs px-4 py-2 rounded-lg font-bold flex items-center gap-2"
                                            >
                                                <ArrowLeftRight size={14} /> Shift Client
                                            </button>
                                        </div>
                                    )
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}

export default WorkloadBalancer
