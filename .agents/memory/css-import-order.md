---
name: CSS import order
description: Google Fonts @import url() must precede all other @import statements in Tailwind/PostCSS setups
---

Place `@import url('https://fonts.googleapis.com/...')` as the very first line in `index.css`, before `@import "tailwindcss"` and any other imports.

**Why:** PostCSS enforces that `@import` rules must precede all other statements (except `@charset` and empty `@layer`). Tailwind's `@import "tailwindcss"` emits real CSS rules, so any `@import url(...)` after it triggers a build warning/error.

**How to apply:** When a design subagent adds Google Fonts to index.css, always ensure the url import is line 1.
