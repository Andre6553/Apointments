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

console.log('--- Twilio Proxy Config ---');
console.log(`SID: ${ACCOUNT_SID ? ACCOUNT_SID.slice(0, 4) + '...' + ACCOUNT_SID.slice(-4) : 'MISSING'}`);
console.log(`Token: ${AUTH_TOKEN ? AUTH_TOKEN.slice(0, 4) + '...' + AUTH_TOKEN.slice(-4) : 'MISSING'}`);
console.log(`From: ${FROM_NUMBER}`);
console.log('---------------------------');

// --- Helper to Send Template Message ---
const sendTemplateMessage = async (to, date, time) => {
    return new Promise((resolve, reject) => {
        try {
            const message = `Your appointment is coming up on ${date} at ${time}`;
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

        const { data: apts, error } = await supabase
            .from('appointments')
            .select(`
                id, scheduled_start, 
                client:clients(first_name, phone, whatsapp_opt_in),
                notifications_sent
            `)
            .eq('status', 'pending')
            .is('reminder_sent', false) // Only unsent reminders
            .eq('notifications_sent', 0) // Only if NO delay notification sent
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

                // Format for Template
                const dateStr = format(new Date(apt.scheduled_start), 'MMM do');
                const timeStr = format(new Date(apt.scheduled_start), 'HH:mm');

                const sent = await sendTemplateMessage(apt.client.phone, dateStr, timeStr);

                if (sent) {
                    console.log(`[ReminderCron] Sent reminder to ${apt.client.first_name}`);
                    await supabase.from('appointments').update({ reminder_sent: true }).eq('id', apt.id);
                }
            }
        }
    } catch (e) {
        console.error('Reminder Loop Ex:', e);
    }
};

// Start the Loop
setInterval(checkReminders, 60000);
checkReminders(); // Run once immediately on start

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
        req.on('end', () => {
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
                    twilioRes.on('end', () => {
                        res.writeHead(twilioRes.statusCode, { 'Content-Type': 'application/json' });
                        res.end(data);
                    });
                });

                twilioReq.on('error', (e) => {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: e.message }));
                });

                twilioReq.write(postData);
                twilioReq.end();

            } catch (error) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: error.message }));
            }
        });
    } else {
        res.writeHead(404);
        res.end('Not Found');
    }
});

server.listen(PORT, () => {
    console.log(`Twilio Proxy running on http://localhost:${PORT}`);
    console.log(`Using Account: ${ACCOUNT_SID?.slice(0, 6)}...`);
    console.log('⏰ Reminder Cron: ACTIVE (Checks every 60s)');
});
