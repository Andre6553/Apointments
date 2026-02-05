# 🚨 Crisis Mode: Operational Walkthrough

This document explains the logic, triggers, and handling procedures for **Crisis Mode** within the Appointments Tracker workload management system.

---

## 1. Overview
**Crisis Mode** is a high-intensity operational state triggered by the **Crisis Recovery Engine**. It is activated when schedule delays reach a critical threshold that threatens "cascade failure"—a scenario where one delay causes every subsequent appointment to be hours late, potentially ruining the entire day's operations.

---

## 2. Triggers: What Activates Crisis Mode?
The system continuously monitors the "True Cascading Delay" for every provider. Movement into Crisis Mode is determined by the following logic:

| Trigger Type | Threshold | Description |
| :--- | :--- | :--- |
| **Standard Delay** | **45+ Minutes** | Triggered when a provider falls significantly behind their original schedule. |
| **Priority/VIP Path** | **20 Minutes** | Barrier to entry drops if a "Critical" appointment is detected (e.g., Surgery, Theater, VIP). |
| **Capacity Overload** | **> 100% Load** | Facility-wide load exceeds 100% capacity, making it mathematically impossible to finish on time. |

> **Note on Detection:** The system identifies critical appointments using skill codes (e.g., `'SURGERY'`) or keywords within the treatment names.

---

## 3. Detection & Notification Workflow
When the system identifies a crisis state:

1.  **Admin WhatsApp Alert:** If the delay exceeds 15 minutes, the `DelayEngine` sends an urgent notification to all Business Admins.
2.  **DND (Do Not Disturb) Logic:** If an Admin is already viewing the **Workload Balancer** page, WhatsApp alerts are suppressed to prevent spam while they are actively attending to the situation.
3.  **UI Activation:** The Dashboard activates the red **"CRISIS MODE ACTIVE"** banner with a live status indicator to signal that immediate intervention is required.

---

## 4. Handling Strategies: How the Crisis is Resolved
The system doesn't just alert; it calculates specific, high-impact solutions using three primary strategies:

### **Strategy A: Load Shedding (Approve Transfer)**
*   **Target:** Longest pending appointments in the delayed provider's queue.
*   **Logic:** Recommends moving "sacrificial" 30m or 60m tasks to other providers who are **Online** and have **Matching Skills**.
*   **Impact:** Immediately recovers large blocks of time for the original provider, stabilizing their remaining queue.

### **Strategy B: Strategic Deferral (Approve Postpone)**
*   **Target:** The last scheduled appointment of the day.
*   **Logic:** The engine performs an **Intelligent Future Scan** (next 14 days) to find the first opening with available capacity for that specific provider.
*   **Impact:** Suggests postponing a single client to a specific future date to save the team from extreme overtime and protect other clients' experiences.

### **Strategy C: Emergency Clear**
*   **Target:** Providers handling VIP or Surgery sessions.
*   **Logic:** Suggests moving *all other* clients away from that provider to ensure the critical path is clear.
*   **Impact:** Guarantees successful delivery of high-stakes appointments despite previous delays.

---

## 5. Administrative Control: Manual vs. Automatic
While the **Engine** is automatic, the **Execution** is manual to ensure quality control:

*   **Intelligence:** The detection, impact scoring, and future availability scanning are handled by `balancerLogic.js` and `delayEngine.js` automatically.
*   **Approval:** An Admin **must manually approve** the recommended actions (Transfer or Postpone). This ensures that human judgment is applied to high-stakes scheduling changes.
*   **Autopilot:** A separate "Smart Autopilot" can handle standard minor re-assignments, but **Crisis Load Shedding** always requests explicit confirmation.

---

## 6. Audit Logging & Telemetry
Every action taken during Crisis Mode is recorded for accountability:

*   **`delay.crisis.notified`**: Tracks which Admin was alerted and the delay duration at that moment.
*   **`crisis.load_shed`**: Logs exactly how many minutes were recovered and which provider accepted the transfer.
*   **`REASSIGN` / `AUTO_REASSIGN`**: Logs skill-match verification, previous provider IDs, and the ID of the person who approved the fix.
*   **Notification Audit**: Logs the success/failure of WhatsApp messages sent to clients informing them of their new times or provider shifts.

---

## 7. Smart Re-assignments vs. Crisis Mode

While both systems aim to fix delays, they operate at different "intensities." Think of **Smart Re-assignments** as a routine traffic manager, and **Crisis Mode** as an emergency response team.

### Comparison Breakdown

| Feature | Smart Re-assignments | Crisis Mode |
| :--- | :--- | :--- |
| **Trigger Time** | 15+ Minutes Late | 45+ Minutes Late (20m for VIP) |
| **Primary Method** | Finding available gaps | Load Shedding & Future Deferral |
| **Future Scanning** | No (Only looks at Today) | **Yes** (Scans 14 days ahead) |
| **Admin Impact** | Low (Efficiency tool) | High (Action recommended) |
| **Bulk Approval** | Yes ("Approve All") | No (Manual confirmation required) |
| **Sound/Visuals** | Subtle Indigo | Pulsing Red + Alarms |

### Key Differences in Logic

#### **Smart Re-assignments (Routine Optimization)**
*   **Goal:** Efficiency.
*   **Logic:** It looks for a "Perfect Swap." It searches for a provider who is currently online, has a gap in their schedule exactly when the delayed client needs it, and has the matching skills.
*   **Constraint:** It will **only** suggest a move if it can find a clean opening. It won't move a client if it thinks it will make the *new* provider late.
*   **Outcome:** *"Let's move Client A to Provider B because Provider B is doing nothing right now."*

#### **Crisis Mode (Emergency Intervention)**
*   **Goal:** Survival.
*   **Logic:** It uses **"Load Shedding"** and **"Strategic Deferral."** 
    *   **Load Shedding:** It doesn't just look for a "perfect gap." It identifies the heaviest tasks and suggests moving them to *anyone* capable, even if it puts that person under pressure, just to "shed the load" from the sinking provider.
    *   **Strategic Deferral:** If the floor is too busy, it scans the next **14 days** of the database to find the first available slot in the future and suggests moving the client to that day.
*   **Outcome:** *"We have to move this client or cancel the last two appointments of the day."*

---

## 8. Floor Capacity: Real-Time Facility Health

**Floor Capacity** is the "heartbeat" of your dashboard. It calculates whether your team can realistically finish all scheduled work before the end of their shifts.

### How it Works (The Math)

The system calculates a real-time ratio between **Load** and **Capacity**:

*   **Capacity (Supply):** For every **Online** provider, the system calculates the minutes remaining until their shift ends (based on Working Hours) and subtracts any future scheduled breaks.
*   **Load (Demand):** The system sums up the duration of all **Pending** and **Active** appointments currently assigned to those providers.
*   **Health Score:** `(Total Load / Total Capacity) * 100`

### Status Levels

| Status | Percentage | Operational Meaning |
| :--- | :--- | :--- |
| 🟢 **Stable** | **0% - 80%** | Healthy buffer. The system can handle minor overruns without breaking the schedule. |
| 🟡 **Warning** | **80% - 99%** | Near maximum capacity. Any further delay will likely cause a cascade failure. |
| 🔴 **Critical** | **100%+** | **Mathematically impossible** to finish today's work within current hours. Overtime is guaranteed. |

### Predictive "At Risk" Logic

The engine doesn't just look at global totals; it analyzes individual workloads:
1.  If a provider's specific **Load > Capacity**, the system identifies the exact appointments that will push them into overtime.
2.  These are flagged as **"At Risk"** in the dashboard (e.g., *"+30m Excess predicted for Dr. Smith"*).
3.  This allows Admins to intervene *before* the delay even happens by reassigning the "At Risk" appointments.

---

## 9. Optimization Available: The Strategic Autopilot

The **"Optimization Available"** banner is the system's "Efficiency Brain." It appears only when the `Smart Autopilot` engine finds a way to shuffle the schedule that benefits multiple people at once.

### How it Works (The Logic)
Unlike Crisis Mode (which is reactive), the Optimizer is **proactive**. It searches for "Time-Swap" opportunities.
*   **The Logic:** It pulls your entire facility's schedule into a temporary memory grid. It then runs 100+ simulations to see: *"If I move Client A to Provider B, and Client C to Provider D, does everyone wait less time without making anyone late?"*
*   **The Difference:** The Optimizer only suggests "Perfect Swaps"—moves that result in **Zero Delay** for the new provider.

### Key Features of this Section
1.  **"AUTO-FIX SCHEDULE" (Bulk Approval):** This is the only part of the system that allows **Bulk Action**. Instead of clicking every client, the system proposes a master plan to fix the whole facility's schedule in one click.
2.  **Delay Saved Counter:** It displays a total count of "Minutes Saved" (e.g., *"Found 3 sessions that can be rebalanced, saving 45m"*).

---

## 10. Conclusion: The Real-Time Decision Hierarchy

To understand how these four systems (Delay Engine, Capacity, Crisis, and Optimization) work together, imagine the Balancer as a **Living Organism**. Here is the priority hierarchy of the logic:

### The Priority Ranking

| Priority | System Name | Role | Operational Analogy |
| :--- | :--- | :--- | :--- |
| **1st** | **Delay Engine** | **The Radar** | Seeing the "Ripple" before it hits. |
| **2nd** | **Floor Capacity** | **The Pulse** | Knowing how much energy (time) the team has left. |
| **3rd** | **Crisis Mode** | **Emergency Room** | Drastic actions (Load Shedding) to save the day. |
| **4th** | **Optimization** | **The Brain** | Constant, strategic logic to keep the day perfect. |

### How They Prevent Clashes
All systems feed into a single **"Constraint Validator."** Whether it's a Manual Move, an Optimization Swap, or a Crisis Load Shed, the system runs a **Triple-Check Security Gate**:
1.  **No Overlaps:** It checks the `scheduled_start` + `duration` against all other appointments.
2.  **Breadcrumb Logic:** If a provider is delayed, the system "virtually" shifts their breaks and lunchtimes forward in its head. It will never book a client into a slot that the provider is *mathematically* likely to be on break for.
3.  **Skill Lock:** It verifies skill-codes (e.g., `CARDIOLOGY`) against the provider's `skills` array. It will show "No Qualified Providers" (as seen in the logs) rather than risk a clash of expertise.

### Final Summary
In short: **The Radar** sees the problem, **The Pulse** measures the facility's strength, **Crisis Mode** handles the emergencies, and **Optimization** fine-tunes the efficiency. They work in a loop: every time you approve an Optimization or Crisis move, the Radar recalculates, and the Pulse updates. It is a perfectly balanced system where math ensures no client is left behind.

---
*Created on: 2026-02-04*
*Version: 1.4 - Integrated Optimization & Hierarchy Summary*



