import { useEffect, useCallback, useRef } from 'react';

/**
 * Hook to manage Screen Wake Lock API
 * Prevents the screen from turning off and the system from entering sleep mode.
 */
export const useWakeLock = (enabled) => {
    const sentinelRef = useRef(null);
    const lockRequestInProgress = useRef(false);

    const requestWakeLock = useCallback(async () => {
        if (!('wakeLock' in navigator) || lockRequestInProgress.current) return;

        // Don't request if we already have a functional lock
        if (sentinelRef.current && !sentinelRef.current.released) return;

        try {
            lockRequestInProgress.current = true;
            const lock = await navigator.wakeLock.request('screen');
            sentinelRef.current = lock;
            console.log('✅ [WakeLock] Screen is locked - system will stay awake');

            lock.addEventListener('release', () => {
                console.log('ℹ️ [WakeLock] Screen lock was released');
                sentinelRef.current = null;
            });
        } catch (err) {
            console.error(`❌ [WakeLock] Failed to acquire lock: ${err.name}, ${err.message}`);
        } finally {
            lockRequestInProgress.current = false;
        }
    }, []);

    const releaseWakeLock = useCallback(async () => {
        if (sentinelRef.current) {
            try {
                await sentinelRef.current.release();
                sentinelRef.current = null;
            } catch (err) {
                console.error(`❌ [WakeLock] Error releasing lock: ${err.message}`);
            }
        }
    }, []);

    useEffect(() => {
        if (enabled) {
            requestWakeLock();
        } else {
            releaseWakeLock();
        }

        // Handle visibility changes (browser releases lock when tab hidden)
        const handleVisibilityChange = async () => {
            if (enabled && document.visibilityState === 'visible') {
                // Wait a bit before re-acquiring to ensure system state is stable
                setTimeout(requestWakeLock, 1000);
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            // We don't necessarily want to release on every single effect cleanup if enabled hasn't changed,
            // but for safety in dev (strict mode) we keep it clean.
            if (!enabled) releaseWakeLock();
        };
    }, [enabled, requestWakeLock, releaseWakeLock]);

    return !!sentinelRef.current;
};
