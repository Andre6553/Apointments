# 📔 Appointments Tracker: The Complete Operational & Technical Guide

Welcome to the definitive guide for **Appointments Tracker**, a next-generation facility management platform designed for high-intensity environments like medical clinics and high-end salons. This system moves beyond simple calendaring by implementing a "Workload Intelligence" engine that predicts, reacts to, and optimizes human capital in real-time.

---

## 🏛️ 1. Core Philosophy: Logic-Driven Operations

Most scheduling apps are static. They tell you *what* is booked, but not *how* the day is actually progressing. Appointments Tracker is built on three pillars:
1.  **Predictive Delay Modeling**: Seeing the "ripple effect" of a 10-minute delay hours before it causes a bottleneck.
2.  **Resource Elasticity**: Treating staff as a dynamic pool of skills rather than fixed slots.
3.  **Human-in-the-loop Automation**: Providing high-level AI suggestions (Crisis Mode, Optimization) while keeping administrative experts in final control.

---

## ⚙️ 2. Technical Architecture

The platform is a modern full-stack web application built for speed and reliability.

-   **Frontend**: React (Vite) with Tailwind CSS for high-performance UI.
-   **Animations**: Framer Motion for smooth, "living" dashboard transitions.
-   **Database**: Supabase (PostgreSQL) with Realtime capabilities.
-   **Communication**: Twilio-powered WhatsApp proxy for client notifications.
-   **Audit System**: Deep telemetry logging that records every micro-action for operational auditing.
-   **Infrastructure**: Deployed on Vercel with integrated background workers for scheduled checks.

---

## 🧠 3. The Four Pillars of the Intelligence Engine

The "Workload Balancer" is the heart of the app. It consists of four interconnected systems:

### 📡 A. The Radar (Delay Engine)
The Delay Engine continuously compares the `scheduled_start` to the `actual_start`. 
- **The Ripple Effect**: If a client starts 15 minutes late, the engine automatically calculates the new "Projected Start" for every subsequent client in that provider's queue.
- **Visual Feedback**: The dashboard shifts from static times to live "Projected" countdowns (e.g., *"Starting in 8m"*).

### 💓 B. The Pulse (Floor Capacity)
This measures the mathematical "Oxygen" left in your facility.
- **The Math**: `(Minutes of Pending Work / Minutes of Staff Capacity Remaining) * 100`.
- **Thresholds**: 
    - **Green (0-80%)**: Healthy buffer.
    - **Yellow (80-99%)**: Bottleneck imminent.
    - **Red (100%+)**: Overtime guaranteed; intervention required.

### 🚑 C. Crisis Mode (The Emergency Room)
Triggered when a provider falls 45+ minutes behind (or 20m for VIPs).
- **Load Shedding**: The engine identifies the longest pending tasks and suggests moving them to other qualified providers.
- **Future Deferral**: If the facility is 100% full, the engine scans the next 14 days to suggest specific rescheduling slots for the final clients of the day.

### 🧠 D. The Optimizer (Smart Autopilot)
A proactive engine that constantly simulates "Time-Swaps."
- **Scenario Testing**: *"If I move Client A to Provider B, does everyone wait less time?"*
- **Auto-Fix**: Large-scale rescheduling suggestions that can be approved with a single click to save cumulative hours across the team.

---

## 🔒 4. Skill Lock & Expert Matching

To prevent scheduling errors, the system implements a strict **Skill Lock** mechanism:
-   Each provider has a defined skill array (e.g., `['Nail Art', 'Medical Pedicure']`).
-   Each treatment has a required skill code.
-   The Balancer will *only* suggest transfers to providers who meet the exact skill requirements, ensuring service quality never drops during chaos.

---

## 📱 5. Automated Communication

The system acts as a virtual bridge between the staff and the clients.
-   **WhatsApp Delay Alerts**: When a rebalance happens, the client automatically receives a WhatsApp notification with their new provider or updated time.
-   **Admin Alerts**: Admins receive urgent WhatsApp notifications when Crisis Mode is triggered, unless they are already on the Workload page (DND logic).

---

## 💾 6. Security & Continuity

-   **Google Drive Backups**: Logs and reports are automatically backed up to a secure Google Drive folder via the `GoogleApiClient`.
-   **Subscription Amnesty**: A 24-hour grace period for expired accounts where appointments are automatically reassigned to the Admin to prevent revenue loss.
-   **Real-time Synch**: Uses Supabase Realtime to ensure that if one Admin moves a client, the change appears instantly on every dashboard across the facility.

---

## 📈 7. Operations Manual: Best Practices

1.  **Morning Check**: Look at "The Pulse." If you are starting at 70%, you have room for walk-ins.
2.  **The Red Banner**: When the "CRISIS MODE" banner appears, click it immediately. Review the "Load Shedding" suggestions and hit "Approve" to stabilize the floor.
3.  **Approve All**: Use the "Optimization Available" banner twice a day (late morning and mid-afternoon) to tuck in any gaps and save staff cumulative overtime.
4.  **Log Reviews**: End of day, check the "Daily Log Insights" to see which techs are consistently triggering the Delay Engine to adjust their standard treatment durations.

---

*Guide Version: 1.5*  
*Last Updated: 2026-02-07*
