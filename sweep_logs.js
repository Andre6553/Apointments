
import fs from 'fs';
import path from 'path';
import { uploadToDrive } from './server/driveUtils.js';

const LOGS_DIR = 'c:/Users/User/Ai Projects/Apointments Tracker/Logs';

async function sweepLogs() {
    console.log('🧹 Starting Log Sweeper...');
    const files = fs.readdirSync(LOGS_DIR);

    for (const file of files) {
        if (file.endsWith('_FULL.log')) {
            const filePath = path.join(LOGS_DIR, file);
            console.log(`📡 Uploading legacy file: ${file}...`);
            const success = await uploadToDrive(filePath);
            if (success) {
                fs.unlinkSync(filePath);
                console.log(`✅ Deleted local copy: ${file}`);
            } else {
                console.error(`❌ Failed to upload: ${file}`);
            }
        }
    }
    console.log('✨ Sweep completed!');
}

sweepLogs();
