import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './useAuth';

export const useWorkloadAlerts = () => {
    const { user, profile } = useAuth();
    const [alerts, setAlerts] = useState([]);
    const [loading, setLoading] = useState(true);

    const fetchAlerts = async () => {
        if (!user) return;
        try {
            // We fetch all pending today and filter in JS for the complex percentage logic
            let query = supabase
                .from('appointments')
                .select('*, client:clients(first_name, last_name)')
                .eq('status', 'pending');

            if (profile?.role !== 'admin') {
                query = query.eq('assigned_profile_id', user.id);
            }

            const { data, error } = await query;

            if (!error && data) {
                // Dynamic Threshold Logic: 25% of duration, Minimum 10 mins
                const alertedApts = data.filter(apt => {
                    const threshold = Math.max(10, Math.floor(apt.duration_minutes * 0.25));
                    return apt.delay_minutes > threshold;
                });
                setAlerts(alertedApts);
            }
        } catch (err) {
            console.error('Error fetching workload alerts:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (!user) return;
        fetchAlerts();

        const channel = supabase.channel('workload-alerts')
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'appointments'
            }, () => fetchAlerts())
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [user, profile?.role]);

    return { alerts, count: alerts.length, loading, refresh: fetchAlerts };
};
