
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { format, subDays, startOfDay } from 'date-fns';
import { google } from 'googleapis';

const __filename = fileURLToPath(import.meta.url);
const rootDir = process.cwd();
const LOGS_DIR = path.join(rootDir, 'Logs');

const loadEnv = () => {
    let env = { ...process.env };
    const loadFile = (filename) => {
        try {
            const envPath = path.join(rootDir, filename);
            if (!fs.existsSync(envPath)) return;
            const envFile = fs.readFileSync(envPath, 'utf8');
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
        } catch (e) { }
    };
    loadFile('.env');
    loadFile('.env.local');
    return env;
};

const env = loadEnv();
const supabase = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY || env.VITE_SUPABASE_ANON_KEY);

// Drive Utils
const DRIVE_FOLDER_ID = '1bCPFgMwIoinDqqJsP5nZ_fodOv6YHbeP';
async function uploadToDrive(filePath, mimeType = 'text/plain') {
    const CLIENT_ID = env.GOOGLE_DRIVE_CLIENT_ID;
    const CLIENT_SECRET = env.GOOGLE_DRIVE_CLIENT_SECRET;
    const REFRESH_TOKEN = env.GOOGLE_DRIVE_REFRESH_TOKEN;
    if (!CLIENT_ID || !CLIENT_SECRET || !REFRESH_TOKEN) return false;
    try {
        const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, 'https://developers.google.com/oauthplayground');
        oauth2Client.setCredentials({ refresh_token: REFRESH_TOKEN });
        const drive = google.drive({ version: 'v3', auth: oauth2Client });
        const fileName = path.basename(filePath);
        const fileMetadata = { name: fileName, parents: [DRIVE_FOLDER_ID] };
        const media = { mimeType: mimeType, body: fs.createReadStream(filePath) };
        const response = await drive.files.create({ resource: fileMetadata, media: media, fields: 'id' });
        return !!response.data.id;
    } catch (error) {
        console.error('[Drive] Error:', error.message);
        return false;
    }
}

async function triggerSupabaseArchival() {
    console.log('🚀 Triggering BATCHED Supabase Multi-Table Archival...');
    const now = new Date();

    const archivableTables = [
        { name: 'audit_logs', tsCol: 'ts', days: 1 },
        { name: 'appointment_logs', tsCol: 'created_at', days: 1 },
        { name: 'notifications', tsCol: 'created_at', days: 3 },
        { name: 'temporary_messages', tsCol: 'created_at', days: 3 }
    ];

    for (const tableConfig of archivableTables) {
        const { name: tableName, tsCol, days } = tableConfig;
        const thresholdDate = startOfDay(subDays(now, days - 1)).toISOString();
        let hasMore = true;

        while (hasMore) {
            console.log(`\n🔍 Checking table: ${tableName} (older than ${thresholdDate})`);

            const { data: oldLogs, error: fetchErr } = await supabase
                .from(tableName)
                .select('*')
                .lt(tsCol, thresholdDate)
                .order(tsCol, { ascending: true })
                .limit(1000);

            if (fetchErr) {
                console.error(`❌ ${tableName} fetch error:`, fetchErr.message);
                hasMore = false;
                continue;
            }

            if (oldLogs && oldLogs.length > 0) {
                console.log(`📦 Found batch of ${oldLogs.length} records in ${tableName}. Archiving...`);
                const tsSuffix = format(subDays(now, days), 'yyyy-MM-dd');
                const tempFileName = `supabase_${tableName}_${tsSuffix}_manual_${Date.now()}.log`;
                const tempPath = path.join(LOGS_DIR, tempFileName);

                const content = oldLogs.map(l => JSON.stringify(l)).join('\n');
                fs.writeFileSync(tempPath, content);

                const success = await uploadToDrive(tempPath);
                if (success) {
                    const lastVal = oldLogs[oldLogs.length - 1][tsCol];
                    console.log(`✅ Upload success. Deleting ${tableName} records up to ${lastVal}...`);
                    const { error: delErr } = await supabase.from(tableName).delete().lte(tsCol, lastVal);
                    if (!delErr) {
                        console.log(`✨ Table ${tableName} batch cleared!`);
                        fs.unlinkSync(tempPath);
                        hasMore = oldLogs.length === 1000;
                    } else {
                        console.error(`❌ Delete failed for ${tableName}:`, delErr.message);
                        hasMore = false;
                    }
                } else {
                    console.error(`❌ Drive upload failed for ${tableName}. Records preserved.`);
                    hasMore = false;
                }
            } else {
                console.log(`ℹ️ No (more) records found in ${tableName}.`);
                hasMore = false;
            }
        }
    }
    console.log('\n🏁 Manual Archival Complete.');
}

triggerSupabaseArchival();
