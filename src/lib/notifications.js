import { supabase } from './supabase'

/**
 * Centrally manages WhatsApp notifications for both real and simulation modes.
 * In simulation mode, every message is redirected to +27761963997.
 */
export const sendWhatsApp = async (phone, message) => {
    const isSim = localStorage.getItem('simulation_mode') === 'true'
    const targetPhone = isSim ? "+27761963997" : phone

    console.log(`%c[WhatsApp Demo] Redirecting message to ${targetPhone}...`, 'color: #6366f1; font-weight: bold;');
    console.log(`Message: "${message}"`);

    try {
        // Fallback for testing: Call the local proxy if simulation mode is "test-real" or if Edge Function fails
        const useProxy = isSim || window.location.hostname === 'localhost';

        if (useProxy) {
            console.log(`[WhatsApp] Attempting local proxy send to ${targetPhone}...`);
            try {
                const proxyRes = await fetch('http://localhost:3001/send-whatsapp', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ to: targetPhone, message })
                });

                if (proxyRes.ok) {
                    console.log('[WhatsApp] Sent via local proxy successfully');
                    return { success: true, via: 'proxy' };
                }
            } catch (proxyErr) {
                console.warn('[WhatsApp] Local proxy unavailable, falling back to Edge Function:', proxyErr.message);
                // Fall through to Edge Function
            }
        }

        // Production / Edge Function path
        const { data, error } = await supabase.functions.invoke('send-whatsapp', {
            body: { to: targetPhone, message }
        })

        if (error) throw error;
        return { success: true, data };
    } catch (err) {
        console.error('[WhatsApp] Send failed:', err);
        return { success: false, error: err.message };
    }
}
