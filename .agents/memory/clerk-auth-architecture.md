---
name: Clerk authentication architecture
description: SupportDesk uses Replit-managed Clerk for browser identity and local users for application roles.
---

SupportDesk authentication is owned by Replit-managed Clerk. The browser uses Clerk session cookies and dedicated `/sign-in` and `/sign-up` routes; the API validates Clerk sessions and bridges them to the local `users` row for SupportDesk roles and permissions. Replit OIDC routes and app-owned session cookies should not be reintroduced.

**Why:** Replit Auth is for “Sign in with Replit” and its Preview interaction flow is not appropriate for a customer-facing support workspace.

**How to apply:** Use Clerk React hooks/components for browser auth and `clerkMiddleware`/`getAuth` on Express. Keep local role checks in the database, and do not add bearer-token handling to web requests.