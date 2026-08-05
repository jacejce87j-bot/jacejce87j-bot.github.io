---
name: Mobile production routing
description: Production API targeting for the SupportDesk Expo bundle
---

The SupportDesk Expo app uses an explicit production API domain through `EXPO_PUBLIC_API_DOMAIN` for the internal Expo workflow. The value must match the current `getDeploymentInfo().primaryUrl` hostname exactly; a copied or stale Replit hostname can return the inactive-app page and make every mobile data request look like a sync failure.

**Why:** Replit can expose the development domain to the workspace process even when building a production-oriented mobile bundle, so falling back to the generic runtime domain can silently send a published app to preview services.

**How to apply:** Preserve the separate API-domain setting. Resolve the current published URL before changing it, update the internal development environment value when the deployment URL changes, restart the Expo workflow, and force-reload Expo Go. Do not publish the mobile artifact for internal distribution.