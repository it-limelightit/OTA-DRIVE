# OTA Platform Architecture

## 1. Architectural Objective

Create a simple, reliable OTA control plane around the existing MQTT-based ESP32 fleet.

Avoid putting firmware delivery load on the MQTT broker.

## 2. Logical Architecture

```text
                        ADMIN USER
                            |
                            v
                  +-------------------+
                  |   WEB DASHBOARD   |
                  +---------+---------+
                            |
                          HTTPS
                            |
                            v
                  +-------------------+
                  |    OTA BACKEND    |
                  |-------------------|
                  | Auth              |
                  | Device Service    |
                  | Firmware Service  |
                  | Deployment Engine |
                  | MQTT Integration  |
                  | OTA Event Service |
                  +----+---------+----+
                       |         |
                       |         |
                       v         v
                 PostgreSQL   Object Storage
                                  |
                                  |
                            Firmware binaries
                                  |
                                 HTTPS
                                  |
                                  v
+-------------+        +--------------------+        +-------------+
| ESP32-C5 #1 |<------>|    MQTT BROKER     |<------>| OTA Backend |
+-------------+        +--------------------+        +-------------+
      |
      +---------------- HTTPS ----------------> Object Storage
```

## 3. Component Responsibilities

### ESP32 Device

- Report identity.
- Report current firmware.
- Receive OTA command.
- Validate compatibility.
- Check prerequisites.
- Download firmware using HTTPS.
- Verify firmware.
- Install to inactive OTA partition.
- Reboot.
- Validate new firmware.
- Report OTA state.
- Roll back on invalid firmware if supported.

The device should NOT decide fleet-wide rollout policy.

### MQTT Broker

- Transport control messages.
- Transport device status.
- Transport OTA state changes.
- Transport commands.

Do NOT use the broker as firmware file storage.

### OTA Backend

The backend is the control plane.

Responsibilities:
- Device registry.
- Firmware tracking.
- Firmware metadata.
- Deployment creation.
- Device eligibility.
- Rollout targeting.
- Concurrency management.
- Retry policy.
- MQTT command publishing.
- OTA event ingestion.
- Admin APIs.
- Audit logs.

### PostgreSQL

Core tables:

```text
devices
firmware_versions
deployments
deployment_devices
ota_events
users
audit_logs
```

Optional later:

```text
device_groups
sites
hardware_models
release_channels
deployment_rules
```

## 4. Suggested Data Model

### devices

```text
id
device_uid
product
hardware_version
current_firmware
last_seen
ota_status
created_at
updated_at
```

### firmware_versions

```text
id
product
hardware_version
version
file_key
file_size
sha256
release_notes
status
created_by
created_at
```

### deployments

```text
id
name
firmware_id
status
rollout_type
rollout_percentage
max_concurrency
created_by
created_at
started_at
paused_at
completed_at
```

### deployment_devices

```text
id
deployment_id
device_id
status
retry_count
last_attempt_at
next_retry_at
last_error
completed_at
```

### ota_events

```text
id
device_id
deployment_id
event_type
from_version
to_version
error_code
metadata_json
created_at
```

## 5. MQTT Architecture

Recommended topics:

```text
devices/{device_id}/status
devices/{device_id}/command
devices/{device_id}/ota/status
```

Avoid one permanent fleet-wide OTA broadcast topic.

## 6. Device Status Example

```json
{
  "device_id": "IR000123",
  "product": "SMART_IR",
  "hw": "HW2",
  "fw": "1.4.2",
  "battery_mv": 3710
}
```

## 7. OTA Command Example

```json
{
  "command": "ota",
  "deployment_id": "DEP_1007",
  "version": "1.5.0",
  "url": "https://firmware.example.com/smart-ir/hw2/1.5.0.bin",
  "size": 1378544,
  "sha256": "..."
}
```

## 8. OTA Status Example

Started:

```json
{
  "deployment_id": "DEP_1007",
  "status": "started",
  "from_version": "1.4.2",
  "to_version": "1.5.0"
}
```

Success:

```json
{
  "deployment_id": "DEP_1007",
  "status": "success",
  "current_version": "1.5.0"
}
```

Failure:

```json
{
  "deployment_id": "DEP_1007",
  "status": "failed",
  "error_code": "HTTP_TIMEOUT"
}
```

## 9. OTA State Model

```text
PENDING
WAITING_FOR_DEVICE
POSTPONED
STARTED
DOWNLOADING
VERIFYING
INSTALLING
REBOOTING
SUCCESS
FAILED
ROLLED_BACK
CANCELLED
```

## 10. Device OTA State Machine

```text
IDLE
 |
 v
COMMAND_RECEIVED
 |
 v
PRECHECK
 |  |  \ failure
 |   -> POSTPONED / FAILED
 |
 v
DOWNLOAD
 |  |  -> FAILED
 |
 v
VERIFY
 |  |  -> FAILED
 |
 v
INSTALL
 |
 v
REBOOT
 |
 v
POST_BOOT_VALIDATE
 |  |  -> ROLLBACK
 |
 v
SUCCESS
```

## 11. Deployment State Machine

```text
DRAFT
  |
  v
READY
  |
  v
RUNNING
 /  |   v   v    v
PAUSED FAILED COMPLETED
 |
 v
RUNNING
```

## 12. Firmware Storage

Use object storage:
- Cloudflare R2
- AWS S3
- Supabase Storage
- MinIO

Database stores metadata, not the binary.

## 13. Download Authorization

Production flow:

```text
Device authenticates
-> Backend confirms deployment
-> Backend authorizes short-lived URL
-> ESP32 downloads firmware
```

## 14. Scalability Strategy

For 1,000+ sleeping devices:
- Let devices naturally connect.
- Evaluate OTA at connection time.
- Target devices individually.
- Limit concurrent updates.
- Serve binaries from object storage/CDN.
- Keep MQTT payloads small.
- Persist deployment state in DB.

## 15. Concurrency

Backend should support configurable maximum active updates.

Example:

```text
max_concurrency = 25
```

Do not hard-code the final production value before load testing.

## 16. Reliability

Required:
- idempotent OTA commands.
- duplicate MQTT message safety.
- reconnect handling.
- transaction-safe state updates.
- database indexes.
- retry backoff.
- timeout handling.
- structured error codes.

## 17. Security Boundaries

Minimum rules:
- HTTPS.
- MQTT authentication.
- Admin authentication.
- Device authentication.
- Never trust `device_id` alone.
- Validate firmware compatibility.
- Validate file hash.
- Protect object storage.
- Never expose signing private keys.

## 18. Observability

Track:
```text
deployment success rate
failure rate
rollback rate
active OTA count
average OTA duration
firmware distribution
outdated device count
failures by reason
retry count
```

## 19. Existing Code Rule

Do NOT rewrite working modules just to match this file.

Use:

```text
existing working implementation
+
missing requirements
=
target implementation
```
