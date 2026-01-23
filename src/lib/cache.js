/**
 * Simple local storage cache utility
 * data is stored as { timestamp: number, data: any }
 */

export const CACHE_KEYS = {
    APPOINTMENTS: 'apt_cache',
    TIMELINE: 'timeline_cache',
    WORKING_HOURS: 'work_hours_full', // Full list of days
    DAILY_WORKING_HOURS: 'work_hours_daily', // Single day for timeline
    BREAKS: 'breaks_cache'
};

const getUserIdSuffix = () => {
    try {
        const authData = localStorage.getItem('supabase.auth.token');
        if (!authData) return 'guest';
        const parsed = JSON.parse(authData);
        return parsed?.currentSession?.user?.id || 'guest';
    } catch (e) {
        return 'guest';
    }
};

export const setCache = (key, data) => {
    try {
        const userId = getUserIdSuffix();
        const cacheObj = {
            timestamp: Date.now(),
            data
        };
        localStorage.setItem(`${key}_${userId}`, JSON.stringify(cacheObj));
    } catch (e) {
        console.warn('Cache write failed:', e);
    }
};

export const getCache = (key) => {
    try {
        const userId = getUserIdSuffix();
        const stored = localStorage.getItem(`${key}_${userId}`);
        if (!stored) return null;
        const parsed = JSON.parse(stored);
        return parsed.data;
    } catch (e) {
        console.warn('Cache read failed:', e);
        return null;
    }
};

export const clearCache = (key) => {
    try {
        const userId = getUserIdSuffix();
        localStorage.removeItem(`${key}_${userId}`);
    } catch (e) {
        console.warn('Cache clear failed:', e);
    }
};
