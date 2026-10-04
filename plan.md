Checkpoint: Implementing device type registry

Summary of recent work
- Canonical artifacts tree chosen as source-of-truth (artifacts/)
- Restored admin CRUD (users, organizations, agents)
- Fixed attachment upload flow and increased payload limits
- Implemented device type registry (tracking / camera) with admin UI and API
- Added device-type dropdowns to ticket creation form
- Added reporting page with historical ticket search and XLSX/PDF export
- Hardened device-types UI to show saving state and errors
- Stopped stale Expo and API processes, rebuilt and started canonical backend and web UI
- Added @mention suggestions and backend notification mail dispatch for ticket creation and comments in the canonical artifacts app
- Hardened the dashboard API route queries so the canonical agent-workload and SLA-health endpoints return real chart data rather than empty or exploding SQL payloads
- Verified the canonical web and API packages compile cleanly with TypeScript after the mention and template fixes

- Verified requester mapping: performed end-to-end test creating a ticket while authenticated as jacolene@oriontracking.co.za; API auto-created/linked a contact and the created ticket now returns a populated requester object (see ticket id 19 at verification time).

DB migration status
- device_types table verified present (GET /api/device-types returned rows). Migrations for device types appear applied on the running database.
- Migration files are present at lib/db/migrations/20260820_add_device_types.sql and lib/db/migrations/20260820_add_ticket_installation_columns.sql

Next steps
1. Fix template-role auth mismatch causing PATCH /api/settings/ticket-templates to return 403 despite valid logged-in users; normalize JWT role strings and widen template management checks to allowed support roles.
2. Optionally run the DB migrations on any other environments where this repo is deployed (apply SQL in lib/db/migrations). The device_types SQL is idempotent.
3. Review the candidate legacy folders listed in candidate_cleanup.txt and approve deletion or archiving.
4. Add device-type entries as needed via the Device Types admin page.
5. Optionally add single-ticket export controls to the ticket detail page.

Notes
- The project runs the API on port 5000 and the web UI on port 8082 in local development. Ensure DATABASE_URL is set for the API server.
- Template edits were failing because the JWT role was coming through using inconsistent casing and the backend was strictly checking only `admin` while the UI was effectively treating some support roles as a valid logged-in user.
- UI fix applied: normalize the current user role in the settings page before checking `admin` / template-manage permissions.
- This plan.md is a lightweight checkpoint; keep it updated when the next tasks complete.

Android local build helper
- A helper script was added at artifacts/supportdesk-agent-production/build-android-local.ps1. It automates: dependency install, expo prebuild (if needed), optional writing of signing properties, and running the Gradle bundle/assemble task. Example:
  PowerShell: .\build-android-local.ps1 -KeystorePath "C:\secrets\my-release-key.jks" -StorePassword "..." -KeyAlias "mykey" -KeyPassword "..." -GradleTask bundleRelease
- After running, outputs (AAB or APK) are placed under android/app/build/outputs/.

Recommended next steps
- Verify local Android SDK/JDK are installed and environment variables set (JAVA_HOME, ANDROID_SDK_ROOT). Run the helper script to produce an AAB.
- For iOS, prefer EAS cloud builds or set up a macOS CI runner; see plan checklist above for details.