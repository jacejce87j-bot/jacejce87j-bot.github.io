---
name: Protected workspace flows
description: Keeps authentication-protected product features usable rather than leaving users at unexplained 401 errors.
---

Any endpoint protected by the session must have a corresponding user-facing login entry and workspace auth gate. Keep account/logout controls visible after sign-in.

**Why:** A server-side 401 is secure but produces a broken-feeling feature when the UI has no login path; this surfaced with SLA editing and ticket uploads.

**How to apply:** Add the auth boundary before protected workspace routes, use the shared browser auth hook, and verify both the unauthenticated screen and authenticated mutation path.