import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext({})

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null)
    const [profile, setProfile] = useState(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        let isMounted = true

        // Timeout fallback - if Supabase doesn't respond in 15 seconds, proceed anyway
        const timeoutId = setTimeout(() => {
            if (isMounted && loading) {
                console.warn('Auth check timed out - proceeding without session')
                setLoading(false)
            }
        }, 15000)

        // Check active sessions and sets the user
        supabase.auth.getSession()
            .then(({ data: { session } }) => {
                if (isMounted) {
                    setUser(session?.user ?? null)
                    if (session?.user) fetchProfile(session.user.id)
                    setLoading(false)
                }
            })
            .catch((err) => {
                console.error("Auth session check failed:", err)
                if (isMounted) {
                    setUser(null)
                    setLoading(false)
                }
            })

        // Listen for changes on auth state (logged in, signed out, etc.)
        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
            if (isMounted) {
                setUser(session?.user ?? null)
                if (session?.user) {
                    await fetchProfile(session.user.id)
                } else {
                    setProfile(null)
                }
                setLoading(false)
            }
        })

        return () => {
            isMounted = false
            clearTimeout(timeoutId)
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
