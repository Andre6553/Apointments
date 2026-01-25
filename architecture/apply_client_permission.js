import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const supabaseUrl = 'https://wxwparezjiourhlvyalw.supabase.co';
const serviceRoleKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind4d3BhcmV6amlvdXJobHZ5YWx3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTA1NjQyOCwiZXhwIjoyMDg0NjMyNDI4fQ.abW5spumitjnN2JC2IKwL4l7TUGW-05sIe4S6QV9-aI';

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function runMigration() {
    console.log('🚀 Allowing receivers to view transfer clients...');
    const sqlPath = path.join(__dirname, 'allow_client_view.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    const idempotentSql = `
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM pg_policies
                WHERE tablename = 'clients'
                AND policyname = 'Receivers can view clients of incoming transfers'
            ) THEN
                ${sql}
            END IF;
        END
        $$;
    `;

    const { error } = await supabase.rpc('exec_sql', { sql: idempotentSql });

    if (error) {
        console.error('❌ Migration failed:', error);
    } else {
        console.log('✅ Client Policy applied successfully!');
    }
}

runMigration();
