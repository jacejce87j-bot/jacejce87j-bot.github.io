---
name: Drizzle array queries
description: How to correctly query WHERE id IN (...) in Drizzle ORM — inArray() not raw sql ANY()
---

Use `inArray(col, ids)` from `drizzle-orm` for batch ID lookups:

```typescript
import { inArray } from "drizzle-orm";
db.select().from(agentsTable).where(inArray(agentsTable.id, agentIds))
```

**Why:** Drizzle's sql template interpolates arrays as `($1, $2, $3)` which produces `= ANY(($1, $2, $3)::int[])` — a syntax error in PostgreSQL. `inArray` correctly generates `WHERE id IN ($1, $2, $3)`.

**How to apply:** Any time you need to fetch multiple rows by a list of IDs from one query, use `inArray`. Guard with `ids.length > 0` before calling to avoid empty IN clauses.
