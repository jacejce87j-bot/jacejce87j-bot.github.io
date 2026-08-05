---
name: Production Expo isolation
description: Production-only Expo artifacts need an explicit API boundary and isolated static build tooling.
---

Production mobile artifacts must be separate from development mobile artifacts, require an explicit HTTPS production API origin, and fail closed when it is missing. Static Expo builds should use a dedicated configurable Metro port rather than assuming the default port is free.

**Why:** Development and production data must never be selected by inference, and the shared workspace can already have another Metro-based workflow occupying the default build port.

**How to apply:** Give each mobile artifact its own Expo identity, workflow, transport provider, and package. Pass only the approved production API domain to the production bundle, and set `PRODUCTION_METRO_PORT` when building if the default dedicated port is unavailable.