# OTA Platform Project Requirements

This document records the requirements and constraints to preserve across future implementation sessions.

## Product goal

Build an OTA Drive-style fleet management platform for ESP32-C5 devices. The platform must support firmware cataloging, device state tracking, controlled rollouts, OTA progress, failure handling, rollback visibility, and a clear operator dashboard.

The system must use MQTT for small control/status messages and HTTPS for downloading firmware binaries. Firmware binaries must never be sent through MQTT.

## Required technology stack

- Frontend: React with TypeScript.
- Backend: Node.js with TypeScript and Express.
- Database: PostgreSQL 16 (the VPS deployment version).
- MQTT broker: Mosquitto running on the VPS.
- Firmware storage: MinIO running as a container on the VPS.
- MQTT test and inspection tool: MQTT Explorer.
- Deployment: Docker Compose on the VPS.
- VPS deployment file: `docker-compose.vps.yml`.
- Current infrastructure-only file: `docker-compose.vps-infra.yml` (MinIO and Mosquitto only; PostgreSQL already exists separately).

### Current development topology

The VPS hosts infrastructure only:

```text
VPS: PostgreSQL 16 + MinIO + Mosquitto
PC:  Node backend + React dashboard + MQTT Explorer
```

The local backend connects to the VPS services through configured endpoints or an SSH tunnel. The local React development server proxies `/api` to the local backend.

### Existing repository note

The current backend is implemented with Fastify, not Express. This is an important architecture decision that must be resolved before substantial backend work:

- Preferred requirement: migrate the backend to Express while preserving API behavior and database contracts; or
- Approved exception: retain Fastify and document the reason before adding new backend modules.

Do not silently mix Express and Fastify patterns in the same backend.

## Storage requirements

- Keep MinIO containerized on the VPS.
- Use a private MinIO bucket named `firmware`.
- Keep firmware files outside PostgreSQL; PostgreSQL stores metadata only.
- Use immutable object keys containing product, hardware revision, version, and SHA-256.
- Never overwrite an existing firmware artifact.
- Generate temporary authorized HTTPS download URLs for devices.
- The backend must never proxy large firmware downloads unnecessarily.
- Back up the MinIO data volume and PostgreSQL database separately.

Recommended object-key format:

```text
firmware/{product}/{hardwareVersion}/{version}/{sha256}.bin
```

## Current PostgreSQL schema

The current migration is `database/migrations/001_initial_schema.sql`.

### `devices`

| Field | Current type | Purpose |
| --- | --- | --- |
| `id` | uuid | Internal device identifier. |
| `device_uid` | text, unique | Hardware/device identity used in MQTT topics. |
| `product` | text | Product family compatibility value. |
| `hardware_version` | text | Hardware revision compatibility value. |
| `current_firmware` | text, nullable | Last known firmware version. |
| `target_firmware` | text, nullable | Intended target version. |
| `last_seen` | timestamptz, nullable | Last HTTP or future MQTT observation. |
| `last_ip` | inet, nullable | Last known device IP when reported. |
| `last_ota_check` | timestamptz, nullable | Last version/status check time. |
| `ota_status` | `ota_status` | Current device OTA state. |
| `mqtt_client_id` | text, nullable | MQTT client identity when supplied. |
| `connection_status` | text | Current MQTT/runtime connection state. |
| `last_status_at` | timestamptz, nullable | Last validated MQTT status time. |
| `last_boot_id` | text, nullable | Device boot identity for duplicate protection. |
| `created_at` | timestamptz | Creation time. |
| `updated_at` | timestamptz | Last database update time. |

### `firmware_versions`

| Field | Current type | Purpose |
| --- | --- | --- |
| `id` | uuid | Firmware release identifier. |
| `product` | text | Compatible product. |
| `hardware_version` | text | Compatible hardware revision. |
| `version` | text | Semantic firmware version. |
| `file_key` | text, unique | MinIO/R2 object key. |
| `file_size` | bigint | Binary size in bytes. |
| `sha256` | char(64) | Expected binary SHA-256. |
| `release_notes` | text | Release description. |
| `status` | `firmware_status` | `DRAFT`, `READY`, or `ARCHIVED`. |
| `created_by` | text | Administrator or service that uploaded it. |
| `created_at` | timestamptz | Upload time. |

### `deployments`

| Field | Current type | Purpose |
| --- | --- | --- |
| `id` | uuid | Deployment identifier. |
| `name` | text, unique | Human-readable rollout name. |
| `firmware_id` | uuid | Target firmware release. |
| `status` | `deployment_status` | Deployment lifecycle state. |
| `rollout_type` | text | Currently selected-device rollout. |
| `rollout_percentage` | numeric, nullable | Reserved percentage rollout value. |
| `max_concurrency` | integer | Intended maximum active device updates. Not enforced yet. |
| `started_at` | timestamptz, nullable | Start time. |
| `paused_at` | timestamptz, nullable | Pause time. |
| `completed_at` | timestamptz, nullable | Completion time. |
| `created_by` | text | Administrator or service that created it. |
| `created_at` | timestamptz | Creation time. |

### `deployment_devices`

| Field | Current type | Purpose |
| --- | --- | --- |
| `id` | uuid | Assignment identifier. |
| `deployment_id` | uuid | Parent deployment. |
| `device_id` | uuid | Target device. |
| `status` | `ota_status` | Per-device rollout state. |
| `retry_count` | integer | Number of delivery attempts. |
| `last_attempt_at` | timestamptz, nullable | Last command attempt. |
| `next_retry_at` | timestamptz, nullable | Backoff schedule. |
| `last_error` | text, nullable | Latest failure reason. |
| `completed_at` | timestamptz, nullable | Per-device completion time. |
| `command_id` | uuid, nullable | Idempotent OTA command identity. |
| `command_sent_at` | timestamptz, nullable | Last command publish time. |
| `claimed_at` | timestamptz, nullable | Worker claim time. |
| `claimed_by` | text, nullable | Worker identity holding the claim. |
| `started_at` | timestamptz, nullable | Device-level OTA start time. |
| `finished_at` | timestamptz, nullable | Device-level OTA finish time. |
| `last_progress_percent` | integer, nullable | Latest reported progress. |
| `last_progress_at` | timestamptz, nullable | Latest progress event time. |

### `ota_events`

| Field | Current type | Purpose |
| --- | --- | --- |
| `id` | uuid | Event identifier. |
| `device_id` | uuid | Device associated with the event. |
| `deployment_id` | uuid, nullable | Related deployment. |
| `event_type` | text | Event name. |
| `from_version` | text, nullable | Previous firmware version. |
| `to_version` | text, nullable | Target firmware version. |
| `error_code` | text, nullable | Stable failure code. |
| `metadata` | jsonb | Additional validated event data. |
| `created_at` | timestamptz | Event time. |

### `mqtt_message_receipts`

| Field | Current type | Purpose |
| --- | --- | --- |
| `message_id` | text, primary key | Device message identity used for deduplication. |
| `device_uid` | text | Device that sent the message. |
| `message_type` | text | Validated MQTT message type. |
| `received_at` | timestamptz | First receipt time. |

## Database fields still needed

The existing schema is a good foundation, but the following fields or supporting tables should be added after the MQTT and deployment contracts are finalized:

### Device runtime and identity

- `mqtt_client_id` or a secure device credential reference.
- `connection_status` or a derived online/offline state.
- `last_status_at` separate from generic `last_seen`.
- `firmware_build_id` or image identity in addition to the version string.
- `battery_mv`, signal strength, and device telemetry only if the device reports them.
- `last_boot_id` or status sequence number for duplicate/out-of-order protection.

### Deployment delivery

- `command_id` and `command_sent_at` per deployment-device attempt. These fields now exist; command scheduling and publishing still need to use them.
- `claimed_at` and `claimed_by` for safe worker concurrency.
- `started_at` and `finished_at` at the deployment-device level.
- `last_progress_percent` and `last_progress_at`.
- `desired_firmware_id` or a stronger relation from device target to firmware release.
- Explicit rollout wave or batch fields if staged rollout is required.

### Idempotency and audit

- Unique event/message identifier from the device.
- Unique constraint or deduplication table for processed MQTT messages.
- Full MQTT topic and message type in event metadata.
- Actor/source field identifying device, admin, worker, or system.

### Firmware security

- Signature algorithm and signature/object key metadata.
- Signing key version or key identifier.
- Minimum supported bootloader/device version.
- Anti-rollback policy or minimum allowed version.

These additions should be implemented through new versioned migrations, not by editing an already-applied migration in place.

## MQTT requirements

MQTT Explorer is a development, troubleshooting, and demonstration client. It is not a replacement for the backend MQTT client or the Mosquitto broker.

Recommended topics:

```text
devices/{device_id}/status       device -> backend
devices/{device_id}/command      backend -> device
devices/{device_id}/ota/status   device -> backend
```

Requirements:

- Backend must connect to Mosquitto as a persistent MQTT client.
- Device status is published on boot, reconnect, and a jittered heartbeat.
- Backend stores the latest runtime state in PostgreSQL.
- Backend compares the reported firmware with an eligible deployment.
- OTA commands are targeted to one device, not broadcast to the fleet.
- Use QoS 1 for control/status messages where appropriate.
- Do not retain OTA commands.
- Commands must contain a deployment ID or command ID for idempotency.
- Production must use TLS, device credentials, and topic ACLs.
- Local development may use MQTT Explorer and anonymous Mosquitto access only.

## OTA command and download requirements

An OTA command contains metadata, not binary bytes:

```json
{
  "msg_type": "ota.start",
  "deployment_id": "uuid",
  "version": "1.5.0",
  "url": "temporary-https-download-url",
  "size": 2097152,
  "sha256": "64-character-lowercase-hash"
}
```

The ESP32 must:

- Validate device identity, product, hardware, version, size, and policy.
- Download the binary over HTTPS from MinIO.
- Calculate SHA-256 while downloading.
- Compare the calculated hash with the expected hash.
- Install only after validation succeeds.
- Use an inactive OTA partition.
- Reboot and perform a health check.
- Report success only after healthy post-boot MQTT reconnection.
- Report failure or rollback with a stable error code.

## Fleet and deployment requirements

- Support fleets larger than the currently active device count.
- Do not poll every device continuously with `ota.check`.
- Devices publish status on boot/reconnect and periodically.
- Use randomized heartbeat/reconnect jitter to avoid traffic spikes.
- Store current firmware, target firmware, last seen, and OTA status in PostgreSQL.
- Use a scheduler/worker to enforce deployment concurrency.
- Start with a small rollout wave and increase concurrency after testing.
- Keep offline devices in a waiting state.
- Retry failed devices with bounded exponential backoff.
- Support pause, resume, cancel, retry-failed, and retry-device operations.
- Mark deployment success only after device confirmation.

## Frontend and UX requirements

The React dashboard should provide an OTA Drive-style operator experience:

- Secure administrator login.
- Overview with fleet health, online/offline counts, outdated devices, active deployments, failures, and recent activity.
- Device search, filtering, grouping, tags, and detail pages.
- Current firmware versus target firmware visibility.
- Firmware upload progress, checksum, compatibility, release notes, and lifecycle status.
- Deployment preview before start.
- Compatibility and offline-device warnings.
- Start, pause, resume, cancel, retry, and rollback visibility.
- Live deployment progress by device and by rollout wave.
- Per-device error codes and event timeline.
- OTA history and audit trail.
- Clear empty, loading, success, warning, and failure states.
- Responsive, accessible, consistent visual design.
- Avoid claiming that a deployment is active until the backend actually starts delivery.

## Code quality and structure requirements

- Keep frontend, backend, database, infrastructure, and documentation separated.
- Use typed request/response schemas and shared message contracts where practical.
- Validate all HTTP and MQTT input at the boundary.
- Keep MQTT transport, OTA orchestration, storage, database access, and HTTP routes in separate modules.
- Prefer small services with single responsibilities.
- Use consistent naming and error codes.
- Do not place business logic directly in React components or route handlers when it belongs in a service.
- Add unit tests for version comparison, compatibility, command idempotency, retry policy, and state transitions.
- Add integration tests for PostgreSQL, MinIO, MQTT, and deployment scheduling.
- Run type-checking and production builds before handoff.
- Update documentation whenever a topic, payload, schema, or state transition changes.

## Future interactions and scope guardrails

- Preserve the technology choices in this document unless the user explicitly changes them.
- Do not replace MinIO with a hosted storage service without approval.
- Do not send firmware binaries through MQTT.
- Do not add a global fleet-wide OTA broadcast topic.
- Do not remove compatibility with existing device topics without a migration plan.
- Do not claim that MQTT, OTA delivery, rollback, or live status works until it is implemented and tested.
- If a requested OTA Drive feature is not currently eligible for safe implementation, document it in this file under `Future / blocked features` instead of silently omitting it.
- Ask for a decision only when a choice materially affects architecture, security, data migration, or device compatibility.

## Future / blocked features

Record features here when they require device firmware details, hardware testing, external credentials, or an explicit product decision.

- Exact ESP32-C5 partition table and available OTA slot size.
- Exact existing device MQTT topic and payload contract.
- Device authentication and Mosquitto ACL format.
- Firmware signing key and signature format.
- Rollback and post-boot health behavior on physical hardware.
- Express migration decision because the current backend uses Fastify.
- Exact OTA Drive feature parity list and acceptance criteria.
