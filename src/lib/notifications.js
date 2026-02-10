import { supabase } from './supabase'

/**
 * Centrally manages WhatsApp notifications for both real and simulation modes.
 * In simulation mode, every message is redirected to +27761963997.
 */
export const sendWhatsApp = async (phone, message) => {
    if (!phone || !message) {
        console.warn('[WhatsApp] Aborted: Missing phone number or message content.', { phone, message });
        return { success: false, error: 'Missing phone or message' };
    }

    const isSim = localStorage.getItem('simulation_mode') === 'true'
    // Ensure minimal formatting (E.164-ish)
    let formattedPhone = (targetPhone || '').replace(/\s+/g, '');
    if (formattedPhone.startsWith('0')) {
        formattedPhone = '+27' + formattedPhone.substring(1);
    }

    try {
        // Fallback for testing: Call the local proxy if simulation mode is "test-real" or if Edge Function fails
        const useProxy = isSim || window.location.hostname === 'localhost';

        if (useProxy) {
            console.log(`[WhatsApp] Attempting local proxy send to ${formattedPhone}...`);
            try {
                const proxyRes = await fetch('http://localhost:3001/send-whatsapp', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ to: formattedPhone, message })
                });

                if (proxyRes.ok) {
                    console.log('[WhatsApp] Sent via local proxy successfully');
                    return { success: true, via: 'proxy' };
                } else {
                    const errData = await proxyRes.json();
                    console.warn('[WhatsApp] Local proxy returned error:', errData);
                    // If proxy fails (e.g. 500), we might want to try Edge Function or just fail?
                    // For now, let's throw to fall through to catch block or return error
                    throw new Error(errData.error || 'Proxy Error');
                }
            } catch (proxyErr) {
                console.warn('[WhatsApp] Local proxy unavailable/failed:', proxyErr.message);
                // If specific proxy error (like connection refused), fall through to Edge Function
                // But if it was a logic error (400), maybe stop? 
                // Let's safe-fail to Edge Function
            }
        }

        // Production / Edge Function path
        const { data, error } = await supabase.functions.invoke('send-whatsapp', {
            body: { to: formattedPhone, message }
        })

        if (error) {
            // Try to extract detailed error from response if available
            if (error && typeof error === 'object') {
                try {
                    // Check if it's a specialized FunctionsHttpError with a context response
                    if (error.context && typeof error.context.json === 'function') {
                        const errorBody = await error.context.json();
                        console.error('[WhatsApp] Edge Function API Error:', errorBody);
                    } else {
                        console.error('[WhatsApp] Edge Function Error:', error.message || error);
                    }
                } catch (parseErr) {
                    console.error('[WhatsApp] Edge Function Error (Unparsable):', error);
                }
            }
            throw error;
        }

        return { success: true, data };
    } catch (err) {
        console.error('[WhatsApp] Send failed:', err);
        return { success: false, error: err.message };
    }
}
