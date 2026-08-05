---
name: Native API cache handling
description: Prevent browser conditional-cache responses from becoming empty native application data.
---

Native API clients should use `no-store` for GET requests. A browser or proxy can return HTTP 304 without a response body; if the client treats that successful response as JSON data, arrays such as the agent directory silently become empty while other 200 responses continue to work.

**Why:** The agent picker appeared empty even though the server had agents because the native request received a bodyless 304 and the generated client interpreted it as a successful null result.

**How to apply:** Keep browser caching behavior unchanged, but add `cache: "no-store"` when the shared client is using the explicit native transport. Provide a visible retry/error state for important directory data as a secondary safeguard.