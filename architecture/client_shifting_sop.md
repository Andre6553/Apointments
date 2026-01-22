# SOP: Client Shifting Logic

## Goal
Balance the workload between providers (e.g., Dr1 is late, Dr2 is free) to minimize total client wait time across the organization.

## Logic Flow
1. **Detection:** System identifies a `Delay > 20 minutes` for Provider A.
2. **Search:** System checks for Provider B within the same organization who has:
    - Status: `free` or `upcoming gap`.
    - No appointment scheduled for the next `X` minutes.
3. **Validation:**
    - Ensure Provider B is capable of the same service (if service types are implemented).
4. **Action:**
    - System prompts Provider A/Reception: "Shift Client X to Provider B?"
    - If approved:
        - `appointment.assigned_profile_id` is updated to Provider B.
        - `appointment.shifted_from_id` stores Provider A's ID.
        - `appointment.status` set to `shifted`.
5. **Ownership Persistence:**
    - The client remains in Provider A's database (`client.owner_profile_id` does not change).

## Constraints
- Shifts must be recorded to ensure PDF reports accurately reflect who performed the work vs who owns the client.
