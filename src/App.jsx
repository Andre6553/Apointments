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

    if (loading && !forceShow) return (
        <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center gap-4">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
            <p className="text-slate-500 text-sm animate-pulse">Initializing app...</p>
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
