---
name: SupportDesk mobile agent app
description: Mobile identity and ticket access rules for the Expo companion app
---

The SupportDesk mobile app uses Clerk-native Expo sessions and sends a bearer session token through the shared API client. Mobile ticket operations must remain assignment-scoped on the server, not only filtered in the client.

**Why:** The browser workspace uses Clerk cookies and broad authenticated access, while mobile has no browser cookie jar and must not expose the full support workspace or unrestricted ticket administration.

**How to apply:** Resolve the Clerk identity to the local agent record by email for mobile routes. Keep mobile scope limited to assigned-ticket list/detail/create/update, attachments, and resolve/status actions. Reuse the shared generated client and secure object-storage upload flow.