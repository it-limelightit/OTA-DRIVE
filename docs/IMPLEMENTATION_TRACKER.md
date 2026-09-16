# OTA Implementation Tracker

This file is the running record for implementation work. Update it after each meaningful change.

## Current session

Date: 2026-09-11

### Completed in this session

- Added `mqtt` dependency to the backend.
- Added MQTT connection, subscriptions, payload validation, and runtime state ingestion.
- Added MQTT message receipt deduplication.
- Added runtime and worker fields through migration `002_mqtt_runtime_fields.sql`.
- Added project requirements, schema documentation, and OTA gap analysis documents.
- Added the first deployment delivery worker implementation.
- Added MinIO/S3 presigned firmware download URL generation.
- Added targeted OTA command publishing from pending deployments.
- Added concurrency accounting for active device updates.
- Added explicit `POST /api/deployments/:id/start`; deployments no longer auto-start merely when created.
- Added separate `S3_PRESIGN_ENDPOINT` support so signed URLs can use a device-reachable MinIO hostname while the backend uses the internal Docker endpoint.
- Physically moved MQTT, storage, and deployment-worker code into `services/` and `workers/` folders.
- Updated Docker Compose to PostgreSQL 16 to match the VPS.
- Added `docker-compose.vps.yml` with PostgreSQL 16, persistent MinIO/Mosquitto volumes, restart policies, and production environment wiring.
- Updated the VPS Compose file to reuse the existing PostgreSQL 16 container instead of creating a second database container.
- Added `docker-compose.vps-infra.yml` containing only MinIO and Mosquitto for the current VPS setup; backend and dashboard remain intentionally disabled until the infrastructure is verified.
- Recorded the current split topology: VPS runs PostgreSQL 16, MinIO, and Mosquitto; the PC runs backend, React frontend, and MQTT Explorer.
- Fixed root `.env` loading for workspace development and corrected the local database, CORS, admin email, and MinIO endpoint configuration.
- Removed generated `backend/dist`, `dashboard/dist`, and `dashboard/tsconfig.tsbuildinfo` artifacts; source files remain unchanged.
- Rebuilt the React dashboard into page-based navigation with Overview, Devices, Firmware, Deployments, and Activity views.
- Added searchable device table, release library, deployment cards with Start action, activity timeline, improved empty/loading states, and responsive visual system.

### Still remaining after this session

- Refactor backend routes and services out of `server.ts` into a layered folder structure.
- Split the dashboard monolith in `dashboard/src/main.tsx` into pages, features, and reusable components.
- Add shared typed API/MQTT contract definitions.
- Add pause/resume/cancel deployment APIs.
- Add secure public MinIO endpoint configuration and HTTPS reverse proxy setup.
- Ensure `S3_PRESIGN_ENDPOINT` is an HTTPS hostname reachable by ESP32 devices in each environment.
- Replace anonymous Mosquitto configuration with production TLS, credentials, and ACLs before exposing port 1883 publicly.
- Add retry/backoff worker behavior for publish failures and device failures.
- Add deployment completion/failure aggregation.
- Add frontend deployment controls and live progress.
- Add ESP32 OTA firmware implementation, SHA-256 verification, signatures, and rollback testing.
- Resolve the Express versus existing Fastify decision.
- Add automated tests and production MQTT TLS/ACL configuration.

## Status legend

- `DONE`: implemented and type/build checked.
- `PARTIAL`: foundation exists but production behavior is incomplete.
- `TODO`: not implemented.
- `BLOCKED`: requires a product, hardware, credential, or protocol decision.

## Feature status

| Area | Status | Notes |
| --- | --- | --- |
| Admin authentication | DONE | JWT and bcrypt login exist. |
| Device registry | DONE | HTTP registration and MQTT status upsert exist. |
| Firmware upload/catalog | DONE | Upload, SHA-256 metadata, draft/ready lifecycle exist. |
| MinIO storage | DONE | S3-compatible upload and presigned URL generation exist. |
| MQTT status ingestion | PARTIAL | Status and OTA status consumers exist; production security remains. |
| MQTT OTA command publishing | PARTIAL | Worker publishes targeted commands when a deployment is eligible. |
| Deployment scheduler | PARTIAL | Start endpoint, polling worker, and concurrency claim exist; pause/resume/cancel remain. |
| Retry/backoff | TODO | Retry policy is not yet complete. |
| OTA progress/history | PARTIAL | Database ingestion exists; frontend display remains. |
| ESP32 OTA client | TODO | Device firmware is outside the current repository. |
| Frontend live operations | PARTIAL | Dashboard can now start deployments and show operational views; live MQTT progress and pause/retry controls remain. |
| Automated tests | TODO | Type-check and production build currently pass. |
| Backend folder modularity | PARTIAL | MQTT, storage, and worker modules now live in dedicated folders; routes and bootstrap remain concentrated in `server.ts`. |
| Frontend folder modularity | TODO | Most dashboard behavior remains in `main.tsx`. |

## Change log

Append a dated entry after future implementation work.

### 2026-09-11

- Moved MQTT service to `backend/src/services/mqtt/`.
- Moved storage service to `backend/src/services/storage/`.
- Moved deployment worker to `backend/src/workers/`.
- Updated imports and verified TypeScript compilation/build.
- Changed Docker Compose PostgreSQL image from 17 to 16 for VPS compatibility.
