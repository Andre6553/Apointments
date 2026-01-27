import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext({})

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null)
    const [profile, setProfile] = useState(null)
    const [loading, setLoading] = useState(true)
    const [connectionError, setConnectionError] = useState(null)

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

    const fetchProfile = async (userId) => {
        // 1. Set Status Online
        supabase.from('profiles').update({ is_online: true }).eq('id', userId).then(({ error }) => {
            if (error) console.error('Failed to set online status:', error)
        })

        // 2. Fetch Data (including subscription)
        const { data, error } = await supabase
            .from('profiles')
            .select(`
                *,
                business:businesses!profiles_business_id_fkey(name, owner_id),
                subscription:subscriptions(tier, role, status, expires_at)
            `)
            .eq('id', userId)
            .single()

        if (data) {
            // Flatten subscription if it exists (it's a 1-to-1 but Supabase returns array)
            const profileData = {
                ...data,
                subscription: data.subscription?.[0] || null
            }
            setProfile(profileData)
        }
    }

    const updateProfile = async (updates) => {
        if (!user) return
        const { error } = await supabase
            .from('profiles')
            .update(updates)
            .eq('id', user.id)
        if (error) throw error
        setProfile(prev => ({ ...prev, ...updates }))
    }

    const signOut = async () => {
        if (user) {
            await supabase.from('profiles').update({ is_online: false }).eq('id', user.id)
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
        <AuthContext.Provider value={{ user, profile, loading, connectionError, signOut, fetchProfile, updateProfile, verifyPassword }}>
            {children}
        </AuthContext.Provider>
    )
}

export const useAuth = () => useContext(AuthContext)
