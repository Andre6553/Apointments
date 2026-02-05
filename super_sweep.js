
import fs from 'fs';
import path from 'path';
import { uploadToDrive } from './server/driveUtils.js';

const LOGS_DIR = 'c:/Users/User/Ai Projects/Apointments Tracker/Logs';
const THRESHOLD = 9999;

async function superSweep() {
    console.log(`🧹 Starting Super Sweep (Threshold: ${THRESHOLD})...`);
    const files = fs.readdirSync(LOGS_DIR);

    for (const file of files) {
        if (file.endsWith('.log')) {
            const filePath = path.join(LOGS_DIR, file);
            const content = fs.readFileSync(filePath, 'utf8');
            const lines = content.split('\n').filter(Boolean).length;

            if (lines >= THRESHOLD) {
                console.log(`📡 File ${file} has ${lines} lines. Uploading...`);
                const success = await uploadToDrive(filePath);
                if (success) {
                    fs.unlinkSync(filePath);
                    console.log(`✅ Deleted local copy: ${file}`);
                } else {
                    console.error(`❌ Failed to upload: ${file}`);
                }
            }
        }
    }
    console.log('✨ Super Sweep completed!');
}

superSweep();
