import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

async function checkSchema() {
    console.log("Checking appointments table schema...");
    const { data, error } = await supabase
        .from('appointments')
        .select('*')
        .limit(1);

    if (error) {
        console.error("Error fetching appointments:", error);
        return;
    }

    if (data && data.length > 0) {
        console.log("Appointments Table Columns:", Object.keys(data[0]));
        console.log("Sample Data:", data[0]);
    } else {
        console.log("Appointments table is empty, cannot infer schema from data.");
    }
}

checkSchema();
