---
name: Expo Go workflow identity
description: Why separate internal Expo Go workflows need distinct public packager identities
---

Each separately scannable Expo Go workflow must advertise a unique public packager URL. Replit workspace proxy URLs and localhost-based Expo launches can resolve to the wrong mobile artifact when multiple Expo workflows are active. Use a distinct Expo tunnel or an explicitly path-qualified packager URL for the second workflow; this does not require publishing a mobile app.

Expo Go workflows also run with Replit-managed Development Clerk keys. A mobile workflow can therefore reach a separately published Production API but its bearer token will be rejected by the Production Clerk environment. Replit swaps to Production Clerk keys only for a published deployment.

**Why:** Expo Go follows the advertised packager/development URL, not the artifact title or local port. Two workflows can therefore show different local ports but still open the same app after scanning. Managed Clerk also separates Development and Production user/token environments.

**How to apply:** When Dev and Production Expo apps coexist, verify their logged Expo URLs are different before testing. Production must retain its explicit production API origin independently of the QR/packager URL, but Expo Go cannot use that API with a Development Clerk token without a deliberate separate authentication bridge.