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

        // 1. Safety Valve: If initialization takes too long, we assume connection failure
        const safetyTimer = setTimeout(() => {
            if (mounted && loading) {
                console.warn("Auth check timed out - assuming network blockage")
                setConnectionError("Connection timed out. Please check your internet or Supabase status.")
                setLoading(false)
            }
        }, 8000) // 8 seconds grace period

        // 2. Async initialization
        const initAuth = async () => {
            try {
                // Check active session
                const { data: { session }, error } = await supabase.auth.getSession()
                if (error) throw error

                if (mounted && session?.user) {
                    setUser(session.user)
                    // Fire-and-forget profile fetch
                    fetchProfile(session.user.id).catch(err => console.warn("Profile fetch warning:", err))
                }
            } catch (error) {
                console.error("Auth Init Error:", error)
                // If getSession throws (e.g. network error), we catch it here
                if (mounted) setConnectionError(error.message || "Failed to connect to authentication server")
            } finally {
                if (mounted) setLoading(false)
            }
        }

        initAuth()

        // 3. Real-time listener
        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
            if (mounted) {
                // If we get an event, connection is alive, so clear error
                setConnectionError(null)
                setUser(session?.user ?? null)

                if (session?.user) {
                    fetchProfile(session.user.id).catch(console.error)
                } else {
                    setProfile(null)
                }

                setLoading(false)
            }
        })

        return () => {
            mounted = false
            clearTimeout(safetyTimer)
            subscription.unsubscribe()
        }
    }, [])

    const fetchProfile = async (userId) => {
        const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', userId)
            .single()

        if (data) setProfile(data)
    }

    const signOut = () => supabase.auth.signOut()

    return (
        <AuthContext.Provider value={{ user, profile, loading, connectionError, signOut, fetchProfile }}>
            {children}
        </AuthContext.Provider>
    )
}

export const useAuth = () => useContext(AuthContext)
