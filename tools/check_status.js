import twilio from 'twilio';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const rootDir = path.resolve(path.dirname(__filename), '..');

const loadEnv = () => {
    const envPath = path.join(rootDir, '.env');
    const envFile = fs.readFileSync(envPath, 'utf8');
    const env = {};
    envFile.split('\n').forEach(line => {
        const [key, ...val] = line.split('=');
        if (key && val) env[key.trim()] = val.join('=').trim().replace(/^["']|["']$/g, '');
    });
    return env;
};

const env = loadEnv();
const accountSid = env.VITE_TWILIO_ACCOUNT_SID || env.TWILIO_ACCOUNT_SID;
const authToken = env.VITE_TWILIO_AUTH_TOKEN || env.TWILIO_AUTH_TOKEN;

const client = twilio(accountSid, authToken);

const sids = [
    'SM9f95305a242546eac9bfb4a88f8ced30',
    'SM277cf3c2b3e6c0d9430953e87df646f6'
];

async function checkStatus() {
    for (const sid of sids) {
        try {
            const message = await client.messages(sid).fetch();
            console.log(`SID: ${sid}`);
            console.log(`  To: ${message.to}`);
            console.log(`  Status: ${message.status}`);
            console.log(`  Error Code: ${message.errorCode || 'None'}`);
            console.log(`  Error Message: ${message.errorMessage || 'None'}`);
            console.log('---');
        } catch (e) {
            console.error(`Error fetching ${sid}:`, e.message);
        }
    }
}

checkStatus();
