---
name: SupportDesk mobile agent app
description: Mobile identity and ticket access rules for the Expo companion app
---

The SupportDesk mobile app uses Clerk-native Expo sessions and sends a bearer session token through the shared API client. Mobile ticket operations, including comments, must remain assignment-scoped on the server, not only filtered in the client. Clerk session claims may omit email, so the server must resolve the primary email from Clerk before matching the local agent.

**Why:** The browser workspace uses Clerk cookies and broad authenticated access, while mobile has no browser cookie jar and must not expose the full support workspace or unrestricted ticket administration.

**How to apply:** Resolve the Clerk identity to the local agent record by normalized email for mobile routes, falling back to Clerk's user record when the session claims do not contain one. Keep mobile scope limited to assigned-ticket list/detail/create/update, public comments, attachments, and resolve/status actions. Reuse the shared generated client and secure object-storage upload flow.