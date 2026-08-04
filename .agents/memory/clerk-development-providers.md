---
name: Clerk development providers
description: Confirmed behavior of social sign-in in SupportDesk's Replit-managed Clerk development environment.
---

Gmail sign-in works in the managed Clerk development environment, even when the provider button can appear visually muted in an unauthenticated Preview screenshot.

**Why:** A real browser test confirmed Gmail login succeeds; the static Preview state was misleading and should not be used as evidence that the provider is disabled.

**How to apply:** Treat Gmail authentication as working unless a real signed-in browser flow reports an error. Keep development-key warnings separate from provider availability.