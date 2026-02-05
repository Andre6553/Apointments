
import fs from 'fs';
import path from 'path';
import { format } from 'date-fns';
import { uploadToDrive } from './server/driveUtils.js';

const LOGS_DIR = 'c:/Users/User/Ai Projects/Apointments Tracker/Logs';
const todayStr = format(new Date(), 'yyyy-MM-dd');

async function purgeOldLogs() {
    console.log('🧹 Purging all logs except for today\'s active files...');
    const files = fs.readdirSync(LOGS_DIR);

    for (const file of files) {
        if (!file.endsWith('.log')) continue;

        const filePath = path.join(LOGS_DIR, file);

        // Rules:
        // 1. If the filename DOES NOT contain today's date (e.g. 2026-02-03), it's OLD.
        // 2. If it contains "partX" or "FULL", it's a fragment/testing file.

        const isOldDate = !file.includes(todayStr);
        const isFragment = file.includes('_part') || file.includes('_FULL');

        if (isOldDate || isFragment) {
            console.log(`📡 Uploading & Deleting: ${file}...`);
            const success = await uploadToDrive(filePath);
            if (success) {
                fs.unlinkSync(filePath);
                console.log(`✅ Cleared: ${file}`);
            } else {
                console.error(`❌ Failed to backup ${file}, skipping deletion.`);
            }
        } else {
            console.log(`✅ Keeping active log: ${file}`);
        }
    }
    console.log('✨ Folder is now clean!');
}

purgeOldLogs();
