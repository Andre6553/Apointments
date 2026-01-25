import http from 'http';
import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Simple ENV loader
const __filename = fileURLToPath(import.meta.url);
const rootDir = path.resolve(path.dirname(__filename), '..');

const loadEnv = () => {
    try {
        const envPath = path.join(rootDir, '.env');
        const envFile = fs.readFileSync(envPath, 'utf8');
        const env = {};
        envFile.split('\n').forEach(line => {
            const firstEq = line.indexOf('=');
            if (firstEq === -1) return;
            const key = line.substring(0, firstEq).trim();
            const val = line.substring(firstEq + 1).trim();
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

console.log('--- Twilio Proxy Config ---');
console.log(`SID: ${ACCOUNT_SID ? ACCOUNT_SID.slice(0, 4) + '...' + ACCOUNT_SID.slice(-4) : 'MISSING'}`);
console.log(`Token: ${AUTH_TOKEN ? AUTH_TOKEN.slice(0, 4) + '...' + AUTH_TOKEN.slice(-4) : 'MISSING'}`);
console.log(`From: ${FROM_NUMBER}`);
console.log('---------------------------');

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
});
