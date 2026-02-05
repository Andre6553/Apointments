
import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const rootDir = path.resolve(path.dirname(__filename), '..');

// --- Simple ENV loader to match project style ---
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

// Folder ID from user: 1bCPFgMwIoinDqqJsP5nZ_fodOv6YHbeP
const DRIVE_FOLDER_ID = '1bCPFgMwIoinDqqJsP5nZ_fodOv6YHbeP';

export async function uploadToDrive(filePath, mimeType = 'text/plain') {
    const CLIENT_ID = env.GOOGLE_DRIVE_CLIENT_ID;
    const CLIENT_SECRET = env.GOOGLE_DRIVE_CLIENT_SECRET;
    const REFRESH_TOKEN = env.GOOGLE_DRIVE_REFRESH_TOKEN;

    if (!CLIENT_ID || !CLIENT_SECRET || !REFRESH_TOKEN) {
        console.warn('⚠️ Google Drive OAuth credentials missing in .env. Backup skipped.');
        return false;
    }

    try {
        const oauth2Client = new google.auth.OAuth2(
            CLIENT_ID,
            CLIENT_SECRET,
            'https://developers.google.com/oauthplayground'
        );

        oauth2Client.setCredentials({
            refresh_token: REFRESH_TOKEN
        });

        const drive = google.drive({ version: 'v3', auth: oauth2Client });
        const fileName = path.basename(filePath);

        const fileMetadata = {
            name: fileName,
            parents: [DRIVE_FOLDER_ID],
        };

        const media = {
            mimeType: mimeType,
            body: fs.createReadStream(filePath),
        };

        console.log(`[Drive] Uploading ${fileName} to Google Drive (Personal Storage)...`);
        const response = await drive.files.create({
            resource: fileMetadata,
            media: media,
            fields: 'id',
        });

        if (response.data.id) {
            console.log(`[Drive] Upload successful! File ID: ${response.data.id}`);
            return true;
        }
        return false;
    } catch (error) {
        console.error('[Drive] Upload error details:', error.message);
        if (error.response?.data) {
            console.error('[Drive] API Error:', JSON.stringify(error.response.data, null, 2));
        }
        return false;
    }
}
