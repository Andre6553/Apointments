import http from 'http';
import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import { format, addMinutes, subMinutes } from 'date-fns';

// Simple ENV loader
const __filename = fileURLToPath(import.meta.url);
const rootDir = path.resolve(path.dirname(__filename), '..');

const loadEnv = () => {
    try {
        const envPath = path.join(rootDir, '.env');
        if (!fs.existsSync(envPath)) return process.env;
        const envFile = fs.readFileSync(envPath, 'utf8');
        const env = { ...process.env };
        envFile.split('\n').forEach(line => {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) return;
            const firstEq = trimmed.indexOf('=');
            if (firstEq === -1) return;
            const key = trimmed.substring(0, firstEq).trim();
            let val = trimmed.substring(firstEq + 1).trim();
            // Remove surround quotes if present
            if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
                val = val.substring(1, val.length - 1);
            }
            if (key && val) env[key] = val;
        });
        return env;
    } catch (e) {
        return process.env;
    }
};

const env = loadEnv();
const PORT = 3001; // Avoid 3000 (often used)
const ACCOUNT_SID = env.VITE_TWILIO_ACCOUNT_SID || env.TWILIO_ACCOUNT_SID;
const AUTH_TOKEN = env.VITE_TWILIO_AUTH_TOKEN || env.TWILIO_AUTH_TOKEN;
const FROM_NUMBER = env.VITE_TWILIO_WHATSAPP_FROM || env.TWILIO_WHATSAPP_FROM;

// Init Supabase for Cron Jobs
const supabaseUrl = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY || env.VITE_SUPABASE_SERVICE_ROLE_KEY || env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// --- Logging System ---
const LOGS_DIR = path.join(rootDir, 'Logs');
if (!fs.existsSync(LOGS_DIR)) {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
}

let currentLogFile = null;
let currentLineCount = 0;

const getNewLogFilename = () => {
    const ts = format(new Date(), 'yyyy-MM-dd_HH-mm-ss');
    return path.join(LOGS_DIR, `${ts}.log`);
};

const writeToLogFile = (data) => {
    try {
        let entryObj = data;
        if (typeof data === 'string') {
            try { entryObj = JSON.parse(data); } catch (e) { }
        }

        let businessId = entryObj?.payload?.business_name || entryObj?.business_name || entryObj?.payload?.business_id || entryObj?.business_id || 'global';
        businessId = businessId.toString().replace(/[^a-z0-9-]/gi, '_');

        const todayPrefix = format(new Date(), 'yyyy-MM-dd');

        // --- LOG ROTATION LOGIC (10,000 Line Cap) ---
        let rotationPart = 1;
        let filename = path.join(LOGS_DIR, `${businessId}_${todayPrefix}.log`);

        // Find the latest active part
        while (fs.existsSync(filename)) {
            const content = fs.readFileSync(filename, 'utf8');
            const lines = content.split('\n').length;
            if (lines < 10000) break; // This file has room
            rotationPart++;
            filename = path.join(LOGS_DIR, `${businessId}_${todayPrefix}_part${rotationPart}.log`);
        }

        if (typeof entryObj === 'object' && !entryObj.ts) {
            entryObj.ts = format(new Date(), 'yyyy-MM-dd HH:mm:ss.SSS');
        }

        const entry = (typeof entryObj === 'object' ? JSON.stringify(entryObj) : String(data)) + '\n';
        fs.appendFileSync(filename, entry);
    } catch (err) {
        console.error('[Logger] Failed to write to log:', err);
    }
};

console.log('--- Twilio Proxy Config ---');
console.log(`SID: ${ACCOUNT_SID ? ACCOUNT_SID.slice(0, 4) + '...' + ACCOUNT_SID.slice(-4) : 'MISSING'}`);
console.log(`Token: ${AUTH_TOKEN ? AUTH_TOKEN.slice(0, 4) + '...' + AUTH_TOKEN.slice(-4) : 'MISSING'}`);
console.log(`From: ${FROM_NUMBER}`);
console.log('---------------------------');

// --- Helper to Send Template Message ---
const sendTemplateMessage = async (to, date, time, clientName, providerName) => {
    return new Promise((resolve, reject) => {
        try {
            const message = `Hi ${clientName || 'there'}, your appointment with ${providerName || 'your doctor'} is coming up on ${date} at ${time}`;
            // NOTE: This body strictly matches the Sandbox 'Appointment Reminder' template.
            // If using a Live number, you must create a template with body: "Your appointment is coming up on {{1}} at {{2}}"
            // and submit it for approval.

            const postData = new URLSearchParams({
                'To': to.startsWith('whatsapp:') ? to : `whatsapp:${to}`,
                'From': FROM_NUMBER,
                'Body': message
            }).toString();

            const req = https.request({
                hostname: 'api.twilio.com',
                path: `/2010-04-01/Accounts/${ACCOUNT_SID}/Messages.json`,
                method: 'POST',
                headers: {
                    'Authorization': 'Basic ' + Buffer.from(`${ACCOUNT_SID}:${AUTH_TOKEN}`).toString('base64'),
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Content-Length': postData.length
                }
            }, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    if (res.statusCode >= 200 && res.statusCode < 300) resolve(true);
                    else {
                        console.error('Twilio Error:', data);
                        resolve(false);
                    }
                });
            });

            req.on('error', (e) => {
                console.error('Twilio Network Error:', e);
                resolve(false);
            });
            req.write(postData);
            req.end();
        } catch (e) {
            console.error('Send Template Ex:', e);
            resolve(false);
        }
    });
};

// --- CRON: Check Reminders every 60s ---
const checkReminders = async () => {
    try {
        const now = new Date();
        const startPath = addMinutes(now, 25).toISOString(); // Look ahead 25 mins
        const endPath = addMinutes(now, 35).toISOString();   // Look ahead 35 mins (window of 10m)

        console.log(`[ReminderCron] Time Check | System: ${now.toLocaleString()} | ISO: ${now.toISOString()} | Window: ${startPath} -> ${endPath}`);

        const { data: apts, error } = await supabase
            .from('appointments')
            .select(`
                id, scheduled_start, 
                client:clients(first_name, last_name, phone, whatsapp_opt_in),
                provider:profiles!appointments_assigned_profile_id_fkey(full_name),
                notifications_sent
            `)
            .eq('status', 'pending')
            .is('reminder_sent', false) // Only unsent reminders
            .gte('scheduled_start', startPath)
            .lte('scheduled_start', endPath);

        if (error) {
            console.error('Reminder Check Error:', error);
            return;
        }

        if (apts && apts.length > 0) {
            console.log(`[ReminderCron] Found ${apts.length} appointments due for reminder.`);

            for (const apt of apts) {
                if (!apt.client?.phone || !apt.client?.whatsapp_opt_in) continue;

                const localDate = new Date(apt.scheduled_start);

                const dateStr = format(localDate, 'MMM do');
                const timeStr = format(localDate, 'HH:mm');

                const sent = await sendTemplateMessage(
                    apt.client.phone,
                    dateStr,
                    timeStr,
                    apt.client.first_name,
                    apt.provider?.full_name
                );

                if (sent) {
                    console.log(`[ReminderCron] Sent personalized reminder to ${apt.client.first_name}`);
                    await supabase.from('appointments').update({ reminder_sent: true }).eq('id', apt.id);
                }
            }
        }
    } catch (e) {
        console.error('Reminder Loop Ex:', e);
    }
};

// --- CRON: Auto-Close Stuck Sessions every 60s ---
const checkStuckSessions = async () => {
    try {
        console.log('[AutoCloseCron] Checking for stuck sessions...');
        // Find appointments that are 'active' but started > 4 hours ago (Safeguard)
        // OR started > duration + 120 mins ago
        // For simplicity in SQL, let's just grab all active ones and filter in JS or use a "started before X" query

        const cutoff = subMinutes(new Date(), 180).toISOString(); // 3 hours ago

        const { data: stuckApts, error } = await supabase
            .from('appointments')
            .select('id, actual_start, client:clients(first_name, last_name), provider:profiles!appointments_assigned_profile_id_fkey(full_name)')
            .eq('status', 'active')
            .lte('actual_start', cutoff);

        if (error) {
            console.error('[AutoCloseCron] Query Error:', error);
            return;
        }

        if (stuckApts && stuckApts.length > 0) {
            console.log(`[AutoCloseCron] Found ${stuckApts.length} stuck sessions. Cleaning up...`);

            for (const apt of stuckApts) {
                const endTime = new Date().toISOString();
                const { error: updateErr } = await supabase
                    .from('appointments')
                    .update({
                        status: 'completed',
                        actual_end: endTime,
                        notes: `Auto-closed by Server Safety Valve (Stuck > 3h)`
                    })
                    .eq('id', apt.id);

                if (!updateErr) {
                    const msg = `[AutoCloseCron] Force-closed session for ${apt.client?.first_name} (Provider: ${apt.provider?.full_name})`;
                    console.log(msg);

                    // Persist to Audit Log
                    writeToLogFile({
                        level: 'WARN',
                        type: 'system.cleanup.force_close',
                        message: msg,
                        payload: { appointment_id: apt.id, provider: apt.provider?.full_name }
                    });
                }
            }
        }
    } catch (e) {
        console.error('[AutoCloseCron] Execution Exception:', e);
    }
};

// Start the Loops
setInterval(checkReminders, 60000);
checkReminders(); // Run once immediately on start

setInterval(checkStuckSessions, 60000);
checkStuckSessions(); // Run immediately

const server = http.createServer((req, res) => {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    if (req.url === '/send-whatsapp' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const { to, message } = JSON.parse(body);

                if (!ACCOUNT_SID || !AUTH_TOKEN) {
                    throw new Error('Twilio Credentials Missing');
                }

                const postData = new URLSearchParams({
                    'To': to.startsWith('whatsapp:') ? to : `whatsapp:${to}`,
                    'From': FROM_NUMBER,
                    'Body': message
                }).toString();

                const makeRequest = () => new Promise((resolve, reject) => {
                    const twilioReq = https.request({
                        hostname: 'api.twilio.com',
                        path: `/2010-04-01/Accounts/${ACCOUNT_SID}/Messages.json`,
                        method: 'POST',
                        headers: {
                            'Authorization': 'Basic ' + Buffer.from(`${ACCOUNT_SID}:${AUTH_TOKEN}`).toString('base64'),
                            'Content-Type': 'application/x-www-form-urlencoded',
                            'Content-Length': postData.length
                        }
                    }, (twilioRes) => {
                        let data = '';
                        twilioRes.on('data', chunk => data += chunk);
                        twilioRes.on('end', () => resolve({ statusCode: twilioRes.statusCode, data }));
                    });

                    twilioReq.on('error', (e) => reject(e));
                    twilioReq.write(postData);
                    twilioReq.end();
                });

                const response = await makeRequest();
                const responseData = JSON.parse(response.data || '{}');

                if (response.statusCode >= 400 && (responseData.code === 63016 || responseData.code === 63032)) {
                    console.log(`[Twilio Proxy] 24h Window Error (${responseData.code}) for ${to}. Attempting Template fallback...`);

                    const cleanPhone = to.replace('whatsapp:', '');
                    const { data: client, error: clientErr } = await supabase
                        .from('clients')
                        .select('id, first_name')
                        .eq('phone', cleanPhone)
                        .maybeSingle();

                    if (!client || clientErr) {
                        console.warn('[Twilio Proxy] Fallback failed: Client not found for phone', cleanPhone);
                        res.writeHead(response.statusCode, { 'Content-Type': 'application/json' });
                        res.end(response.data);
                        return;
                    }

                    const { data: apt } = await supabase
                        .from('appointments')
                        .select(`
                            scheduled_start, 
                            provider:profiles!appointments_assigned_profile_id_fkey(full_name)
                        `)
                        .eq('client_id', client.id)
                        .gte('scheduled_start', new Date().toISOString())
                        .order('scheduled_start', { ascending: true })
                        .limit(1)
                        .maybeSingle();

                    let fallbackSent = false;

                    if (apt) {
                        const localDate = new Date(apt.scheduled_start);
                        const dateStr = format(localDate, 'MMM do');
                        const timeStr = format(localDate, 'HH:mm');
                        fallbackSent = await sendTemplateMessage(to, dateStr, timeStr, client.first_name, apt.provider?.full_name);
                    } else {
                        const { data: pastApt } = await supabase
                            .from('appointments')
                            .select('scheduled_start, provider:profiles!appointments_assigned_profile_id_fkey(full_name)')
                            .eq('client_id', client.id)
                            .order('scheduled_start', { ascending: false })
                            .limit(1)
                            .maybeSingle();

                        if (pastApt) {
                            const localDate = new Date(pastApt.scheduled_start);
                            const dateStr = format(localDate, 'MMM do');
                            const timeStr = format(localDate, 'HH:mm');
                            fallbackSent = await sendTemplateMessage(to, dateStr, timeStr, client.first_name, pastApt.provider?.full_name);
                        } else {
                            fallbackSent = await sendTemplateMessage(to, "SOON", "TBD", client.first_name, "our Team");
                        }
                    }

                    if (fallbackSent) {
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({
                            success: true,
                            message: "Original failed (24h window), but Template sent to re-open session.",
                            original_error: responseData
                        }));
                    } else {
                        res.writeHead(response.statusCode, { 'Content-Type': 'application/json' });
                        res.end(response.data);
                    }
                } else {
                    res.writeHead(response.statusCode, { 'Content-Type': 'application/json' });
                    res.end(response.data);
                }

            } catch (error) {
                console.error('[Twilio Proxy] Handler Error:', error);
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: error.message }));
            }
        });
    } else if (req.url === '/log' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const data = JSON.parse(body);

                // Schema v1.3.0 Normalization & Enrichment
                const serverTs = new Date().toISOString();
                let logEntry;

                if (data.schema === "lat.audit.v1.3.0") {
                    // Native v3 support: Preserve and enrich
                    logEntry = {
                        ...data,
                        server_ts: serverTs,
                        metrics: {
                            ...data.metrics,
                            server_arrival_ms: Date.now() - new Date(serverTs).getTime() // internal processing overhead
                        }
                    };
                } else {
                    // Legacy Normalization to v1.3.0
                    logEntry = {
                        schema: "lat.audit.v1.3.0",
                        v: data.v || "1.2.0",
                        ts: data.ts || serverTs,
                        server_ts: serverTs,
                        event_id: data.event_id || crypto.randomUUID(),
                        trace_id: data.trace_id || data.event_id || crypto.randomUUID(),
                        parent_id: data.parent_id || null,
                        level: data.level || "INFO",
                        service: data.service || {
                            name: "apt-tracker-web",
                            env: "development",
                            module: "legacy-adapter"
                        },
                        event: {
                            name: data.event?.name || data.type?.toLowerCase().replace(/_/g, '.') || "unknown.legacy",
                            result_code: data.event?.result_code || "LEGACY_NORMALIZED"
                        },
                        actor: data.actor || { type: "unknown", name: "anonymous" },
                        payload: data.payload || data.data || {},
                        metrics: data.metrics || {},
                        context: {
                            is_demo: data.isDemo || data.context?.is_demo || false,
                            ...data.context
                        }
                    };
                }

                // Global Enrichment: Clock Drift & Validation
                if (logEntry.ts) {
                    const drift = Math.abs(new Date(serverTs) - new Date(logEntry.ts));
                    if (drift > 10000) { // 10s threshold for production auditing
                        logEntry.metrics.clock_drift_ms = drift;
                        logEntry.level = (logEntry.level === "ERROR") ? "ERROR" : "WARN";
                        logEntry.context.drift_warning = "High clock drift detected between client and server";
                    }
                }

                writeToLogFile(logEntry);

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true }));
            } catch (error) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: error.message }));
            }
        });
    } else if (req.url === '/clear-logs' && req.method === 'POST') {
        try {
            console.log('[Logger] Clearing all local log files...');
            const files = fs.readdirSync(LOGS_DIR);
            let count = 0;
            files.forEach(file => {
                if (file.endsWith('.log')) {
                    fs.unlinkSync(path.join(LOGS_DIR, file));
                    count++;
                }
            });

            // Reset state
            currentLogFile = null;
            currentLineCount = 0;

            console.log(`[Logger] Successfully cleared ${count} log files.`);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, files_cleared: count }));
        } catch (err) {
            console.error('[Logger] Failed to clear logs:', err);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message }));
        }
    }
    else {
        res.writeHead(404);
        res.end('Not Found');
    }
});

server.listen(PORT, () => {
    console.log(`Twilio Proxy running on http://localhost:${PORT}`);
    console.log(`Using Account: ${ACCOUNT_SID?.slice(0, 6)}...`);
    console.log('⏰ Reminder Cron: ACTIVE (Checks every 60s)');
});
