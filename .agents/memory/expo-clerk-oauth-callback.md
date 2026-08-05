---
name: Expo Clerk OAuth callback route
description: Clerk Expo Google OAuth needs the SDK-supported callback path without a second nonce exchange.
---

The development agent app uses Clerk Expo's SDK-supported `sso-callback` path for Google OAuth. Expo Router must define that route, but the route must remain passive because Clerk's `useSSO()` already consumes the one-time `rotating_token_nonce`, reloads the sign-in resource, transfers a new Google user when needed, and activates the session.

**Why:** A second `signIn.reload({ rotatingTokenNonce })` can consume the nonce twice and produce an empty JSON response on Android.

**How to apply:** Keep the button redirect and Expo Router callback synchronized with Clerk's `sso-callback` convention. Let the initiating `startSSOFlow()` call own the token exchange; the callback may observe auth state and provide timeout/retry UI, but must not reload the sign-in resource.