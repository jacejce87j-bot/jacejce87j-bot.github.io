---
name: Expo development API boundary
description: Native SupportDesk development clients use an explicit absolute API URL plus Clerk bearer tokens while browser clients stay same-origin.
---

The development Expo app must configure the generated API client explicitly with the development domain and the current Clerk `getToken` function. Browser clients must remain on their existing same-origin, cookie-based transport.

**Why:** Native clients do not have the browser cookie jar, and restoring the removed global transport setters or adding production fallbacks would blur the development/Production boundary.

**How to apply:** Keep mobile transport setup scoped to the development Expo artifact, fail fast when its domain is missing, and use generated ticket hooks only after this boundary is configured.