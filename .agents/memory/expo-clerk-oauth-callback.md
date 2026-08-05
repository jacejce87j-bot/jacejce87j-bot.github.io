---
name: Expo Clerk OAuth callback route
description: Clerk Expo Google OAuth must target a route that exists in the Expo Router tree.
---

The development agent app uses `/oauth` as the Clerk Google callback on web and `supportdesk-agent-dev://oauth` on native. Expo Router must define `app/oauth.tsx`; otherwise successful Google authentication lands on the generic not-found screen before Clerk can return to the workspace.

**Why:** OAuth provider completion navigates through the configured redirect URL, so an otherwise valid Clerk flow still appears broken when the callback path is absent.

**How to apply:** Keep the callback path in `GoogleAuthButton` and the Expo Router file synchronized whenever the OAuth redirect target changes.