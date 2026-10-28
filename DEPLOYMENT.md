# Free-tier deployment scaffold

The web frontend deploys to GitHub Pages through GitHub Actions, the API runs on Render, and PostgreSQL is hosted separately. Free-tier quotas, sleeping behavior, and availability can change; this configuration is for evaluation and does not provide production uptime guarantees.

## GitHub Pages frontend

The workflow at `.github/workflows/deploy.yml` builds and deploys the frontend to GitHub Pages whenever changes are pushed to `main`. In the repository's **Settings → Pages**, set the build and deployment source to **GitHub Actions**. The workflow builds from `artifacts/ticket-system` and currently sets both `VITE_API_URL` and `VITE_WS_URL` to `https://orion-supportdesk-api.onrender.com`.

If the Render API hostname changes, update both workflow environment values. REST requests go directly to the Render API, and authenticated WebSocket notifications connect to its `/ws` endpoint over `wss://`. For the current Pages site, allow `https://jacejce87j-bot.github.io` in the Render `CORS_ALLOWED_ORIGINS` setting.

## Render API

Create a Blueprint from `render.yaml`, or configure a Node web service with its commands. Set these secrets/environment values in Render:

- `DATABASE_URL`: the connection string for the hosted PostgreSQL database. Keep credentials out of the repository.
- `JWT_SECRET`: a unique randomly generated secret at least 32 characters long. For example, generate one locally with `node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"` and enter it in Render's secret manager. The API refuses to start in production with a missing or short secret.
- `CORS_ALLOWED_ORIGINS`: comma-separated exact origins for browser clients that call Render directly, including the GitHub Pages origin `https://jacejce87j-bot.github.io` and any other web origins in use.

Render supplies `PORT`; do not pin it. The health check is `/api/healthz`. Configure the hosted database and apply the project's database schema/migrations before sending production traffic. For an existing database with ticket macros already installed, apply `lib/db/migrations/20260921_macro_usage.sql` to enable macro usage analytics. If ticket macros are not installed yet, apply `20260921_ticket_macros.sql` first. For stock tracking, apply `lib/db/migrations/20261019_seed_initial_stock_items.sql` followed by `lib/db/migrations/20261023_field_agent_stock.sql`; the first seeds the supplied, unambiguous Orion Stock opening balances and the second enables Field Agent balances and transfers. Apply `lib/db/migrations/20261024_stock_returns.sql` afterward to enable returning Field Agent stock to Orion Stock. Apply `lib/db/migrations/20261027_job_card_address_schedule.sql` to add organization service addresses and ticket booking date/time, then `lib/db/migrations/20261028_ticket_template_values.sql` to persist all selected template fields on tickets. The fleet quantity is excluded until its SKU (`OTFLEET130` or `OTFLEET150`) is confirmed. Do not point the hosted service at the laptop's local database.

## Local production-build preview

Copy the relevant example values to local, ignored environment files and use provider-issued test credentials. Never commit `.env` files or production secrets. Set both `VITE_API_URL` and `VITE_WS_URL` before building to test the frontend against the hosted API.

The repository currently tracks `artifacts/api-server/.env` and `artifacts/ticket-system/.env`. The new ignore rules do not untrack files already in Git. Review and remove those files from version control before pushing; if either contains a real credential, rotate it and remove it from repository history as well.
