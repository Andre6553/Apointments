
import fs from 'fs';

const logFile = 'c:\\Users\\User\\Ai Projects\\Apointments Tracker\\Logs\\5690ad0a-60b9-4823-9c83-fa4a6ad370e3_2026-02-02.log';
const nolanClientId = '17a7047c-cc3b-4c3d-becc-33e4d66c3d79';
const targetAptId = 'b2834acc-6881-48fc-b1b1-86c9ca69e790'; // Nolan 22:05 (20:05 UTC)

function analyze() {
    if (!fs.existsSync(logFile)) return;
    const content = fs.readFileSync(logFile, 'utf8');
    const lines = content.split('\n');

    console.log(`🔍 Specifically tracking Nolan's 22:05 Appointment (${targetAptId})`);

    lines.forEach(line => {
        if (!line.trim()) return;
        try {
            const log = JSON.parse(line);
            const logStr = line;

            // Check if this log relates to the specific 22:05 appointment or Nolan in general at that time
            if (logStr.includes(targetAptId) || (logStr.includes(nolanClientId) && log.ts > '2026-02-02T19:00:00Z')) {
                const ts = new Date(log.ts).toLocaleTimeString();
                console.log(`[${ts}] ${log.event?.name}: ${log.actor?.name}`);

                if (log.payload?.previous_provider_id) {
                    console.log(`  SHIFT: From ${log.payload.previous_provider_id.substring(0, 8)} To ${log.payload.provider_id?.substring(0, 8)}`);
                }

                if (log.event?.name === 'delay.propagate') {
                    if (log.payload?.affected_ids?.includes(targetAptId)) {
                        console.log(`  DELAY: Nolan's 22:05 was pushed by ${log.payload.delay_minutes}min due to ${log.payload.trigger_appointment_id?.substring(0, 8)}`);
                    }
                }

                if (log.event?.name.includes('reassign')) {
                    console.log(`  REASSIGN: To provider ${log.payload.provider_id?.substring(0, 8)}`);
                    if (log.metrics?.trigger) console.log(`  TRIGGER: ${log.metrics.trigger}`);
                }
            }
        } catch (e) { }
    });
}

analyze();
