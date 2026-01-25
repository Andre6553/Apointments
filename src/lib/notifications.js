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
        // We still attempt to call the real Supabase function if it exists.
        // This allows the user to test their real Twilio/function logic in simulation mode.
        const { data, error } = await supabase.functions.invoke('send-whatsapp', {
            body: { to: targetPhone, message }
        })

        if (error) {
            console.warn('[WhatsApp] Function call failed (Normal if not deployed):', error.message);
            // In simulation mode, we consider a "console send" a success for demo purposes
            if (isSim) return { success: true, simulated: true };
            return { success: false, error: error.message };
        }

        return { success: true, data };
    } catch (err) {
        console.error('[WhatsApp] Error:', err);
        // Simulation fallback - always "succeed" visually
        if (isSim) return { success: true, simulated: true };
        return { success: false, error: err.message };
    }
}
