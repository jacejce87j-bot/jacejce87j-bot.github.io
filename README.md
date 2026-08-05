# SupportDesk

SupportDesk is the customer-support workspace for Orion Tracking Pty Ltd. It consists of:

- A browser-based ticket management system for support staff and administrators.
- A development-only Expo agent application for mobile ticket work.
- A shared authenticated API server, database layer, OpenAPI contract, and generated client.

The project is maintained as a pnpm workspace and runs as multiple Replit artifacts.

## Product scope

SupportDesk currently covers:

- Tickets, contacts, organizations, and agents.
- Ticket status, priority, type, channel, requester, organization, and assignee fields.
- Ticket comments and resolution/status updates.
- SLA policies and ticket templates.
- Protected ticket and comment attachments.
- Clerk authentication with local SupportDesk user roles.
- Live notification updates over WebSockets.
- A mobile assigned-ticket queue and ticket creation workflow.

## Repository layout

```text
artifacts/
  ticket-system/             Browser Web application
  supportdesk-agent-dev/    Development-only Expo agent application
  api-server/                Express API and WebSocket server
  mockup-sandbox/            Isolated component preview server

lib/
  api-spec/                  OpenAPI source contract
  api-zod/                   Generated/request validation schemas
  api-client-react/          Generated React Query hooks and shared fetch client
  db/                        Drizzle schema and database access
  object-storage-web/        Browser object-storage helpers

scripts/                     Workspace and code-generation utilities
attached_assets/             User-provided reference assets
.agents/memory/              Durable implementation notes for future agents
```

## Applications and artifacts

### Web ticket management system

Location: `artifacts/ticket-system`

The Web app is a React + Vite application using:

- React and Wouter for routing.
- Clerk React for authentication.
- TanStack React Query for server state.
- React Hook Form and Zod for form state and validation.
- Radix UI/shadcn-style components.
- The shared generated API client from `@workspace/api-client-react`.

Important routes include:

```text
/                         Dashboard
/tickets                  Ticket list
/tickets/new              Create ticket
/tickets/:id              Ticket detail
/contacts                 Contact list/detail
/organizations            Organization list/detail
/agents                   Agent management
/settings                 SLA policies and ticket templates
/sign-in                  Clerk sign-in
/sign-up                  Clerk sign-up
```

The Web application uses same-origin, cookie-based API requests. Do not point the Web app at the development API manually; the published Web app and its API use the production environment.

### Expo agent application

Location: `artifacts/supportdesk-agent-dev`

This is explicitly a development-only mobile client. It uses Expo Router and Clerk Expo and provides:

- Google/Gmail and email/password sign-in.
- My Queue assigned-ticket view.
- Create-ticket tab.
- Ticket templates that prefill only the description.
- Agent selection and reassignment.
- Ticket comments, resolution/status updates, and attachments.
- Authenticated attachment download/open/share.
- Sign-out.

Native requests use the explicit development API domain and a Clerk bearer token. This boundary is intentional:

```text
Expo development app -> development API -> development database
Web application       -> same-origin API -> production database when published
```

Do not redirect the mobile app to production just to reuse settings or ticket data. Development and production data are separate by design.

The mobile app currently expects development environment values to be injected by its Replit workflow:

- `EXPO_PUBLIC_DOMAIN`
- `EXPO_PUBLIC_REPL_ID`
- `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`

Never place secret values in source code or this README.

### API server

Location: `artifacts/api-server`

The API server is an Express application with:

- Clerk Express authentication.
- Local SupportDesk user provisioning and role checks.
- REST routes for tickets, contacts, organizations, agents, settings, comments, uploads, and storage.
- A WebSocket endpoint for live notifications.
- Drizzle database access through `@workspace/db`.

The server must bind to the `PORT` environment variable. It is normally started by the configured Replit workflow rather than manually.

## Authentication and authorization

Clerk is the identity provider for both clients:

- Web uses `@clerk/react`.
- Expo uses `@clerk/expo`.
- API routes use Clerk Express middleware.

Clerk identity is mapped to a local SupportDesk user. The local user remains the source of application roles such as agent, supervisor, and admin.

Keep these rules intact:

- Do not replace Clerk with Replit OIDC without an explicit product decision.
- Do not treat a valid Clerk identity as automatic permission to perform admin actions.
- Protected uploads, downloads, and admin settings need a visible client-side auth/access state as well as server-side protection.
- Native protected attachments must be fetched with the Clerk bearer token before opening or sharing them.

## API contract and generated code

The source of truth for API shapes is:

```text
lib/api-spec/openapi.yaml
```

Generated outputs include:

```text
lib/api-client-react/src/generated/api.ts
lib/api-client-react/src/generated/api.schemas.ts
lib/api-zod/
```

When changing an endpoint:

1. Update the OpenAPI contract.
2. Validate the YAML.
3. Regenerate the clients and Zod schemas.
4. Update all Web and Expo callers.
5. Check loading, empty, error, mutation, and reload behavior.

Do not hand-edit generated API files as the long-term fix.

## Attachments

Attachments use a protected direct-upload flow:

1. Request an upload URL from the API.
2. Upload the file directly to object storage.
3. Send the resulting attachment metadata with ticket/comment create or update.
4. For native downloads, request the protected file with a Clerk bearer token.
5. Save locally, then open or share the file.

Do not expose private object-storage paths directly in the UI.

## Ticket templates

Templates are managed in Web Settings and returned by:

```text
GET /api/settings/ticket-templates
```

A selected template fills only the ticket Description field. Subject, requester, organization, assignee, priority, type, channel, and other fields remain editable.

Templates are environment-specific. A template created in the published Web app is not automatically present in the development database used by Expo. When a native development screen reports no templates:

1. Check the development database.
2. Seed or create the development template there.
3. Confirm the mobile app refetches it.
4. Do not point Expo at production.

## Replit workflows

Configured workflows:

```text
artifacts/supportdesk-agent-dev: expo
artifacts/ticket-system: web
artifacts/api-server: API Server
artifacts/mockup-sandbox: Component Preview Server
```

The main commands are:

```bash
# Web development server
pnpm --filter @workspace/ticket-system run dev

# Expo development server
pnpm --filter @workspace/supportdesk-agent-dev run dev

# API development server
pnpm --filter @workspace/api-server run dev
```

The Replit workflow supplies the required ports and environment values. The Web Vite config requires both `PORT` and `BASE_PATH`; a direct command without them is expected to fail during config loading.

## Verification commands

Run the focused checks after changes:

```bash
# Mobile
pnpm --filter @workspace/supportdesk-agent-dev run typecheck

# Web production build
PORT=23913 BASE_PATH=/ pnpm --filter @workspace/ticket-system run build

# Web typecheck
pnpm --filter @workspace/ticket-system run typecheck

# Workspace formatting sanity check
git diff --check
```

The Web production build is the most useful release gate because it exercises the Vite bundle used for publishing.

There are currently known unrelated Web typecheck errors caused by duplicate/incompatible React type packages in:

```text
artifacts/ticket-system/src/components/ui/calendar.tsx
artifacts/ticket-system/src/components/ui/spinner.tsx
```

Do not attribute those existing errors to a ticket-form change unless the error locations change.

## Troubleshooting

### Web create-ticket page is blank

Check in this order:

1. Confirm the user is authenticated and has a local SupportDesk user.
2. Inspect browser console logs.
3. Inspect production deployment logs.
4. Confirm `/api/auth/user`, `/api/agents`, `/api/contacts`, `/api/organizations`, and `/api/settings/ticket-templates` return successfully.
5. Check conditional form sections for context-bound components.

The shared `FormLabel`, `FormControl`, and `FormMessage` components require their matching `FormField`/`FormItem` context. For a standalone optional control, use a normal HTML `<label>` instead.

The Web app has route-level and app-level error fallbacks so runtime failures should render an actionable recovery screen rather than a blank page.

### Expo cannot see a Web-created template

This is normally an environment mismatch, not a client routing issue:

- Published Web data belongs to production.
- Expo development data belongs to development.

Inspect the development database and verify the development API domain configured by `DevelopmentApiProvider`.

### Native attachment cannot open

Ensure the file download includes the Clerk bearer token. Protected storage URLs are not expected to work as unauthenticated browser/native links.

### OAuth callback problems

Google OAuth uses Clerk Expo `useSSO()` and the supported `sso-callback` route. Keep the callback screen passive; it should not call `signIn.reload()` itself.

### Blank or clipped Expo preview

Check root flex sizing and scroll containers. Keep root wrappers minimal and establish explicit dimensions before adding nested scrolling views.

## Publishing

The Web artifact is the publishable product surface. Before publishing:

1. Run the Web production build.
2. Confirm the API workflow and Web workflow are healthy.
3. Check the intended production database/data state.
4. Publish from Replit.
5. Test the published sign-in, ticket list, create-ticket, template, and ticket-detail flows.
6. Inspect deployment logs if the published behavior differs from the local workflow.

The Expo artifact is development-only and should not be treated as the production mobile release pipeline.

## Development principles

- Preserve the explicit development/production separation.
- Prefer generated API hooks and the OpenAPI contract over ad hoc fetches and duplicated types.
- Handle loading, empty, error, and retry states for every async data source.
- Keep protected data behind both server authorization and an understandable client state.
- Verify behavior after navigation, reload, and mutation—not only after the initial request.
- Restart the affected workflow after code, package, or command changes.
- Check fresh workflow/browser/deployment logs before declaring a fix complete.