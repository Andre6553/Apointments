---
description: how to perform database migrations using Supabase RPC
---
// turbo-all

# Database Migration Workflow

When performing database migrations (adding columns, creating tables, updating RLS), ALWAYS use the `exec_sql` RPC function. Do NOT attempt to connect via direct PostgreSQL (`pg` client) unless this method fails.

### Connection Details
- **SUPABASE_URL**: `https://wxwparezjiourhlvyalw.supabase.co`
- **SERVICE_ROLE_KEY**: Found in the [.env](file:///c:/Users/User/Ai%20Projects/Apointments%20Tracker/.env) file under `SUPABASE_SERVICE_ROLE_KEY`.

### Procedure

1. **Create a temporary migration script** (e.g., `run_migration.js`):
   ```javascript
   import { createClient } from '@supabase/supabase-js';
   import fs from 'fs';
   import path from 'path';

   const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

   async function migrate() {
       const sql = fs.readFileSync(path.join(process.cwd(), 'architecture/working_hours.sql'), 'utf8');
       const { error } = await supabase.rpc('exec_sql', { sql });
       if (error) {
           console.error('❌ Migration failed:', error);
           process.exit(1);
       } else {
           console.log('✅ Migration successful');
       }
   }
   migrate();
   ```

2. **Run the script**:
   ```bash
   node run_migration.js
   ```

3. **Cleanup**:
   Delete the temporary script after verification.
