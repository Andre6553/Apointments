
import fs from 'fs';
import path from 'path';
import { format, startOfDay } from 'date-fns';
import { uploadToDrive } from './server/driveUtils.js';

const LOGS_DIR = 'c:/Users/User/Ai Projects/Apointments Tracker/Logs';

async function triggerManualBackup() {
    console.log('🚀 Manual Backup Trigger Started...');
    const now = new Date();
    const todayStr = format(now, 'yyyy-MM-dd');

    console.log(`[Test] Today's date is: ${todayStr}`);
    console.log(`[Test] Checking directory: ${LOGS_DIR}`);

    if (!fs.existsSync(LOGS_DIR)) {
        console.error('❌ Logs directory not found!');
        return;
    }

    const files = fs.readdirSync(LOGS_DIR);
    let archiveCount = 0;

    for (const file of files) {
        // Find any .log file that is NOT from today
        if (file.endsWith('.log') && !file.includes(todayStr)) {
            const filePath = path.join(LOGS_DIR, file);
            console.log(`\n📦 Archiving: ${file}`);

            try {
                const success = await uploadToDrive(filePath);
                if (success) {
                    fs.unlinkSync(filePath);
                    console.log(`✅ Successfully uploaded and DELETED: ${file}`);
                    archiveCount++;
                } else {
                    console.error(`❌ Drive upload failed for: ${file}. File preserved.`);
                }
            } catch (err) {
                console.error(`❌ Error processing ${file}:`, err.message);
            }
        } else if (file.includes(todayStr)) {
            console.log(`ℹ️ Skipping current log: ${file}`);
        }
    }

    console.log(`\n✨ Finished! Archived ${archiveCount} historical log files.`);
}

triggerManualBackup();
