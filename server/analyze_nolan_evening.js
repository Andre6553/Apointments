
import fs from 'fs';

const logFile = 'c:\\Users\\User\\Ai Projects\\Apointments Tracker\\Logs\\5690ad0a-60b9-4823-9c83-fa4a6ad370e3_2026-02-02.log';
const targetAptId = 'b2834acc-6881-48fc-b1b1-86c9ca69e790';

function analyzeEvening() {
    if (!fs.existsSync(logFile)) return;
    const content = fs.readFileSync(logFile, 'utf8');
    const lines = content.split('\n');

    console.log(`🔍 Analyzing Nolan's 22:05 Appointment (Evening Logs)`);

    lines.forEach(line => {
        if (!line.trim()) return;
        try {
            const log = JSON.parse(line);
            // Looking for events after 18:00 UTC (20:00 Local)
            if (log.ts > '2026-02-02T18:00:00Z') {
                const ts = new Date(log.ts).toLocaleString();
                const logStr = line;

                if (logStr.includes(targetAptId)) {
                    console.log(`[${ts}] ${log.event?.name}: ${log.actor?.name}`);
                    if (log.event?.name === 'delay.propagate') {
                        console.log(`  DELAY: Nolan's 22:05 pushed to ${log.payload.delay_minutes}min delay`);
                    }
                    if (log.event?.name.includes('reassign')) {
                        console.log(`  REASSIGN: To provider ${log.payload.provider_id?.substring(0, 8)}`);
                    }
                }

                // Also check for VirtualAssistant cycles during that time
                if (log.event?.name === 'appointment.assistant_cycle') {
                    // Check if Nolan was a candidate
                    const tasks = log.payload?.tasks || [];
                    const nolanTask = tasks.find(t => t.id === targetAptId);
                    if (nolanTask) {
                        console.log(`[${ts}] VA Plan: Nolan ${nolanTask.type}`);
                    }
                }
            }
        } catch (e) { }
    });
}

analyzeEvening();
