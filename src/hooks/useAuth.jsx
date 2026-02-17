import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { getCache, setCache, CACHE_KEYS } from '../lib/cache'

const AuthContext = createContext({})

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null)
    const [profile, setProfile] = useState(null)
    const [settings, setSettings] = useState({}) // Global App Settings
    const [loading, setLoading] = useState(true)
    const [connectionError, setConnectionError] = useState(null)

    // ... (omitting unchanged useEffects for brevity in instruction, will be careful with replacement) ...

    const fetchProfile = async (userId) => {
        // Optimistic Load
        const cached = getCache(CACHE_KEYS.PROFILE)
        if (cached) setProfile(cached)

        // 1. Set Status Online
        supabase.from('profiles').update({ is_online: true }).eq('id', userId).then(({ error }) => {
            if (error) console.error('Failed to set online status:', error)
        })

        // 2a. Fetch Global Settings & Profile
        const [settingsResult, profileResult] = await Promise.all([
            supabase.from('app_settings').select('*'),
            supabase
                .from('profiles')
                .select(`
                *,
                business:businesses!profiles_business_id_fkey(name, owner_id, special_plan_active, special_plan_limit, special_plan_price, special_plan_updated_at),
                subscription:subscriptions(tier, role, status, expires_at)
            `)
                .eq('id', userId)
                .single()
        ]);

        const settingsData = settingsResult.data;
        const { data, error } = profileResult;

        // Process Settings
        const globalSettings = {};
        if (settingsData) {
            settingsData.forEach(s => globalSettings[s.key] = s.value);
            setSettings(globalSettings);
        }

        if (data) {
            // Flatten subscription if it exists
            // CRITIAL FIX: Sort by expiry to ensure we grab the LATEST/ACTIVE one, not an old expired one
            let sortedSubs = data.subscription?.sort((a, b) =>
                new Date(b.expires_at || 0) - new Date(a.expires_at || 0)
            ) || [];

            // ---------------------------------------------------------
            // SPECIAL SUBSCRIPTION LOGIC (Seniority Based Slot System)
            // ---------------------------------------------------------
            // ---------------------------------------------------------
            // SPECIAL SUBSCRIPTION LOGIC (Seniority Based Slot System)
            // ---------------------------------------------------------
            if (data.business?.special_plan_active) {
                try {
                    // 1. Check if the Business Owner has an active Special subscription record
                    const { data: ownerSub } = await supabase
                        .from('subscriptions')
                        .select('tier, status, expires_at')
                        .eq('profile_id', data.business.owner_id)
                        .eq('tier', 'special_admin')
                        .eq('status', 'active')
                        .gt('expires_at', new Date().toISOString())
                        .maybeSingle(); // Use maybeSingle to avoid errors if missing

                    // 2. Get all staff for this business sorted by join date
                    const { data: staffMembers } = await supabase
                        .from('profiles')
                        .select('id, created_at')
                        .eq('business_id', data.business_id)
                        .order('created_at', { ascending: true }); // Oldest first

                    // 3. Find my rank
                    const myRank = staffMembers?.findIndex(p => p.id === userId);

                    // Use Business Specific Limit OR Global Default
                    const limit = data.business.special_plan_limit ?? globalSettings.limit_special?.default ?? 5;

                    // 4. Calculate Expiry for Manually Enabled Plan (30 days from activation/update)
                    const activationDate = new Date(data.business.special_plan_updated_at || data.business.created_at);
                    const manualExpiry = new Date(activationDate.getTime() + 30 * 24 * 60 * 60 * 1000);
                    const expiresAt = ownerSub?.expires_at || manualExpiry.toISOString();

                    // 5. If I am within the limit AND the plan hasn't expired (including 24h grace period)
                    const AMNESTY_WINDOW = 24 * 60 * 60 * 1000;
                    const isWithinAmnesty = new Date(expiresAt).getTime() + AMNESTY_WINDOW > new Date().getTime();

                    if (myRank !== -1 && myRank < limit && isWithinAmnesty) {
                        const virtualSub = {
                            tier: 'special_admin',
                            status: 'active',
                            role: data.role,
                            expires_at: expiresAt,
                            is_virtual: true
                        };
                        // Unshift to make it the primary subscription
                        sortedSubs.unshift(virtualSub);
                    }
                } catch (err) {
                    console.error('Error calculating special plan eligibility:', err);
                }
            }

            const profileData = {
                ...data,
                subscription: sortedSubs[0] || null
            }
            setProfile(profileData)
            setCache(CACHE_KEYS.PROFILE, profileData)
        }
    }

    const updateProfile = async (updates) => {
        if (!user) return
        const { error } = await supabase
            .from('profiles')
            .update(updates)
            .eq('id', user.id)
        if (error) throw error

        setProfile(prev => {
            const newer = { ...prev, ...updates }
            setCache(CACHE_KEYS.PROFILE, newer)
            return newer
        })
    }
    useEffect(() => {
        let mounted = true
        let initFinished = false

        // 1. Safety Valve: If initialization takes too long, we declare failure
        const totalTimeout = setTimeout(() => {
            if (mounted && loading && !initFinished) {
                console.error("Auth initialization total timeout")
                setConnectionError("The server is taking too long to respond. Please check your internet connection.")
                setLoading(false)
            }
        }, 12000)

        const startInit = async () => {
            try {
                const supabaseUrl = import.meta.env.VITE_SUPABASE_URL

                // PHASE 1: Raw Network Reachability (The "Truth" check)
                try {
                    const controller = new AbortController()
                    const pingTimeout = setTimeout(() => controller.abort(), 6000)

                    const res = await fetch(`${supabaseUrl}/auth/v1/health`, {
                        method: 'GET',
                        signal: controller.signal,
                        headers: { 'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY }
                    })
                    clearTimeout(pingTimeout)

                    // If we get a response (200 or 401), the server is reachable
                    if (res.status === 200 || res.status === 401) {
                        console.log("Supabase connectivity verified")
                    } else {
                        throw new Error(`Connectivity check returned ${res.status}`)
                    }
                } catch (e) {
                    if (mounted) {
                        console.error("Network verification failed:", e)
                        setConnectionError("Network Error: Cannot reach Supabase servers. Please check your ISP or VPN.")
                        setLoading(false)
                        return
                    }
                }

                if (!mounted) return

                // PHASE 2: Auth Client Initialization
                const sessionPromise = supabase.auth.getSession()
                const timeoutPromise = new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Auth client unresponsive')), 4000)
                )

                try {
                    const { data: { session }, error } = await Promise.race([sessionPromise, timeoutPromise])
                    if (error) throw error

                    if (mounted) {
                        setUser(session?.user ?? null)
                        if (session?.user) fetchProfile(session.user.id).catch(console.error)
                    }
                } catch (err) {
                    console.warn("Auth check slow or failed, relying on background listener:", err)
                }

                if (mounted) {
                    initFinished = true
                    setLoading(false)
                }

            } catch (error) {
                console.error("Unexpected Auth Init error:", error)
                if (mounted) setLoading(false)
            }
        }

        // 3. Real-time listener
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            if (mounted) {
                setUser(session?.user ?? null)
                if (session?.user) fetchProfile(session.user.id).catch(console.error)
                else setProfile(null)

                setConnectionError(null)
                setLoading(false)
                initFinished = true
            }
        })

        startInit()

        return () => {
            mounted = false
            clearTimeout(totalTimeout)
            subscription.unsubscribe()
        }
    }, [])

    // Heartbeat: Update last_seen every 30 seconds
    useEffect(() => {
        if (!user) return

        const sendHeartbeat = async () => {
            await supabase.from('profiles').update({ last_seen: new Date().toISOString(), is_online: true }).eq('id', user.id)
        }

        sendHeartbeat() // Initial ping
        const interval = setInterval(sendHeartbeat, 30000)

        return () => clearInterval(interval)
    }, [user])

    // Handle Window Close / Tab Close
    useEffect(() => {
        const handleUnload = async () => {
            if (user?.id) {
                console.log('Marking offline...')
                await supabase.from('profiles').update({ is_online: false, active_chat_id: null }).eq('id', user.id)
            }
        }

        window.addEventListener('beforeunload', handleUnload)
        return () => window.removeEventListener('beforeunload', handleUnload)
    }, [user])

    const signOut = async () => {
        if (user) {
            // Updated to also clear active_chat_id
            await supabase.from('profiles').update({ is_online: false, active_chat_id: null }).eq('id', user.id)
        }
        return supabase.auth.signOut()
    }

    const verifyPassword = async (password) => {
        if (!user?.email) return false
        const { error } = await supabase.auth.signInWithPassword({
            email: user.email,
            password
        })
        return !error
    }

    return (
        <AuthContext.Provider value={{ user, profile, settings, loading, connectionError, signOut, fetchProfile, updateProfile, verifyPassword }}>
            {children}
        </AuthContext.Provider>
    )
}

export const useAuth = () => useContext(AuthContext)
