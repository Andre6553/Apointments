# Appointments Tracker - Project Map (B.L.A.S.T.)

## 🎯 North Star
A self-healing, multi-user appointment system that eliminates client waiting time via real-time delay calculation and automated communication.

## 🛠 Status: Operational (Phase 5: Trigger Complete)
- **Phase 1: Blueprint** ✅
- **Phase 2: Link** ✅ (Twilio/Supabase Verified)
- **Phase 3: Architect** ✅ (Core Logic & Balancer)
- **Phase 4: Stylize** ✅ (Premium PC/Mobile UI)
- **Phase 5: Trigger** ✅ (Walkthrough & Deployment Readiness)

## 🏗 Data Schema
- `profiles`: User IDs, Names, Roles (Provider/Admin).
- `clients`: ID, Name, Phone (WhatsApp), Email.
- `appointments`: Scheduled times, Duration, Status, Delay, Actual Times.
- `breaks`: Label, Start Time, Duration.

## 🔗 Integrations
- **Database:** Supabase (Auth, RLS, PostgreSQL).
- **Messaging:** Twilio WhatsApp API (via Edge Function).
- **Reports:** jsPDF + autoTable.

## 🎨 Design System
- **Theme:** Dark Slate (Premium).
- **Aesthetic:** Glassmorphism, Responsive Sidebar, Pulsing Active States.
- **Responsiveness:** PC (Sidebar) / Mobile (Header + Grid).

## 📝 Maintenance Log
- **2026-01-22:** Project Completed. Full visual overhaul for mobile/PC. Resolved connectivity issues. PDF reports and Delays operational.
- **2026-01-21:** Implemented Workload Balancer and Delay Analysis Engine. Created WhatsApp Edge Function code.
