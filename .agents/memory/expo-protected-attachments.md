---
name: Expo protected attachments
description: How the native agent app must access ticket files stored behind the authenticated object-storage route.
---

Ticket attachments use private object storage. Native clients cannot hand the storage URL directly to another app or an unauthenticated browser; they must request the file with the current Clerk bearer token, save it to a temporary local URI, and then use the device share/open flow.

**Why:** The API protects `/api/storage/objects/*`, while native file viewers and share sheets do not inherit the app's Clerk session headers.

**How to apply:** Keep uploads on the presigned URL flow. For existing files, build the API object URL from `objectPath`, fetch/download it with `Authorization: Bearer <token>`, and only then pass the local file URI to a native viewer or share sheet.