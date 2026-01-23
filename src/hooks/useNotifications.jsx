import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

export const useNotifications = () => {
    const [notifications, setNotifications] = useState([])
    const [loading, setLoading] = useState(true)
    const [unreadCount, setUnreadCount] = useState(0)

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

        return () => {
            if (subscription) supabase.removeChannel(subscription)
        }
    }, [fetchNotifications])

    return {
        notifications,
        loading,
        unreadCount,
        markAsRead,
        deleteNotification,
        refresh: fetchNotifications
    }
}
