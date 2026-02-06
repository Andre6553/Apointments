import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const rootDir = path.resolve(path.dirname(__filename), '..');

const loadEnv = () => {
    let env = {};
    const loadFile = (filename) => {
        const p = path.join(rootDir, filename);
        if (!fs.existsSync(p)) return;
        const content = fs.readFileSync(p, 'utf8');
        content.split('\n').forEach(line => {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) return;
            const eq = trimmed.indexOf('=');
            if (eq === -1) return;
            let k = trimmed.substring(0, eq).trim();
            let v = trimmed.substring(eq + 1).trim();
            if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
                v = v.substring(1, v.length - 1);
            }
            env[k] = v;
        });
    };
    loadFile('.env');
    loadFile('.env.local');
    return env;
};

const env = loadEnv();
const sid = env.VITE_TWILIO_ACCOUNT_SID || env.TWILIO_ACCOUNT_SID;
const token = env.VITE_TWILIO_AUTH_TOKEN || env.TWILIO_AUTH_TOKEN;

console.log(`Testing SID: ${sid}`);
console.log(`Testing Token: ${token ? 'PRESENT' : 'MISSING'}`);

const options = {
    hostname: 'api.twilio.com',
    path: `/2010-04-01/Accounts/${sid}.json`, // Simple GET request to account info
    method: 'GET',
    headers: {
        'Authorization': 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64')
    }
};

const req = https.request(options, (res) => {
    let data = '';
    res.on('data', (chunk) => data += chunk);
    res.on('end', () => {
        console.log(`Status: ${res.statusCode}`);
        console.log(`Response: ${data}`);
    });
});

req.on('error', (e) => {
    console.error('Error:', e.message);
});

req.end();
