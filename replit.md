# SupportDesk — Ticket Management System

A production-grade customer support and ticket management platform inspired by Zendesk and Salesforce Service Cloud. Agents manage tickets, contacts, organizations, SLAs, and team performance from a single dashboard.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080, proxied to `/api`)
- `pnpm --filter @workspace/ticket-system run dev` — run the frontend (port 23913, proxied to `/`)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string (auto-provisioned)

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React 18 + Vite, Wouter (routing), TanStack Query, Recharts, react-hook-form + Zod, shadcn/ui
- API: Express 5 + pino structured logging
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec → React Query hooks + Zod schemas)
- Build: esbuild (CJS bundle)

## Where things live

- `lib/api-spec/openapi.yaml` — source of truth for all API contracts
- `lib/db/src/schema/` — Drizzle table definitions (agents, organizations, contacts, tickets, comments, tags, activity_events)
- `lib/api-client-react/src/generated/` — generated React Query hooks (do not edit)
- `lib/api-zod/src/generated/` — generated Zod schemas used by the server (do not edit)
- `artifacts/api-server/src/routes/` — Express route handlers (tickets, contacts, organizations, agents, tags, dashboard)
- `artifacts/ticket-system/src/` — React frontend (pages, components)

## Architecture decisions

- **Contract-first API**: OpenAPI spec gates both frontend codegen and server validation — never write types by hand.
- **inArray() for batch lookups**: Drizzle's `inArray(col, ids)` is used everywhere for bulk-fetching related entities; raw `sql ANY()` breaks with array parameters.
- **Activity events table**: All ticket mutations (create, status change, reassignment, comment) write to `activity_events` for the dashboard feed and audit trail.
- **Denormalized tags**: Both `tickets` and `contacts` store tags as `text[]` columns for simplicity; the `tags` master table stores display metadata (color).
- **Aggregates at query time**: Comment counts, ticket counts, contact counts are computed per-request with COUNT queries — no materialized counters to keep in sync.

## Product

- **Dashboard**: Live metrics (open/pending/urgent/solved/SLA breach/unassigned), 14-day ticket volume chart, agent workload chart, SLA health donut, recent activity feed
- **Tickets**: Full lifecycle management (open → pending → on_hold → solved → closed), priority levels, types, channels, assignee, SLA due dates, satisfaction ratings, threaded comments (public/internal), tags
- **Contacts**: Customer directory linked to organizations, role-based (end_user/agent/admin), per-contact ticket history
- **Organizations**: Account management with domain, industry, plan tier, linked contacts and tickets
- **Agents**: Team roster with role, online status, open ticket workload
- **Tags**: Color-coded tag taxonomy for tickets and contacts

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Always run `pnpm --filter @workspace/api-spec run codegen` after changing `openapi.yaml` before writing any route or frontend code
- Use `inArray(col, ids)` from `drizzle-orm` for `WHERE id IN (...)` — never `sql\`id = ANY(...)\``
- The API server bundles with esbuild on every `dev` start — restart the workflow to pick up route changes
- `@import url(...)` for Google Fonts must appear before all other `@import` statements in CSS

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
