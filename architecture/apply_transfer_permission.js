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
    console.log('🚀 Allowing receivers to view incoming transfers...');
    const sqlPath = path.join(__dirname, 'allow_transfer_view.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    // First, verify if policy exists to avoid error (though CREATE POLICY usually errors if exists without IF NOT EXISTS)
    // We'll wrap in DO block or just try.
    // The previous scripts were simple. Let's trust exec_sql handles the error or we see it.

    // Actually, let's make it idempotent
    const idempotentSql = `
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM pg_policies
                WHERE tablename = 'appointments'
                AND policyname = 'Receivers can view incoming transfers'
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
        console.log('✅ Policy applied successfully!');
    }
}

runMigration();
