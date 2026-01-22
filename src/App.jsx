import { useState, useEffect } from 'react'
import { AuthProvider, useAuth } from './hooks/useAuth'
import Auth from './components/Auth'
import Dashboard from './components/Dashboard'

function AppContent() {
    const { user, loading } = useAuth()
    const [forceShow, setForceShow] = useState(false)

    useEffect(() => {
        // Ultimate fail-safe: if loading stuck for >6s, show app anyway
        const timer = setTimeout(() => setForceShow(true), 6000)
        return () => clearTimeout(timer)
    }, [])

    const [connectionStatus, setConnectionStatus] = useState('Checking connection...')

    useEffect(() => {
        // Diagnostic: Check if we can actually reach Supabase
        const checkConnection = async () => {
            try {
                const url = import.meta.env.VITE_SUPABASE_URL
                if (!url) {
                    setConnectionStatus('Error: Missing VITE_SUPABASE_URL')
                    return
                }

                const start = Date.now()
                // Simple fetch to the project URL (usually returns 404 but proves connectivity)
                // Or checking /auth/v1/health if available
                const res = await fetch(`${url}/auth/v1/health`, { method: 'GET' })
                const ms = Date.now() - start

                if (res.ok || res.status === 200) {
                    setConnectionStatus(`Connected (${ms}ms)`)
                } else {
                    setConnectionStatus(`Connected but unexpected status: ${res.status}`)
                }
            } catch (error) {
                console.error("Connection Check Failed:", error)
                setConnectionStatus(`❌ Network Blocked: ${error.message}`)
            }
        }
        checkConnection()
    }, [])

    if (loading && !forceShow) return (
        <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center gap-4">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
            <p className="text-slate-500 text-sm animate-pulse">Initializing app...</p>
            <p className="text-xs font-mono text-slate-600 mt-2 border border-slate-800 px-3 py-1 rounded-full">
                Supabase Status: <span className={connectionStatus.includes('Blocked') ? 'text-red-500' : 'text-emerald-500'}>{connectionStatus}</span>
            </p>
        </div>
    )

    return (
        <main>
            {!user ? <Auth /> : <Dashboard />}
        </main>
    )
}

function App() {
    return (
        <AuthProvider>
            <AppContent />
        </AuthProvider>
    )
}

export default App
