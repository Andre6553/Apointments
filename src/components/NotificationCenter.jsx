import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Bell, X, Check, ArrowRight, User, Trash2, Info } from 'lucide-react'
import { useNotifications } from '../hooks/useNotifications'
import { formatDistanceToNow } from 'date-fns'

const NotificationCenter = ({ onOpenNotification }) => {
    const [isOpen, setIsOpen] = useState(false)
    const { notifications, unreadCount, markAsRead, deleteNotification, loading } = useNotifications()
    const dropdownRef = useRef(null)

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsOpen(false)
            }
        }
        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [])

    const getIcon = (type) => {
        switch (type) {
            case 'transfer_request': return <ArrowRight className="text-primary" size={18} />
            case 'transfer_accepted': return <Check className="text-emerald-400" size={18} />
            case 'transfer_rejected': return <X className="text-rose-400" size={18} />
            default: return <Info className="text-slate-400" size={18} />
        }
    }

    return (
        <div className="relative" ref={dropdownRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={`p-3 rounded-2xl relative transition-all duration-300 ${isOpen ? 'bg-primary/20 text-white' : 'bg-surface/50 text-slate-400 hover:text-white hover:bg-white/5 border border-white/5'
                    }`}
            >
                <Bell size={22} />
                {unreadCount > 0 && (
                    <span className="absolute top-2.5 right-2.5 w-5 h-5 bg-primary text-white text-[10px] font-black rounded-full flex items-center justify-center border-2 border-[#0A0B14] shadow-lg shadow-primary/20">
                        {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                )}
            </button>

            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.95 }}
                        className="absolute right-0 mt-4 w-96 glass-card p-0 overflow-hidden z-[100] shadow-2xl shadow-black/50 border border-white/10"
                    >
                        <div className="p-5 border-b border-white/5 bg-white/[0.02] flex items-center justify-between">
                            <div>
                                <h3 className="font-heading font-bold text-white uppercase tracking-widest text-xs">Notifications</h3>
                                <p className="text-[10px] text-slate-500 font-bold mt-1">LATEST UPDATES</p>
                            </div>
                            {unreadCount > 0 && (
                                <span className="text-[10px] font-bold text-primary bg-primary/10 px-2 py-1 rounded-full border border-primary/20">
                                    {unreadCount} UNREAD
                                </span>
                            )}
                        </div>

                        <div className="max-h-[450px] overflow-y-auto scrollbar-hide">
                            {loading ? (
                                <div className="p-12 text-center text-slate-500 animate-pulse">
                                    <Bell size={32} className="mx-auto mb-4 opacity-20" />
                                    <p className="text-xs font-bold uppercase tracking-widest">Loading...</p>
                                </div>
                            ) : notifications.length === 0 ? (
                                <div className="p-12 text-center text-slate-500">
                                    <Bell size={32} className="mx-auto mb-4 opacity-20" />
                                    <p className="text-xs font-bold uppercase tracking-widest">All caught up</p>
                                </div>
                            ) : (
                                <div className="divide-y divide-white/5">
                                    {notifications.map((n) => (
                                        <div
                                            key={n.id}
                                            onClick={() => {
                                                if (!n.is_read) markAsRead(n.id);
                                                if (n.type === 'transfer_request' && onOpenNotification) {
                                                    onOpenNotification(n);
                                                    setIsOpen(false);
                                                }
                                            }}
                                            className={`p-5 group transition-colors cursor-pointer relative ${n.is_read ? 'bg-transparent' : 'bg-primary/5 hover:bg-primary/10'
                                                }`}
                                        >
                                            {!n.is_read && (
                                                <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary" />
                                            )}
                                            <div className="flex gap-4">
                                                <div className="p-2.5 rounded-xl bg-surface border border-white/5 h-fit shadow-inner">
                                                    {getIcon(n.type)}
                                                </div>
                                                <div className="flex-grow min-w-0">
                                                    <div className="flex justify-between items-start mb-1 gap-4">
                                                        <h4 className="text-sm font-bold text-white truncate leading-tight">{n.title}</h4>
                                                        <span className="text-[10px] text-slate-500 font-bold whitespace-nowrap shrink-0">
                                                            {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                                                        </span>
                                                    </div>
                                                    <p className="text-xs text-slate-400 leading-relaxed mb-3">
                                                        {n.message}
                                                    </p>

                                                    {n.type === 'transfer_request' && !n.is_read && (
                                                        <button className="text-[10px] font-black text-primary uppercase tracking-[0.2em] hover:text-white transition-colors bg-primary/10 px-3 py-1.5 rounded-lg border border-primary/20">
                                                            Respond Now
                                                        </button>
                                                    )}
                                                </div>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation()
                                                        deleteNotification(n.id)
                                                    }}
                                                    className="opacity-0 group-hover:opacity-100 p-2 text-slate-500 hover:text-rose-400 transition-all hover:bg-rose-500/10 rounded-lg"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {notifications.length > 0 && (
                            <div className="p-4 bg-white/[0.02] border-t border-white/5 text-center">
                                <button className="text-[10px] font-black text-slate-500 uppercase tracking-widest hover:text-white transition-colors">
                                    Clear all notifications
                                </button>
                            </div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}

export default NotificationCenter
