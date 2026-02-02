import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useToast } from '../contexts/ToastContext'

const NOTIFICATION_SOUND = 'data:audio/mp3;base64,//uQxAAAAANIAAAAAExBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//uQxAAAAANIAAAAAExBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//uQxAAAAANIAAAAAExBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq' // Fallback silence if shortened
// Real short beep
const BEEP_SOUND = 'data:audio/wav;base64,UklGRl9vT19XQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YU' // Placeholder, I'll use a real one below

const playNotificationSound = () => {
    // Simple high-pitch beep script (URL-safe base64 of a tiny 100ms sine wave or similar)
    // Using a reliable external asset or a generated one is better.
    // Let's use a standard "Ding" sound encoded. 
    // Since I can't generate a long string here easily without bloat, 
    // I will try to use the browser's SpeechSynthesis as a fallback or a shorter data URI.

    // Actually, asking the browser to beep via AudioContext is most reliable.
    try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (AudioContext) {
            const ctx = new AudioContext();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.frequency.value = 880; // A5
            gain.gain.setValueAtTime(0.1, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.00001, ctx.currentTime + 0.5);
            osc.start();
            osc.stop(ctx.currentTime + 0.5);
            return;
        }
    } catch (e) {
        console.warn('AudioContext beep failed', e);
    }

    // Fallback
    const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3')
    audio.volume = 0.5
    audio.play().catch(e => console.warn('Audio play failed', e))
}

export const useNotifications = () => {
    const [notifications, setNotifications] = useState([])
    const [loading, setLoading] = useState(true)
    const [unreadCount, setUnreadCount] = useState(0)
    const triggerToast = useToast()

    const fetchNotifications = useCallback(async () => {
        try {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return

            const { data, error } = await supabase
                .from('notifications')
                .select('*')
                .eq('user_id', user.id)
                .order('created_at', { ascending: false })
                .limit(20)

            if (error) throw error
            setNotifications(data || [])
            setUnreadCount(data?.filter(n => !n.is_read).length || 0)
        } catch (error) {
            if (error?.name === 'AbortError' || error?.message?.includes('AbortError')) return; // Silently ignore aborts
            console.error('Error fetching notifications:', error)
        } finally {
            setLoading(false)
        }
    }, [])

    const markAsRead = async (id) => {
        try {
            const { error } = await supabase
                .from('notifications')
                .update({ is_read: true })
                .eq('id', id)

            if (error) throw error

            setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n))
            setUnreadCount(prev => Math.max(0, prev - 1))
        } catch (error) {
            console.error('Error marking notification as read:', error)
        }
    }

    const deleteNotification = async (id) => {
        try {
            const { error } = await supabase
                .from('notifications')
                .delete()
                .eq('id', id)

            if (error) throw error

            const wasUnread = notifications.find(n => n.id === id)?.is_read === false
            setNotifications(prev => prev.filter(n => n.id !== id))
            if (wasUnread) setUnreadCount(prev => Math.max(0, prev - 1))
        } catch (error) {
            console.error('Error deleting notification:', error)
        }
    }

    useEffect(() => {
        let subscription

        const setupRealtime = async () => {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return

            subscription = supabase
                .channel(`user-notifications-${user.id}`)
                .on('postgres_changes', {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'notifications',
                    filter: `user_id=eq.${user.id}`
                }, (payload) => {
                    setNotifications(prev => [payload.new, ...prev].slice(0, 20))
                    setUnreadCount(prev => prev + 1)

                    // Audio & Visual Alert
                    playNotificationSound()
                    triggerToast(payload.new.message, 'notification', payload.new.title)
                })
                .on('postgres_changes', {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'notifications',
                    filter: `user_id=eq.${user.id}`
                }, (payload) => {
                    setNotifications(prev => prev.map(n => n.id === payload.new.id ? payload.new : n))
                    // Recalculate unread count for simplicity
                    setUnreadCount(prev => {
                        if (payload.old.is_read === false && payload.new.is_read === true) return Math.max(0, prev - 1)
                        if (payload.old.is_read === true && payload.new.is_read === false) return prev + 1
                        return prev
                    })
                })
                .subscribe()
        }

        setupRealtime()
        fetchNotifications()

        const interval = setInterval(() => {
            fetchNotifications()
        }, 60000)

        return () => {
            if (subscription) supabase.removeChannel(subscription)
            clearInterval(interval)
        }
    }, [fetchNotifications])

    const clearAllNotifications = async () => {
        try {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return

            const { error } = await supabase
                .from('notifications')
                .delete()
                .eq('user_id', user.id)

            if (error) throw error

            setNotifications([])
            setUnreadCount(0)
        } catch (error) {
            console.error('Error clearing all notifications:', error)
        }
    }

    return {
        notifications,
        loading,
        unreadCount,
        markAsRead,
        deleteNotification,
        clearAllNotifications,
        refresh: fetchNotifications
    }
}
