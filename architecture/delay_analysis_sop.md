# SOP: Appointment Delay Analysis

## Goal
Dynamically adjust the daily schedule for all subsequent appointments based on real-time "Start" and "Stop" events recorded by the provider.

## Logic Flow
1. **Event Trigger:** Provider clicks "Start" or "End" on a device.
2. **Immediate Calculation:**
    - `Delay = Actual Start Time - Scheduled Start Time`
    - If `Delay > 5 minutes` (Threshold), trigger recalculation for all `pending` appointments of that provider for the rest of the day.
3. **Cumulative Delay Tracking:**
    - The system must account for "Breaks". If a delay pushes an appointment into a scheduled break, the appointment must be moved to *after* the break.
4. **No-Show Handling:**
    - If a client is >15 minutes late and hasn't started, the system flags as `noshow`.
    - This creates an "Opening", which might offset previous delays or allow for earlier appointments.

## Data Inputs
- `appointment.scheduled_start`
- `appointment.duration_minutes`
- `break_schedule`
- `appointment.actual_start`

## Output
- Updated `delay_minutes` for all downstream appointments.
- Trigger for `SOP: Notification Automation`.
