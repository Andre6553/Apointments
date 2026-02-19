import fs from 'fs';
import path from 'path';

const logsDir = './Logs';
const searchTerms = ['Jeremiah', 'b3da6708-acc7-4350-8dab-9bc9b1418fc6', '4568bcf8-57de-43e0-b073-5092ec061bb2', 'John Dorian'];

async function parseLogs() {
    const files = fs.readdirSync(logsDir).filter(f => f.startsWith('Demo_Business_') && f.endsWith('.log'));
    const results = [];

    for (const file of files) {
        const content = fs.readFileSync(path.join(logsDir, file), 'utf8');
        const lines = content.split('\n');

        lines.forEach((line, index) => {
            if (searchTerms.some(term => line.includes(term))) {
                try {
                    const log = JSON.parse(line);
                    results.push({
                        file,
                        line: index + 1,
                        ts: log.ts,
                        event: log.event?.name || log.event,
                        actor: log.actor?.name,
                        apt_id: log.payload.appointment_id || log.payload.id,
                        treatment: log.payload.treatment || log.payload.treatment_name,
                        services: log.payload.additional_services
                    });
                } catch (e) { }
            }
        });
    }

    results.sort((a, b) => new Date(a.ts) - new Date(b.ts));

    console.log(`Found ${results.length} results:`);
    results.forEach(r => {
        console.log(`[${r.file}:${r.line}] ${r.ts} | ${r.event} | ${r.actor} | ID: ${r.apt_id} | Treatment: ${r.treatment} | Services: ${JSON.stringify(r.services)}`);
    });
}

parseLogs();
