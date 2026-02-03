import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const rootDir = path.resolve(path.dirname(__filename), '..');
const LOGS_DIR = path.join(rootDir, 'Logs');

const analyzeLogs = async () => {
    console.log(`\n🔍 DEEP AUDIT: Analyzing all logs in ${LOGS_DIR}...\n`);

    if (!fs.existsSync(LOGS_DIR)) {
        console.log('No Logs directory found.');
        return;
    }

    const files = fs.readdirSync(LOGS_DIR)
        .filter(f => f.endsWith('.log'))
        .map(f => path.join(LOGS_DIR, f));

    if (files.length === 0) {
        console.log('No log files found.');
        return;
    }

    let allEntries = [];
    let errorCount = 0;
    let warningCount = 0;

    // 1. Read and Parse ALL files
    for (const file of files) {
        const content = fs.readFileSync(file, 'utf8');
        const lines = content.split('\n');

        for (const line of lines) {
            if (!line.trim()) continue;
            try {
                // Try JSON first
                if (line.trim().startsWith('{')) {
                    const entry = JSON.parse(line.trim());
                    // Normalize TS
                    let ts = entry.ts || entry.server_ts || entry.timestamp || new Date().toISOString();
                    allEntries.push({ ...entry, _raw_ts: ts, _source: path.basename(file) });
                } else {
                    // Plain text fallback (rare in this system)
                    // allEntries.push({ level: 'INFO', message: line, _raw_ts: null });
                }
            } catch (e) {
                // console.warn('Skipping malformed line');
            }
        }
    }

    // 2. Sort Chronologically
    allEntries.sort((a, b) => new Date(a._raw_ts || 0) - new Date(b._raw_ts || 0));

    // 3. Generate Report
    console.log(`found ${allEntries.length} total entries across ${files.length} files.\n`);

    const timeline = [];
    const stats = {
        errors: 0,
        warnings: 0,
        stuck_sessions_closed: 0,
        appointments_started: 0,
        appointments_ended: 0
    };

    allEntries.forEach(entry => {
        // Count Stats
        if (entry.level === 'ERROR') stats.errors++;
        if (entry.level === 'WARN') stats.warnings++;

        // Detect Key Events
        const msg = (entry.message || entry.msg || JSON.stringify(entry.payload || {})).toLowerCase();
        const type = (entry.type || entry.event?.name || "").toLowerCase();

        if (msg.includes('force-closed')) stats.stuck_sessions_closed++;
        if (type.includes('start')) stats.appointments_started++;
        if (type.includes('end')) stats.appointments_ended++;

        // Add to timeline if significant
        let isSignificant =
            entry.level === 'ERROR' ||
            entry.level === 'WARN' ||
            msg.includes('stuck') ||
            msg.includes('force') ||
            type.includes('audit');

        if (isSignificant) {
            const time = new Date(entry._raw_ts).toLocaleString();
            let summary = entry.message || `${entry.event?.name} - ${JSON.stringify(entry.payload)}`;
            if (summary.length > 150) summary = summary.substring(0, 150) + '...';

            timeline.push(`[${time}] [${entry.level || 'INFO'}] ${summary}`);
        }
    });

    console.log('--- 📊 STATISTICS ---');
    console.log(`Errors:   ${stats.errors}`);
    console.log(`Warnings: ${stats.warnings}`);
    console.log(`Stuck Sessions Cleared: ${stats.stuck_sessions_closed}`);
    console.log(`Appts Started/Ended:  ${stats.appointments_started} / ${stats.appointments_ended}`);

    console.log('\n--- 📅 TIMELINE OF KEY EVENTS (Earliest to Latest) ---');
    if (timeline.length > 50) {
        console.log(`(Showing last 50 of ${timeline.length} significant events)`);
        console.log(timeline.slice(-50).join('\n'));
    } else {
        console.log(timeline.join('\n'));
    }
    console.log('\n✅ Deep Audit Complete.');
};

analyzeLogs();
