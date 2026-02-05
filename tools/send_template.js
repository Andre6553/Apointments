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
const fromNumber = env.VITE_TWILIO_WHATSAPP_FROM || env.TWILIO_WHATSAPP_FROM;
const toNumber = 'whatsapp:+27761963997';

const client = twilio(accountSid, authToken);

async function sendTemplate() {
    console.log(`📨 Attempting to send TEMPLATE message to ${toNumber}...`);
    try {
        // This is the standard Twilio Sandbox "Appointment Reminder" template
        const body = `Your appointment is coming up on July 21 at 3PM`;

        const message = await client.messages.create({
            body: body,
            from: fromNumber,
            to: toNumber
        });

        console.log('✅ Success! Message SID:', message.sid);
        console.log('Status:', message.status);
    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

sendTemplate();
