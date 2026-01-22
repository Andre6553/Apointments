# SOP: Notification Automation

## Goal
Automate client communications to manage expectations and reduce no-shows.

## 1. The 24-Hour Reminder
- **Trigger:** Cron job runs every hour.
- **Criteria:** Appointments scheduled for `T + 24 hours`.
- **Channel:** WhatsApp (Primary), Email (Secondary).
- **Tone:** Friendly reminder.

## 2. The Delay Alert (Dynamic)
- **Trigger:** `SOP: Delay Analysis` calculates a delay `> 10 minutes`.
- **Criteria:** Only notify clients whose `scheduled_start` is in the next 3 hours.
- **Logic:**
    - "Hi [Client], we are running about [X] minutes late today. Please arrive at [Revised Time]. Sorry for the wait!"
- **Response Handling:** System should track if the client acknowledges (if WhatsApp API supports).

## 3. The "Come Early" Alert
- **Trigger:** A `noshow` or early completion creates a gap.
- **Criteria:** Previous appointments are running early.
- **Logic:** "Hi [Client], we have an opening! Would you like to come at [Earlier Time] instead?"

## Technical Implementation
- **WhatsApp:** Use Meta Graph API or Twilio WhatsApp API.
- **Email:** Use Resend or Supabase default SMTP.
- **Queue:** Supabase Edge Functions for handling triggers.
