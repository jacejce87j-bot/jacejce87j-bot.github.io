---
name: Mobile production routing
description: Production API targeting for the SupportDesk Expo bundle
---

The SupportDesk Expo app keeps local preview traffic on the development API, while published mobile bundles receive an explicit production API domain through `EXPO_PUBLIC_API_DOMAIN`.

**Why:** Replit can expose the development domain to the workspace process even when building a production-oriented mobile bundle, so falling back to the generic runtime domain can silently send a published app to preview services.

**How to apply:** Preserve the separate API-domain setting. Update the production environment value when the published SupportDesk URL changes, then republish the mobile artifact so the static Expo bundle is rebuilt.