---
name: Protected workspace flows
description: Keeps authentication-protected product features usable rather than leaving users at unexplained 401 errors.
---

Any endpoint protected by the session must have a corresponding user-facing login entry and workspace auth gate. Keep account/logout controls visible after sign-in.

**Why:** A server-side 401 is secure but produces a broken-feeling feature when the UI has no login path; this surfaced with SLA editing and ticket uploads.

**How to apply:** Add the auth boundary before protected workspace routes, use the shared browser auth hook, and verify both the unauthenticated screen and authenticated mutation path.

In the Replit Preview iframe, start browser auth by navigating the preview frame itself with `window.location.assign()` to `/api/login`. Do NOT script the top frame: `window.top.location` throws "The operation is insecure", and a synthetic anchor with `target="_top"` is silently blocked (button appears to do nothing).

**Why:** The preview iframe is sandboxed and cross-origin; earlier attempts to promote the provider flow to the top-level window crashed or dead-clicked, while same-frame navigation successfully reaches the Replit OIDC provider, which completes the handoff in the same window.

**How to apply:** In `lib/replit-auth-web/src/use-auth.ts`, login/logout use `window.location.assign(url)` unconditionally. The provider's development-testing interstitial is expected in Preview; the user must click its orange "Log in" button to complete the handoff.
