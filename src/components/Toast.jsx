import { motion, AnimatePresence } from 'framer-motion'
import { Check, X, Info, Bell, AlertTriangle } from 'lucide-react'
import { useState, useEffect, forwardRef, useImperativeHandle } from 'react'

const Toast = forwardRef((props, ref) => {
    const [toasts, setToasts] = useState([])

    useImperativeHandle(ref, () => ({
        add: (message, type = 'info', title = null) => {
            const id = Date.now().toString()
            setToasts(prev => [...prev, { id, message, type, title }])
            setTimeout(() => remove(id), 5000)
        }
    }))

    const remove = (id) => {
        setToasts(prev => prev.filter(t => t.id !== id))
    }

    const getIcon = (type) => {
        switch (type) {
            case 'success': return <Check className="text-emerald-400" size={20} />
            case 'error': return <X className="text-rose-400" size={20} />
            case 'warning': return <AlertTriangle className="text-amber-400" size={20} />
            case 'notification': return <Bell className="text-primary" size={20} />
            default: return <Info className="text-slate-400" size={20} />
        }
    }

    const getStyles = (type) => {
        switch (type) {
            case 'success': return 'bg-emerald-500/10 border-emerald-500/20'
            case 'error': return 'bg-rose-500/10 border-rose-500/20'
            case 'warning': return 'bg-amber-500/10 border-amber-500/20'
            case 'notification': return 'bg-primary/10 border-primary/20 shadow-glow shadow-primary/10'
            default: return 'bg-surface border-white/10'
        }
    }

    return (
        <div className="fixed top-4 right-4 z-[150] flex flex-col gap-2 pointer-events-none">
            <AnimatePresence>
                {toasts.map(toast => (
                    <motion.div
                        key={toast.id}
                        initial={{ opacity: 0, x: 20, scale: 0.95 }}
                        animate={{ opacity: 1, x: 0, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
                        layout
                        className={`pointer-events-auto min-w-[320px] max-w-sm p-4 rounded-xl border backdrop-blur-md shadow-2xl flex gap-4 ${getStyles(toast.type)}`}
                    >
                        <div className="p-2 rounded-lg bg-surface/50 h-fit shrink-0">
                            {getIcon(toast.type)}
                        </div>
                        <div className="flex-grow pt-0.5">
                            {toast.title && <h4 className="font-bold text-white text-sm mb-1">{toast.title}</h4>}
                            <p className="text-sm text-slate-300 leading-relaxed font-medium">{toast.message}</p>
                        </div>
                        <button
                            onClick={() => remove(toast.id)}
                            className="text-slate-500 hover:text-white transition-colors h-fit"
                        >
                            <X size={16} />
                        </button>
                    </motion.div>
                ))}
            </AnimatePresence>
        </div>
    )
})

Toast.displayName = 'Toast'

export default Toast
