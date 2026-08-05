---
name: SupportDesk environment data
description: The relationship between the published Web UI data and the development Expo app data.
---

SupportDesk’s published Web UI and development Expo app use separate database environments. A template created in the published Web UI is not automatically available to Expo; development seed data or a development-side template creation is required.

**Why:** The production database can contain settings while the development database remains empty, even though both clients use the same API contracts and schema.

**How to apply:** When a native development screen reports missing settings, check the development database first. Do not point the native app at production just to reuse settings; keep the explicit development API boundary.