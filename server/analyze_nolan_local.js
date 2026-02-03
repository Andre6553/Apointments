
import fs from 'fs';
import path from 'path';

const logFile = 'c:\\Users\\User\\Ai Projects\\Apointments Tracker\\Logs\\5690ad0a-60b9-4823-9c83-fa4a6ad370e3_2026-02-02.log';
const nolanClientId = '17a7047c-cc3b-4c3d-becc-33e4d66c3d79';
const aptIds = ['b2834acc-6881-48fc-b1b1-86c9ca69e790', '8780a677-5b26-4e1d-b079-94be531e95b8', '620e58a2-6d49-4bf7-83a0-09b9d30c72dd'];

function analyze() {
    console.log('📖 Analyzing Feb 2nd Local Logs for Nolan...');
    if (!fs.existsSync(logFile)) {
        console.error('Log file not found');
        return;
    }

    const content = fs.readFileSync(logFile, 'utf8');
    const lines = content.split('\n');
    let matchCount = 0;

    lines.forEach(line => {
        if (!line.trim()) return;
        try {
            const log = JSON.parse(line);
            const logStr = JSON.stringify(log);

            const matchesId = aptIds.some(id => logStr.includes(id)) || logStr.includes(nolanClientId);

            if (matchesId) {
                matchCount++;
                console.log(`[${log.ts}] ${log.event?.name || 'UNKNOWN'}: ${log.actor?.name || 'System'}`);
                console.log(`  Description: ${log.event?.reason || log.description || 'N/A'}`);
                if (log.payload) console.log(`  Payload: ${JSON.stringify(log.payload)}`);
                if (log.metrics) console.log(`  Metrics: ${JSON.stringify(log.metrics)}`);
                console.log('---');
            }
        } catch (e) {
            // Not JSON
            if (line.includes(nolanClientId) || aptIds.some(id => line.includes(id))) {
                console.log('Non-JSON Match:', line);
            }
        }
    });

    console.log(`\nFound ${matchCount} matches.`);
}

analyze();
