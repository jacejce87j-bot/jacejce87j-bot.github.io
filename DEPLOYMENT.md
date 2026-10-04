# Free-tier deployment scaffold

This monorepo can be deployed as a Vercel static frontend plus a Render API and an externally hosted PostgreSQL database such as Neon. Free-tier quotas, sleeping behavior, and availability can change; this configuration is for evaluation and does not provide production uptime guarantees.

## Vercel frontend

1. Import the repository into Vercel and set **Root Directory** to the repository root (`.`). The frontend depends on pnpm workspace packages, so do not set the project root to `artifacts/ticket-system`.
2. Keep the build/install/output settings from the root `vercel.json`.
3. After creating the Render service, replace `your-supportdesk-api.onrender.com` in `vercel.json` and `artifacts/ticket-system/.env.production.example` with its actual hostname.
4. Set the Vercel build environment variable `VITE_WS_URL` to `https://<your-render-api-host>`. This is embedded in the frontend build and gives authenticated notifications a direct secure WebSocket connection.

REST requests are same-origin from the browser and are forwarded by Vercel's `/api` rewrite. WebSockets connect directly to Render using `wss://`.

## Render API

Create a Blueprint from `render.yaml`, or configure a Node web service with its commands. Set these secrets/environment values in Render:

- `DATABASE_URL`: the connection string for the hosted PostgreSQL database. Keep credentials out of the repository.
- `JWT_SECRET`: a unique randomly generated secret at least 32 characters long. For example, generate one locally with `node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"` and enter it in Render's secret manager. The API refuses to start in production with a missing or short secret.
- `CORS_ALLOWED_ORIGINS`: comma-separated exact origins if browser clients call Render directly, such as `https://your-project.vercel.app`. It is safe to leave empty when the Vercel rewrite is the only browser REST path; add any separate mobile/web client origins that call the API directly.

Render supplies `PORT`; do not pin it. The health check is `/api/healthz`. Configure the hosted database and apply the project's database schema/migrations before sending production traffic. Do not point the hosted service at the laptop's local database.

## Local production-build preview

Copy the relevant example values to local, ignored environment files and use provider-issued test credentials. Never commit `.env` files or production secrets. The frontend's `VITE_WS_URL` must be set before building if testing secure WebSockets against the hosted API.

The repository currently tracks `artifacts/api-server/.env` and `artifacts/ticket-system/.env`. The new ignore rules do not untrack files already in Git. Review and remove those files from version control before pushing; if either contains a real credential, rotate it and remove it from repository history as well.
