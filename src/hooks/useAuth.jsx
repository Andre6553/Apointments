import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext({})

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null)
    const [profile, setProfile] = useState(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        let mounted = true

        // 1. Safety Valve: Force loading to false after 5s if nothing else works
        const safetyTimer = setTimeout(() => {
            if (mounted && loading) {
                console.warn("Auth check timed out - forcing app load")
                setLoading(false)
            }
        }, 5000)

        // 2. Async initialization
        const initAuth = async () => {
            try {
                // Check active session
                const { data: { session }, error } = await supabase.auth.getSession()
                if (error) throw error

                if (mounted && session?.user) {
                    setUser(session.user)
                    await fetchProfile(session.user.id)
                }
            } catch (error) {
                console.error("Auth Init Error (Offline likely):", error)
            } finally {
                // CRITICAL: Always turn off loading, success or fail
                if (mounted) setLoading(false)
            }
        }

        initAuth()

        // 3. Real-time listener
        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
            if (mounted) {
                setUser(session?.user ?? null)

                if (session?.user) {
                    await fetchProfile(session.user.id)
                } else {
                    setProfile(null)
                }

                // Also ensure loading is off here in case listener fires first
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
        <AuthContext.Provider value={{ user, profile, loading, signOut, fetchProfile }}>
            {children}
        </AuthContext.Provider>
    )
}

export const useAuth = () => useContext(AuthContext)
