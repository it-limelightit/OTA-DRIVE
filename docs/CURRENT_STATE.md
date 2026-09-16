# Current State

Audit date: 2026-09-09

## Stack

- Frontend: React 19, Vite 6, TypeScript.
- Backend: Node.js, Fastify 5, TypeScript.
- Database: PostgreSQL 16 via `pg`; versioned SQL migrations applied at startup.
- Authentication: JWT-backed administrator login using bcrypt password hashes.
- Storage: S3-compatible object storage; Cloudflare R2 for deployment and MinIO locally.

## Feature Status

| Feature | Status | Evidence / gap |
| --- | --- | --- |
| Device registry | DONE | Authenticated device list and upsert API; dashboard registration form. |
| Firmware management | DONE | Authenticated `.bin` upload, server-side SHA-256 and metadata catalog; duplicate-version protection. |
| Object storage | DONE | S3-compatible upload path; R2 configuration documented; MinIO local support. |
| MQTT status ingestion | MISSING | Mosquitto exists, but no backend MQTT client or consumer. |
| Deployment model | DONE | Deployments, deployment-device records, OTA events and core indexes are migrated. |
| Deployment targeting | PARTIAL | Selected compatible devices only; no groups, sites, percentages or lifecycle actions. |
| OTA command publishing | MISSING | No publisher or device command topic implementation. |
| OTA event/status tracking | PARTIAL | Event table and assignment events exist; no MQTT event ingestion. |
| Retry logic | PARTIAL | Retry fields exist but no policy, backoff or manual retry. |
| Concurrency control | PARTIAL | `max_concurrency` is persisted but not enforced. |
| Rollback | MISSING | No backend or ESP32 post-boot/rollback integration. |
| Dashboard | PARTIAL | Login, device registry and firmware upload/catalog exist; deployment and history UI are absent. |
| Authentication | PARTIAL | Admin JWT authentication exists; device and MQTT authentication/ACLs are absent. |
| Security | PARTIAL | Input validation, bcrypt and JWT exist. Local Mosquitto allows anonymous access; R2 access policies and signed downloads are not implemented. |
| Tests | MISSING | No automated unit or integration tests. |
| Infrastructure | PARTIAL | Docker Compose provides PostgreSQL, MinIO, Mosquitto, API and dashboard. R2 is configured through environment variables for production. |

## Baseline Validation

- `npm.cmd run check` passed before changes.
- `npm.cmd run build` passed before changes.
- No lint or automated test script is defined.
- This folder is not a Git repository, so Git status/history could not be inspected.

## Risks

- No ESP32-C5 OTA partition, HTTPS download, hash verification, post-boot health, or rollback proof has been supplied.
- R2 firmware downloads must remain protected; public URL generation is deliberately not implemented.
- Phase 3 MQTT ingestion requires device credentials and broker ACL design before enabling production access.

## Recommended Next Phase

Phase 3: implement a validated MQTT status consumer that upserts device firmware and last-seen state, after defining per-device MQTT credentials and ACLs.
