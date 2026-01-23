import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        console.error("ErrorBoundary caught an error", error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="p-12 glass-card text-center flex flex-col items-center justify-center min-h-[400px]">
                    <div className="w-20 h-20 bg-rose-500/10 rounded-3xl flex items-center justify-center mb-6 border border-rose-500/20 shadow-glow shadow-rose-500/10">
                        <AlertTriangle className="text-rose-500" size={40} />
                    </div>
                    <h3 className="text-2xl font-heading font-bold text-white mb-2">Feature Unavailable</h3>
                    <p className="text-slate-400 max-w-md mx-auto mb-8 font-medium">
                        This part of the dashboard encountered an unexpected error. Don't worry, your other data is safe.
                    </p>
                    <button
                        onClick={() => window.location.reload()}
                        className="bg-primary hover:bg-indigo-600 text-white px-8 py-3 rounded-xl font-bold transition-all shadow-lg shadow-primary/20 flex items-center gap-2"
                    >
                        <RefreshCw size={18} />
                        Refresh Dashboard
                    </button>
                    {/* Error details only in console to avoid process.env crashes */}
                    <div className="mt-8 p-4 bg-black/40 rounded-lg text-left w-full max-w-2xl overflow-auto border border-white/5 opacity-50">
                        <p className="text-rose-400 font-mono text-[10px] break-words uppercase tracking-widest">Technical details logged to console</p>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
