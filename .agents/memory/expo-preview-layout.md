---
name: Expo preview layout
description: Expo Router web previews can render a blank canvas when optional provider wrappers or scroll containers do not establish web dimensions.
---

When building Expo screens for the Replit web preview, keep the root provider stack minimal until the route renders, and give shared scroll-form wrappers explicit `flex: 1`, `width: '100%'`, and `contentContainerStyle.flexGrow: 1`.

**Why:** The development mobile auth route mounted successfully but appeared blank because the scaffold's wrapper stack and React Native Web scroll sizing did not establish a visible route height.

**How to apply:** Verify the route visually after each provider or layout wrapper is added; treat a blank preview with healthy Metro logs as a layout/provider issue before changing auth logic.