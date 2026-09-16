# OTA Drive Gap Analysis

This document describes what the current repository already provides, what is still missing for a complete OTA Drive-style platform, and how the frontend should evolve.

It is based on the code and database currently present in this repository. The project is currently a control-plane foundation; it is not yet a complete device OTA delivery system.

## 1. Current architecture

```text
React dashboard --HTTP--> Fastify backend --SQL--> PostgreSQL
                              |
                              +--> MinIO/R2 firmware storage

Mosquitto exists, but the backend is not yet connected to MQTT.
```

The current backend uploads firmware to S3-compatible storage and stores firmware metadata in PostgreSQL. It now has a validated MQTT status consumer and OTA-status consumer, but it does not yet schedule or publish OTA commands.

## 2. Functionality already implemented

### Backend and data

- Administrator login using JWT and bcrypt password hashing.
- Device registration and upsert through `POST /api/devices`.
- Device fields for product, hardware revision, current firmware, last-seen time, and OTA status.
- Firmware `.bin` upload with file extension and size validation.
- Server-side SHA-256 calculation.
- S3-compatible firmware storage through MinIO locally or R2-compatible configuration in production.
- Firmware metadata catalog in PostgreSQL.
- Firmware states: `DRAFT`, `READY`, and `ARCHIVED`.
- Duplicate firmware-version protection for a product and hardware revision.
- Deployment records and deployment-device records.
- Compatibility validation based on product and hardware revision.
- OTA event table and deployment-assignment events.
- Configurable `max_concurrency` field stored on deployments.
- MQTT client connection using configured broker credentials.
- Validated `device.status` and `ota.status` message handling.
- Runtime device updates from validated status messages.
- Runtime deployment-device status/progress updates from OTA status messages.
- Optional MQTT message deduplication through `message_id` receipts.

### Dashboard frontend

- Administrator login screen.
- Overview counters for registered devices, recent devices, active deployments, and failed updates.
- Device registration form.
- Firmware upload form.
- Firmware catalog table.
- Mark firmware as `READY`.
- Device list showing device ID, product, hardware revision, current firmware, and OTA status.
- Deployment creation form.
- Selection of compatible devices for a deployment.
- Deployment list showing target count and basic status.
- Basic loading, success, and error messages.

## 3. Missing functionality for a complete OTA Drive-style platform

The following features are expected in a complete OTA platform but are not implemented in the current repository.

### Device MQTT integration

- Backend MQTT client connection is present, but needs production hardening.
- Device status subscription, for example `devices/+/status`.
- OTA status subscription, for example `devices/+/ota/status`.
- JSON schema validation for the initial status payloads.
- Runtime device state updates from MQTT.
- Device online/offline tracking and last-seen updates.
- Complete device upsert for first-seen MQTT devices.
- Targeted OTA command publishing, for example `devices/{device_id}/command`.
- MQTT reconnect and bounded backoff handling.
- Duplicate message and duplicate command handling.

### OTA delivery and deployment lifecycle

- Start deployment action is now available through `POST /api/deployments/:id/start`; the dashboard control is still missing.
- A scheduler/worker that claims pending devices.
- Actual enforcement of `max_concurrency`.
- Online-device eligibility checks.
- Waiting state for offline devices.
- Retry policy, exponential backoff, and retry limits.
- Pause, resume, cancel, and retry-failed actions.
- Automatic deployment progress updates.
- Deployment completion and failure rules.
- Device-level attempt history.

### Secure firmware delivery

- Generation of temporary HTTPS download URLs.
- Private bucket/file authorization.
- URL expiry and device/deployment binding.
- Firmware download endpoint or signed object-storage URL.
- Firmware signature verification in addition to SHA-256.
- Artifact immutability and retention policy.

### Device firmware OTA implementation

- Device MQTT connection and reconnect logic.
- Device status and heartbeat publishing.
- OTA command validation.
- HTTPS streaming download.
- Firmware size validation.
- SHA-256 validation on the ESP32.
- Signed-image validation.
- Inactive OTA partition installation.
- Reboot and post-boot health validation.
- Rollback after failed boot or health check.
- Final success, failure, and rollback status messages.
- Anti-rollback or explicitly authorized downgrade policy.

### Security and operations

- TLS for MQTT and HTTPS.
- Per-device MQTT credentials or client certificates.
- MQTT topic ACLs.
- Removal of anonymous production MQTT access.
- Admin roles and permissions beyond a single administrator role.
- Audit log UI.
- Structured backend logs and metrics.
- Alerts for failed deployments and offline devices.
- PostgreSQL and firmware backups.
- Automated unit, integration, broker, and hardware tests.

## 4. Current frontend behavior

The dashboard currently behaves as an administration and preparation UI:

1. An administrator signs in.
2. The dashboard loads devices, firmware, deployments, and overview counters through HTTP API calls.
3. The administrator registers a device manually.
4. The administrator uploads a `.bin` file and enters product, hardware revision, and version.
5. The backend stores the file and metadata as `DRAFT`.
6. The administrator marks the firmware `READY`.
7. The administrator selects compatible registered devices.
8. The dashboard creates a deployment record.
9. The UI displays a message that the deployment is ready for a future device-delivery service.

Important: the current frontend does not start an OTA update. It does not show live MQTT state, download progress, per-device OTA progress, retry controls, or post-boot health.

## 5. Frontend improvements recommended

### Device operations

- Show online/offline status and last-seen age.
- Show reported firmware versus target firmware.
- Show product, hardware revision, IP address, battery, and signal information when available.
- Add device search, filtering, grouping, tags, sites, and bulk selection.
- Add a device detail page with OTA history and event timeline.
- Add a manual “request status” action for an online device.

### Firmware operations

- Show upload progress and checksum result.
- Show file size, SHA-256, signature status, compatibility, and release notes.
- Add firmware detail and immutable artifact history.
- Add archive confirmation and prevent archiving firmware used by a running deployment.
- Add release approval workflow and optional staged rollout approval.

### Deployment operations

- Separate “create deployment” from “start deployment”.
- Show a rollout preview before starting.
- Show eligible, incompatible, offline, pending, active, successful, failed, and rolled-back counts.
- Add concurrency controls and rollout waves.
- Add pause, resume, cancel, retry-failed, and retry-device actions.
- Display a live progress bar and estimated remaining work.
- Show per-device error codes and last MQTT event.
- Support groups, sites, percentage rollouts, and all-compatible targeting.
- Require confirmation for large or production deployments.

### Live status and reliability

- Use WebSocket or Server-Sent Events for live dashboard updates instead of relying only on page refresh.
- Show MQTT broker, backend worker, database, and storage health.
- Show stale devices and deployments that are waiting too long.
- Display a clear event timeline: assigned, command sent, downloading, installing, rebooting, success, failure, or rollback.
- Add notifications for failed or stalled updates.

## 6. Recommended implementation order

1. Add backend MQTT connection and validated device-status ingestion.
2. Add device runtime-state updates and version comparison.
3. Add secure temporary firmware download URLs.
4. Add targeted OTA command publishing.
5. Add OTA status ingestion and idempotent state transitions.
6. Add the deployment scheduler with concurrency, retries, and offline handling.
7. Implement and test ESP32 HTTPS OTA, hash/signature verification, partition health checks, and rollback.
8. Add frontend live status, deployment controls, progress, and history.
9. Add production MQTT security, backups, monitoring, and automated tests.

## 7. Target end-to-end flow

```text
ESP32 boots or reconnects
  -> publishes current firmware and hardware through MQTT
  -> backend stores runtime state in PostgreSQL
  -> scheduler compares current version with an eligible deployment
  -> backend publishes a targeted OTA command through MQTT
  -> ESP32 downloads the .bin over HTTPS from private storage
  -> ESP32 verifies size, SHA-256, and signature
  -> ESP32 installs inactive OTA partition and reboots
  -> ESP32 reports post-boot health through MQTT
  -> backend marks the device successful only after confirmation
  -> frontend displays live progress and history
```
