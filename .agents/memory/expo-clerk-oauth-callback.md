---
name: Expo Clerk OAuth callback route
description: Clerk Expo Google OAuth needs the SDK-supported callback path and rotating-token recovery.
---

The development agent app uses Clerk Expo's SDK-supported `sso-callback` path for Google OAuth. Expo Router must define that route, and the callback must be able to consume `rotating_token_nonce`, reload the legacy sign-in resource, transfer a new Google user to sign-up when Clerk marks the attempt transferable, and activate the resulting session.

**Why:** The installed Clerk Expo SDK includes the rotating nonce only for an allowed SSO callback URL. Android can recreate the route that started the browser flow, so the callback needs a recovery path instead of relying only on the original `startSSOFlow()` promise.

**How to apply:** Keep the button redirect and Expo Router callback synchronized with Clerk's `sso-callback` convention. Use `@clerk/expo/legacy` for callback recovery in this SDK version because it exposes `reload()` and `setActive()`. Always provide a timeout and retry state.