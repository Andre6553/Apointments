import { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { motion } from 'framer-motion';
import { Check, ShieldCheck, Clock, CreditCard, ExternalLink, AlertCircle, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';

const SubscriptionPage = () => {
    const { user, profile, fetchProfile } = useAuth();
    const [loading, setLoading] = useState(false);
    const [verifying, setVerifying] = useState(false);
    const [paymentStatus, setPaymentStatus] = useState(null);

    // Variables for pricing and display
    const isSA = Intl.DateTimeFormat().resolvedOptions().timeZone === 'Africa/Johannesburg';
    const exchangeRate = 19; // 1 USD = 19 ZAR
    useEffect(() => {
        const query = new URLSearchParams(window.location.search);
        const result = query.get('payment');

        if (result === 'success') {
            console.log('[SubscriptionPage] Success redirect detected. Triggering verification.');
            setVerifying(true);
            setPaymentStatus('success');
            // Clean URL immediately
            const newUrl = window.location.origin + window.location.pathname;
            window.history.replaceState({}, document.title, newUrl);
        } else if (result === 'cancelled') {
            setPaymentStatus('cancelled');
            const newUrl = window.location.origin + window.location.pathname;
            window.history.replaceState({}, document.title, newUrl);
        }
    }, []);

    // 2. Polling Logic (Isolated from URL state)
    useEffect(() => {
        if (!verifying || !user?.id) return;

        console.log(`[SubscriptionPage] Starting polling loop for user: ${user.id}`);
        let attempts = 0;

        const pollInterval = setInterval(async () => {
            attempts++;
            console.log(`[SubscriptionPage] Polling database... Attempt ${attempts}/20 for ${user.id}`);

            try {
                const { data: subData, error: subError } = await supabase
                    .from('subscriptions')
                    .select('tier, expires_at')
                    .eq('profile_id', user.id)
                    .single();

                if (subError) {
                    console.error('[SubscriptionPage] Polling error:', subError);
                }

                // If tier is no longer trial, we've succeeded
                // OR if it's already a paid tier (sanity check)
                if (subData && subData.tier !== 'trial') {
                    console.log('[SubscriptionPage] Payment confirmed in database!', subData);
                    // Force a full profile refresh to update UI everywhere
                    await fetchProfile(user.id);
                    clearInterval(pollInterval);
                    setVerifying(false);
                    return;
                }
            } catch (err) {
                console.error('[SubscriptionPage] Polling caught exception:', err);
            }

            if (attempts >= 20) {
                console.warn('[SubscriptionPage] Polling timeout reached after 1 minute.');
                clearInterval(pollInterval);
                setVerifying(false);
                setPaymentStatus('timeout');
            }
        }, 3000);

        return () => {
            console.log('[SubscriptionPage] Cleaning up polling interval.');
            clearInterval(pollInterval);
        };
    }, [verifying, user?.id]);


    const subscription = profile?.subscription;
    const expiresAt = subscription?.expires_at ? new Date(subscription.expires_at) : null;
    const now = new Date();
    const AMNESTY_WINDOW = 24 * 60 * 60 * 1000;
    const diffMs = expiresAt ? expiresAt.getTime() - now.getTime() : 0;
    const daysLeft = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    // Improved logic for status check
    const isTrial = subscription?.tier === 'trial';
    const isExpired = diffMs <= 0;
    const isAmnesty = !isTrial && isExpired && Math.abs(diffMs) < AMNESTY_WINDOW;
    const isHardExpired = isExpired && !isAmnesty;
    const canRenew = isTrial || daysLeft <= 2 || isAmnesty;

    const [pricing, setPricing] = useState(null);  // Start as null to show loading state

    useEffect(() => {
        const fetchPricing = async () => {
            const { data, error } = await supabase
                .from('app_settings')
                .select('*')
                .in('key', ['pricing_admin', 'pricing_provider']);

            if (data && !error && data.length > 0) {
                const newPricing = {
                    Admin: { monthly: 5, yearly: 55 },
                    Provider: { monthly: 3, yearly: 33 }
                };
                data.forEach(item => {
                    if (item.key === 'pricing_admin') newPricing.Admin = item.value;
                    if (item.key === 'pricing_provider') newPricing.Provider = item.value;
                });
                setPricing(newPricing);
            } else {
                // Fallback to defaults if no data
                setPricing({
                    Admin: { monthly: 5, yearly: 55 },
                    Provider: { monthly: 3, yearly: 33 }
                });
            }
        };
        fetchPricing();
    }, []);

    const role = profile?.role === 'Admin' ? 'Admin' : 'Provider';
    const monthlyPrice = pricing?.[role]?.monthly ?? 0;
    const yearlyPrice = pricing?.[role]?.yearly ?? 0;
    const pricingLoaded = pricing !== null;

    const formatCurrency = (amount) => {
        if (isSA) {
            return `R ${(amount * exchangeRate).toFixed(2)}`;
        }
        return `$ ${amount.toFixed(2)}`;
    };

    const handlePayment = (tier) => {
        setLoading(true);
        const amount = tier === 'monthly' ? monthlyPrice : yearlyPrice;
        const zarAmount = (amount * exchangeRate).toFixed(2);
        const itemName = `${role} ${tier === 'monthly' ? 'Monthly' : 'Yearly'} Subscription`;

        // PayFast Live Credentials (matching Omni Bible pattern)
        const baseUrl = 'https://www.payfast.co.za/eng/process';
        const receiver = '11945617'; // merchant_id
        const merchantKey = '9anvup217hdck';

        // URLs
        const returnUrl = `${window.location.origin}/?payment=success`;
        const cancelUrl = `${window.location.origin}/?payment=cancelled`;
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const notifyUrl = `${supabaseUrl}/functions/v1/payfast-webhook`;

        const finalAmount = `${isSA ? zarAmount : amount.toFixed(2)}`;

        console.log('[SubscriptionPage] Redirecting to PayFast with amount:', finalAmount);

        // Build URL params (matching working Omni Bible pattern)
        const payParams = new URLSearchParams({
            cmd: '_paynow',
            receiver: receiver,
            item_name: itemName,
            amount: finalAmount,
            return_url: returnUrl,
            cancel_url: cancelUrl,
            notify_url: notifyUrl,
            custom_str1: profile?.business_id || '',
            custom_str2: user?.id || '',
            merchant_key: merchantKey
        });

        // Simple redirect (no signature needed for this method)
        window.location.href = `${baseUrl}?${payParams.toString()}`;
    };

    if (verifying) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 text-center">
                <div className="relative">
                    <div className="absolute inset-0 bg-primary blur-3xl opacity-20 animate-pulse"></div>
                    <Loader2 className="w-16 h-16 text-primary animate-spin relative z-10" />
                </div>
                <div>
                    <h2 className="text-3xl font-bold text-white mb-2">Verifying Payment</h2>
                    <p className="text-slate-400 max-w-md mx-auto mb-4">
                        We're confirming your transaction with PayFast. This usually takes 10-20 seconds.
                    </p>
                    <div className="bg-white/5 p-4 rounded-xl border border-white/10 mb-6 text-xs text-slate-500 font-mono">
                        Status: Polling database... (Attempt {Math.min(20, Math.ceil(Date.now() / 3000 % 20))})
                    </div>
                    <div className="flex flex-col gap-3">
                        <button
                            onClick={async () => {
                                setLoading(true);
                                await fetchProfile(user.id);
                                setLoading(false);
                            }}
                            className="bg-white/5 hover:bg-white/10 text-white text-sm font-bold py-2 px-6 rounded-xl transition-all"
                        >
                            {loading ? 'Checking...' : 'Check Status Manually'}
                        </button>
                        <p className="text-[10px] text-slate-600 italic">
                            If you've been waiting for more than 1 minute, please check your internet or refresh the page.
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    if (paymentStatus === 'timeout' && (isTrial || isExpired)) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 text-center">
                <div className="w-20 h-20 bg-amber-500/20 rounded-full flex items-center justify-center text-amber-500 border border-amber-500/30 mb-4">
                    <Clock size={40} />
                </div>
                <div>
                    <h2 className="text-3xl font-bold text-white mb-2">Still Waiting...</h2>
                    <p className="text-slate-400 max-w-md mx-auto mb-8">
                        The payment is taking longer than usual to reflect. You can try refreshing manually or contact support if the issue persists.
                    </p>
                    <div className="flex flex-col sm:flex-row gap-4 justify-center">
                        <button
                            onClick={() => window.location.reload()}
                            className="bg-primary hover:bg-indigo-600 text-white font-bold py-4 px-8 rounded-2xl transition-all shadow-lg shadow-primary/20"
                        >
                            Refresh Page
                        </button>
                        <button
                            onClick={() => setPaymentStatus(null)}
                            className="bg-white/5 hover:bg-white/10 text-white font-bold py-4 px-8 rounded-2xl transition-all border border-white/10"
                        >
                            Back to Pricing
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    if (paymentStatus === 'success' && !isExpired && !isTrial) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 text-center">
                <motion.div
                    initial={{ scale: 0.5, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="w-20 h-20 bg-emerald-500/20 rounded-full flex items-center justify-center text-emerald-500 border border-emerald-500/30 mb-4"
                >
                    <Check size={40} />
                </motion.div>
                <div>
                    <h2 className="text-3xl font-bold text-white mb-2">Payment Successful!</h2>
                    <p className="text-slate-400 max-w-md mx-auto mb-8">
                        Thank you for your subscription. Your account has been upgraded and all features are now unlocked.
                    </p>
                    <button
                        onClick={() => window.location.href = '/'}
                        className="bg-primary hover:bg-indigo-600 text-white font-bold py-4 px-8 rounded-2xl transition-all shadow-lg shadow-primary/20"
                    >
                        Go to Dashboard
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-8 max-w-5xl mx-auto">
            {paymentStatus === 'cancelled' && (
                <motion.div
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-red-500/10 border border-red-500/20 p-4 rounded-2xl flex items-center gap-3 text-red-400 text-sm mb-4"
                >
                    <AlertCircle size={18} />
                    <span>Your payment was cancelled. If this was a mistake, please try again.</span>
                </motion.div>
            )}
            {/* Status Card */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className={`glass-card p-8 border-l-4 ${daysLeft > 3 ? 'border-primary' : 'border-amber-500'}`}
            >
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                    <div className="flex items-center gap-4">
                        <div className={`p-3 rounded-2xl ${daysLeft > 3 ? 'bg-primary/10 text-primary' : 'bg-amber-500/10 text-amber-500'}`}>
                            {isExpired ? <AlertCircle size={32} /> : <ShieldCheck size={32} />}
                        </div>
                        <div>
                            <h3 className="text-2xl font-bold text-white mb-1">
                                {isTrial ? 'Trial Subscription' : isAmnesty ? 'Grace Period (Amnesty)' : `${subscription?.tier?.charAt(0).toUpperCase() + subscription?.tier?.slice(1)} Subscription`}
                            </h3>
                            <p className="text-slate-400">
                                {isHardExpired
                                    ? 'Your subscription has expired. Please renew to continue using the app.'
                                    : isAmnesty
                                        ? 'Your subscription has expired, but you are in a 24-hour grace period.'
                                        : `You have ${daysLeft} days remaining on your current plan.`}
                            </p>
                        </div>
                    </div>
                    <div className="text-center md:text-right">
                        <div className={`text-4xl font-black mb-1 ${daysLeft > 3 ? 'text-white' : 'text-amber-500 animate-pulse'}`}>
                            {daysLeft}
                        </div>
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest text-nowrap">Days Remaining</p>
                    </div>
                </div>
            </motion.div>

            {/* Pricing Section */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Monthly Plan */}
                <motion.div
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.1 }}
                    className="glass-card p-8 flex flex-col group hover:border-primary/30 transition-all"
                >
                    <div className="flex justify-between items-start mb-8">
                        <div>
                            <h4 className="text-xl font-bold text-white mb-2">Monthly Plan</h4>
                            <p className="text-slate-400 text-sm">Flexible month-to-month access</p>
                        </div>
                        <div className="text-right">
                            {pricingLoaded ? (
                                <span className="text-3xl font-black text-white">{formatCurrency(monthlyPrice)}</span>
                            ) : (
                                <span className="text-3xl font-black text-slate-600 animate-pulse">Loading...</span>
                            )}
                            <span className="text-slate-500 text-sm ml-1">/mo</span>
                        </div>
                    </div>

                    <div className="space-y-4 mb-10 flex-grow">
                        {[
                            'All dashboard features',
                            'Client management',
                            'Automated delay tracking',
                            'Organization settings',
                            'Support included'
                        ].map((feature, i) => (
                            <div key={i} className="flex items-center gap-3 text-slate-300 text-sm">
                                <div className="p-0.5 rounded-full bg-primary/20 text-primary">
                                    <Check size={14} />
                                </div>
                                {feature}
                            </div>
                        ))}
                    </div>

                    <button
                        onClick={() => handlePayment('monthly')}
                        disabled={loading || !canRenew}
                        className={`w-full font-bold py-4 rounded-2xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-primary/5 ${!canRenew
                            ? 'bg-white/5 text-slate-500 cursor-not-allowed border border-white/5'
                            : 'bg-white/5 hover:bg-primary text-white group-hover:bg-primary'
                            }`}
                    >
                        {loading ? <Loader2 className="animate-spin" size={20} /> : <CreditCard size={20} />}
                        {loading ? 'Processing...' : !canRenew ? `Renewal opens in ${daysLeft - 2} days` : 'Subscribe Monthly'}
                    </button>
                </motion.div>

                {/* Yearly Plan */}
                <motion.div
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.2 }}
                    className="glass-card p-8 flex flex-col border-primary/20 relative overflow-hidden group hover:border-primary/50 transition-all shadow-xl shadow-primary/10"
                >
                    <div className="absolute top-0 right-0 bg-primary px-4 py-1 text-[10px] font-black uppercase text-white tracking-widest rounded-bl-xl">
                        Save 1 Month
                    </div>

                    <div className="flex justify-between items-start mb-8">
                        <div>
                            <h4 className="text-xl font-bold text-white mb-2">Yearly Plan</h4>
                            <p className="text-slate-400 text-sm">Best value for organizations</p>
                        </div>
                        <div className="text-right">
                            {pricingLoaded ? (
                                <span className="text-3xl font-black text-white">{formatCurrency(yearlyPrice)}</span>
                            ) : (
                                <span className="text-3xl font-black text-slate-600 animate-pulse">Loading...</span>
                            )}
                            <span className="text-slate-500 text-sm ml-1">/yr</span>
                        </div>
                    </div>

                    <div className="space-y-4 mb-10 flex-grow">
                        {[
                            'Priority support access',
                            'Everything in Monthly',
                            'One month for free',
                            'Manage team access',
                            'Annual billing cycle'
                        ].map((feature, i) => (
                            <div key={i} className="flex items-center gap-3 text-slate-300 text-sm">
                                <div className="p-0.5 rounded-full bg-primary/20 text-primary">
                                    <Check size={14} />
                                </div>
                                {feature}
                            </div>
                        ))}
                    </div>

                    <button
                        onClick={() => handlePayment('yearly')}
                        disabled={loading}
                        className="w-full bg-primary hover:bg-indigo-600 text-white font-bold py-4 rounded-2xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-primary/20"
                    >
                        {loading ? <Loader2 className="animate-spin" size={20} /> : <ExternalLink size={20} />}
                        {loading ? 'Processing...' : 'Subscribe Yearly'}
                    </button>
                </motion.div>
            </div>

            {/* PayFast Badge */}
            <div className="flex justify-center items-center gap-4 opacity-50 grayscale hover:grayscale-0 transition-all pt-4">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Secure Payments via</p>
                <img src="https://www.payfast.co.za/images/buttons/light-small-paynow.png" alt="PayFast" className="h-8" />
            </div>
        </div>
    );
};

export default SubscriptionPage;
