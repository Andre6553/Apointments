import pg from 'pg';
const { Client } = pg;
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function run() {
    console.log('🚀 Connecting to database via us-east-1 pooler (52.45.94.125)...');

    const client = new Client({
        host: '52.45.94.125',
        port: 5432,
        database: 'postgres',
        user: 'postgres',
        password: 'kGcCMPnlMRQZWDYb',
        ssl: {
            rejectUnauthorized: false,
            servername: 'db.wxwparezjiourhlvyalw.supabase.co'
        }
    });

    try {
        await client.connect();
        console.log('✅ Connected to database!');

        const sqlPath = path.join(__dirname, 'optimization.sql');
        const sql = fs.readFileSync(sqlPath, 'utf8');

        console.log('Applying indexes and analyzing tables...');
        await client.query(sql);

        console.log('✅ Database optimization successful!');
    } catch (err) {
        console.error('❌ Optimization failed:', err.message);
        process.exit(1);
    } finally {
        await client.end();
    }
}

run();
