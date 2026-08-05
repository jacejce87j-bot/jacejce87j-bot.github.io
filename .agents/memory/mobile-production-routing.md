---
name: Mobile production routing
description: Production API targeting for the SupportDesk Expo bundle
---

The SupportDesk Expo app uses an explicit production API domain through `EXPO_PUBLIC_API_DOMAIN` for the internal Expo workflow. The value must match the current `getDeploymentInfo().primaryUrl` hostname exactly; a copied or stale Replit hostname can return the inactive-app page and make every mobile data request look like a sync failure.

**Why:** Replit can expose the development domain to the workspace process even when building a production-oriented mobile bundle, so falling back to the generic runtime domain can silently send a published app to preview services.

**How to apply:** Preserve the separate API-domain setting. Resolve the current published URL before changing it, update the internal development environment value when the deployment URL changes, restart the Expo workflow, and force-reload Expo Go. Do not publish the mobile artifact for internal distribution.

Internal Expo Go clients also need the Production Clerk publishable key and Clerk proxy URL explicitly injected into the development workflow; Replit's managed live-key swap only happens for published builds. When switching an installed client from Development Clerk to Production Clerk, clear the cached local session and require a fresh Production sign-in.

**Why:** An Expo Go bundle can retain a Development Clerk session while calling the correct Production API, producing valid-looking local profile state but `401 Authentication required` on every protected Production endpoint.

**How to apply:** Keep the Production key public-only and outside managed secret replacement. Inject the proxy and API host into the internal workflow, restart Metro, force-reload Expo Go, and sign in again after the one-time cache migration.

The internal mobile app is Production-only. The Expo bundle must use the Production Clerk key/proxy, Production API domain, and a Production-scoped token cache; no Development selector or credentials belong in the app.

**Why:** The app is an internal agent client for the published SupportDesk system, and keeping a second Clerk tenant available created redirect and stale-session confusion without providing value.

**How to apply:** Keep the Replit execution context wired to the Production values so Expo Go can start, clear legacy Development/plain token keys on launch, and force-reload Expo Go after bundle changes.