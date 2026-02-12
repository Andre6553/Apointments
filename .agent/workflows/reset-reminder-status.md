---
description: Reset WhatsApp Reminder Status to allow re-testing
---

This workflow resets the `last_ran` timestamp for all businesses in the database. 
Use this when you want to force the automation to run again immediately (e.g., for testing purposes) after it has already run for the day.

1. Run the reset script
// turbo
```bash
node scripts/reset_reminders.js
```
