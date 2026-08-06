---
name: Expo Go workflow identity
description: Why separate internal Expo Go workflows need distinct public packager identities
---

Each separately scannable Expo Go workflow must advertise a unique public packager URL. Replit workspace proxy URLs and localhost-based Expo launches can resolve to the wrong mobile artifact when multiple Expo workflows are active. Use a distinct Expo tunnel or an explicitly path-qualified packager URL for the second workflow; this does not require publishing a mobile app.

**Why:** Expo Go follows the advertised packager/development URL, not the artifact title or local port. Two workflows can therefore show different local ports but still open the same app after scanning.

**How to apply:** When Dev and Production Expo apps coexist, verify their logged Expo URLs are different before testing. Production must also retain its explicit production API origin independently of the QR/packager URL.