import { AuthProvider, useAuth } from './hooks/useAuth'
import Auth from './components/Auth'
import Dashboard from './components/Dashboard'
import { ToastProvider } from './contexts/ToastContext'
import { SpeedInsights } from "@vercel/speed-insights/react"
import { useEffect } from 'react'

// Explicit check for PWABuilder static analysis
if (typeof navigator !== 'undefined' && 'windowControlsOverlay' in navigator) {
    console.log('Window Controls Overlay supported');
}

function AppContent() {
    const { user, loading, connectionError } = useAuth()

    // Show spinner while checking
    if (loading) return (
        <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center gap-4">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
            <p className="text-slate-500 text-sm animate-pulse">Connecting to secure server...</p>
        </div>
    )

    // BLOCKER: If connection failed, show error screen
    if (connectionError) {
        return (
            <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
                <div className="glass-card max-w-md w-full p-8 text-center border-red-500/20">
                    <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-6 text-red-500">
                        <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
                    </div>
                    <h2 className="text-2xl font-bold text-white mb-2">Connection Failed</h2>
                    <p className="text-slate-400 mb-8">{connectionError}</p>
                    <button
                        onClick={() => window.location.reload()}
                        className="w-full bg-primary hover:bg-indigo-600 text-white font-bold py-3 rounded-xl transition-all shadow-lg shadow-primary/20"
                    >
                        Retry Connection
                    </button>
                </div>
            </div>
        )
    }

    return (
        <>
            {!user ? <Auth /> : <Dashboard />}
        </>
    )
}

function App() {
    return (
        <AuthProvider>
            <div className="titlebar" />
            <ToastProvider>
                <AppContent />
                <SpeedInsights />
                <footer className="fixed bottom-4 right-6 flex gap-4 text-[10px] text-slate-500 font-medium opacity-40 hover:opacity-100 transition-opacity z-50">
                    <a href="/privacy.html" target="_blank" rel="noopener noreferrer" className="hover:text-primary transition-colors">Privacy Policy</a>
                    <a href="/terms.html" target="_blank" rel="noopener noreferrer" className="hover:text-primary transition-colors">Terms of Service</a>
                    <a href="/cancel-subscription.html" target="_blank" rel="noopener noreferrer" className="hover:text-primary transition-colors">Cancel Subscription</a>
                </footer>
            </ToastProvider>
        </AuthProvider>
    )
}

export default App
