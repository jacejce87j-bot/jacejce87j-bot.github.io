---
name: OpenAPI regeneration safety
description: Prevents a malformed API contract from leaving generated clients deleted or incomplete.
---

Validate the OpenAPI document for duplicate keys and parse errors before running Orval code generation.

**Why:** Orval cleans the generated output directories before resolving the input, so a malformed spec can temporarily remove the client and server validation sources used by the running app.

**How to apply:** Parse the YAML and run a duplicate-key check first, then run the workspace codegen command and typecheck all dependent packages before restarting workflows.