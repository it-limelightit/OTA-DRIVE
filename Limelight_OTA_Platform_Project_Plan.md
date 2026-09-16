# Limelight OTA Platform

## Project Planning & System Design for ESP32-C5 Fleet

**Document Status:** Initial Project Plan\
**Target:** Production-ready private OTA platform for 1,000+ ESP32
devices\
**Primary Device:** ESP32-C5 Smart IR Controller\
**Communication:** MQTT for control/status + HTTPS for firmware
download\
**Document Version:** 1.0\
**Date:** 08 September 2026

------------------------------------------------------------------------

## 1. Project Objective

Build an in-house OTA (Over-the-Air) firmware management platform
similar in purpose to OTAdrive, but designed specifically for our
ESP32-C5 device fleet.

The platform must allow us to:

-   Upload new ESP32 firmware (`.bin`) from an admin dashboard.
-   Maintain firmware versions and release history.
-   Assign firmware to selected devices, groups, hardware versions, or
    staged rollout batches.
-   Notify devices about available updates using the existing MQTT
    infrastructure.
-   Download firmware securely over HTTPS instead of transferring
    binaries through MQTT.
-   Track OTA states such as waiting, started, downloading, installed,
    success, failed, and rollback.
-   Safely handle 1,000+ devices without all devices downloading
    firmware simultaneously.
-   Retry failed updates without creating an endless retry loop.
-   Protect devices against invalid, corrupted, or unauthorized
    firmware.
-   Maintain a complete audit trail of firmware deployments.

------------------------------------------------------------------------

## 2. Core Design Principle

Use each technology for the job it handles best:

``` text
MQTT          -> Device communication, OTA command, OTA status
HTTPS         -> Firmware binary download
Backend API   -> OTA decision logic and deployment management
PostgreSQL    -> Devices, firmware metadata, deployments, OTA history
Object Storage-> Actual .bin firmware files
Dashboard     -> Human administration and monitoring
ESP32 OTA     -> Download, verify, install, reboot and rollback
```

**Important:** Firmware binaries should NOT be transferred through MQTT.

------------------------------------------------------------------------

## 3. High-Level Architecture

``` text
                         ADMIN / ENGINEER
                                |
                                v
                    +-----------------------+
                    |    OTA WEB DASHBOARD  |
                    |-----------------------|
                    | Upload Firmware       |
                    | Create Deployment     |
                    | Select Devices        |
                    | Rollout Control       |
                    | Monitor OTA Status    |
                    +-----------+-----------+
                                |
                                | HTTPS API
                                v
                    +-----------------------+
                    |      OTA BACKEND      |
                    |-----------------------|
                    | Authentication        |
                    | Firmware Management   |
                    | Deployment Engine     |
                    | Device Targeting      |
                    | Rollout Control       |
                    | OTA Status Tracking   |
                    +-----+------------+----+
                          |            |
                          |            |
                          v            v
                    PostgreSQL    Object Storage
                                      |
                                      | firmware.bin
                                      |
                 +--------------------+--------------------+
                 |                                         |
                 | MQTT                               HTTPS |
                 v                                         v
            MQTT BROKER <------------------------- ESP32-C5 Fleet
                                                      |
                                  +-------------------+-------------------+
                                  |                   |                   |
                               Device 1            Device 2          Device 1000+
```

------------------------------------------------------------------------

## 4. Recommended Technology Stack

### Device

-   ESP32-C5
-   Arduino-ESP32 or ESP-IDF
-   Existing MQTT client
-   ESP32 OTA partition mechanism
-   HTTPS OTA client
-   SHA-256 validation
-   Firmware rollback support
-   Secure Boot / signed firmware as a production-hardening phase

### Backend

Recommended choices:

-   **Option A:** Node.js + TypeScript + Fastify/NestJS
-   **Option B:** Python + FastAPI

For a new production service, TypeScript/Node.js is a strong choice if
the existing dashboard/backend is JavaScript/TypeScript. FastAPI is
equally suitable if the team is more comfortable with Python.

### Database

-   PostgreSQL
-   Supabase PostgreSQL is acceptable if already used in the project.

### Firmware Storage

Preferred:

-   Cloudflare R2

Alternatives:

-   AWS S3
-   Supabase Storage
-   MinIO on own infrastructure

Do not store firmware binary data directly inside PostgreSQL.

### Dashboard

-   React / Next.js
-   Existing internal dashboard can later integrate the OTA module.

### Infrastructure

-   Existing MQTT broker
-   VPS/backend server
-   HTTPS/TLS
-   Reverse proxy such as Nginx if required
-   Domain example: `ota.<company-domain>`

------------------------------------------------------------------------

## 5. Complete OTA Flow

### Step 1 --- Develop Firmware

Developer modifies ESP32 firmware.

Every firmware build must contain an explicit version.

Example:

``` cpp
#define FW_VERSION "1.1.0"
#define HW_VERSION "HW2"
#define PRODUCT_ID "SMART_IR"
```

Versioning should follow Semantic Versioning where practical:

``` text
MAJOR.MINOR.PATCH

1.0.0
1.0.1
1.1.0
2.0.0
```

------------------------------------------------------------------------

### Step 2 --- Build Firmware

Compile the production project and generate:

``` text
smart_ir_hw2_v1.1.0.bin
```

The release process should calculate:

-   File size
-   SHA-256 hash
-   Product ID
-   Hardware compatibility
-   Firmware version
-   Build timestamp
-   Release notes

Example metadata:

``` json
{
  "product": "SMART_IR",
  "hardware_version": "HW2",
  "firmware_version": "1.1.0",
  "file_size": 1378544,
  "sha256": "abc123...",
  "release_notes": "Improved Wi-Fi reconnection and OTA reliability"
}
```

------------------------------------------------------------------------

### Step 3 --- Upload Firmware

Engineer logs into the OTA dashboard and uploads the `.bin`.

Flow:

``` text
Dashboard
   |
   +--> Backend validates metadata
   |
   +--> .bin uploaded to Object Storage
   |
   +--> Firmware metadata stored in PostgreSQL
```

Firmware is NOT automatically deployed just because it was uploaded.

Firmware states:

``` text
DRAFT
READY
DEPLOYING
PAUSED
ARCHIVED
```

------------------------------------------------------------------------

### Step 4 --- Create Deployment

Admin chooses:

``` text
Firmware: 1.1.0
Product: SMART_IR
Hardware: HW2
```

Then selects target:

``` text
Selected devices
Device group
Site
Hardware version
Percentage rollout
All compatible devices
```

Example:

``` text
Deployment: SMART_IR_1.1.0_TEST
Target: 10 internal devices
Firmware: 1.1.0
```

Backend records the target version for those devices.

------------------------------------------------------------------------

### Step 5 --- ESP32 Wakes Normally

The Smart IR device follows its existing battery-powered cycle.

``` text
Wake
 |
 +--> Initialize
 |
 +--> Connect Wi-Fi
 |
 +--> Connect MQTT
 |
 +--> Publish telemetry/status
```

The OTA system should fit into this existing flow rather than creating a
separate always-on connection.

------------------------------------------------------------------------

### Step 6 --- Device Reports Firmware Version

Example MQTT topic:

``` text
devices/{device_id}/status
```

Example:

``` text
devices/IR000123/status
```

Payload:

``` json
{
  "device_id": "IR000123",
  "product": "SMART_IR",
  "hw": "HW2",
  "fw": "1.0.0",
  "battery_mv": 3710
}
```

Backend receives the message and updates:

-   Last seen
-   Current firmware
-   Hardware version
-   Device status

------------------------------------------------------------------------

### Step 7 --- Backend Makes OTA Decision

Backend compares:

``` text
Device firmware = 1.0.0
Target firmware = 1.1.0
```

It also checks:

``` text
Is device part of deployment?
Is firmware compatible with this hardware?
Is deployment active?
Has device exceeded retry limit?
Is rollout capacity available?
```

If no update is required:

``` text
Normal operation -> Sleep
```

If update is required, backend sends an OTA command.

------------------------------------------------------------------------

### Step 8 --- Send OTA Command Through MQTT

Topic:

``` text
devices/IR000123/command
```

Payload:

``` json
{
  "command": "ota",
  "deployment_id": "DEP_1007",
  "version": "1.1.0",
  "url": "https://firmware.example.com/smart-ir/hw2/1.1.0.bin",
  "size": 1378544,
  "sha256": "abc123..."
}
```

MQTT carries only the instruction and metadata.

------------------------------------------------------------------------

### Step 9 --- Device Performs Pre-OTA Checks

Before downloading:

``` text
Correct product?
Correct hardware?
New version?
Battery sufficient?
Wi-Fi acceptable?
OTA partition available?
URL valid?
```

Recommended device-side rules should be configurable after testing.

Example:

``` text
Battery below threshold -> postpone OTA
Very weak Wi-Fi -> postpone OTA
Wrong hardware version -> reject OTA
Same firmware version -> ignore OTA
```

Do not hard-code an untested battery threshold into production policy.

------------------------------------------------------------------------

### Step 10 --- Report OTA Start

MQTT topic:

``` text
devices/IR000123/ota/status
```

Payload:

``` json
{
  "deployment_id": "DEP_1007",
  "status": "started",
  "from_version": "1.0.0",
  "to_version": "1.1.0"
}
```

Backend changes dashboard status:

``` text
WAITING -> STARTED
```

------------------------------------------------------------------------

### Step 11 --- Download Firmware Using HTTPS

ESP32 downloads:

``` text
https://firmware.example.com/smart-ir/hw2/1.1.0.bin
```

Flow:

``` text
Object Storage
      |
      | HTTPS
      v
    ESP32
      |
      +--> Receive chunk
      +--> Write chunk to inactive OTA partition
      +--> Repeat until complete
```

The entire firmware should not need to fit into RAM.

------------------------------------------------------------------------

## 6. ESP32 OTA Partition Strategy

Use an OTA-capable partition table.

Conceptually:

``` text
+---------------------------+
| Bootloader                |
+---------------------------+
| Partition Table           |
+---------------------------+
| NVS                       |
+---------------------------+
| OTA Data                  |
+---------------------------+
| OTA_0                     |
| Current Firmware          |
+---------------------------+
| OTA_1                     |
| New Firmware              |
+---------------------------+
| Other Required Storage    |
+---------------------------+
```

Example:

``` text
Before OTA:

OTA_0 = v1.0.0 ACTIVE
OTA_1 = old/unused
```

Download:

``` text
OTA_0 = v1.0.0 ACTIVE
OTA_1 = v1.1.0 DOWNLOADING
```

After successful verification:

``` text
Next boot -> OTA_1
```

This protects the current application while the update is being
downloaded.

------------------------------------------------------------------------

## 7. Firmware Verification

Before booting new firmware, verify at minimum:

``` text
Download completed
Correct image
Expected file size
SHA-256 matches
ESP32 image validation succeeds
```

Later production security should include signed firmware.

If verification fails:

``` text
Do NOT switch boot partition
Report FAILED
Continue using existing firmware
```

------------------------------------------------------------------------

## 8. Reboot and New Firmware Validation

After successful installation:

``` text
Mark new OTA partition for boot
        |
        v
Restart ESP32
        |
        v
Boot v1.1.0
```

The new firmware should perform a startup health check:

``` text
Boot successful?
Critical initialization successful?
Wi-Fi works?
MQTT connection works?
Required NVS/config readable?
```

Only after the new application is healthy should it be considered
successful.

------------------------------------------------------------------------

## 9. Report OTA Success

After reconnecting to MQTT:

Topic:

``` text
devices/IR000123/ota/status
```

Payload:

``` json
{
  "deployment_id": "DEP_1007",
  "status": "success",
  "from_version": "1.0.0",
  "current_version": "1.1.0"
}
```

Backend verifies:

``` text
Target = 1.1.0
Reported = 1.1.0
```

Then:

``` text
OTA = SUCCESS
```

------------------------------------------------------------------------

## 10. Failure Handling

Possible failures include:

``` text
Wi-Fi disconnected
HTTPS timeout
DNS failure
TLS failure
Insufficient battery
Firmware download interrupted
Hash mismatch
Invalid image
Flash write failure
Device rebooted during OTA
New firmware crashes
MQTT does not reconnect
```

Every failure should have a machine-readable error code.

Example:

``` json
{
  "deployment_id": "DEP_1007",
  "status": "failed",
  "error_code": "HTTP_TIMEOUT"
}
```

Suggested statuses:

``` text
PENDING
WAITING_FOR_DEVICE
STARTED
DOWNLOADING
INSTALLING
REBOOTING
SUCCESS
FAILED
POSTPONED
ROLLED_BACK
CANCELLED
```

------------------------------------------------------------------------

## 11. Retry Strategy

Never retry continuously.

Example policy:

``` text
Attempt 1 -> Failed
Wait until a later wake
Attempt 2 -> Failed
Wait longer
Attempt 3 -> Failed
Mark OTA_FAILED
```

Backend can then require manual or scheduled retry.

Store:

``` text
retry_count
last_attempt_at
last_error
next_retry_at
```

Use backoff instead of immediate repeated downloads.

------------------------------------------------------------------------

## 12. Rollback Strategy

Rollback is mandatory before broad production rollout.

Example:

``` text
v1.0.0 working
     |
     | OTA
     v
v1.1.0 boots
     |
     +--> health check successful
     |       |
     |       v
     |   Mark firmware VALID
     |
     +--> boot/crash/validation failure
             |
             v
          ROLLBACK
             |
             v
          v1.0.0
```

The exact ESP-IDF rollback configuration must be validated on the actual
ESP32-C5 firmware and partition scheme before production deployment.

------------------------------------------------------------------------

## 13. Scaling for 1,000+ Devices

Do NOT send one broadcast command that causes every device to download
immediately.

Use controlled rollout.

Example:

``` text
Stage 0 -> Development devices
Stage 1 -> 5-10 internal devices
Stage 2 -> 25 devices
Stage 3 -> 100 devices
Stage 4 -> 25% fleet
Stage 5 -> 50% fleet
Stage 6 -> 100% fleet
```

Each stage should be observed before promotion.

------------------------------------------------------------------------

## 14. Natural Load Distribution

Because the Smart IR devices are battery powered and wake periodically,
use this behavior to our advantage.

``` text
Device 101 wakes -> receives OTA
Device 433 wakes -> receives OTA
Device 287 wakes -> receives OTA
Device 812 wakes -> receives OTA
```

Do not require all devices to be online at deployment creation time.

Backend maintains the deployment assignment until the device eventually
connects.

------------------------------------------------------------------------

## 15. Concurrency Control

Even with natural wake distribution, add a backend concurrency limit.

Example concept:

``` text
Deployment maximum active OTA downloads = 25 or 50
```

The correct production value should be established through load testing.

If capacity is reached:

``` text
Device connects
      |
      v
OTA required?
      |
     YES
      |
      v
Capacity available?
   /       \
 YES        NO
 |           |
Send OTA   Postpone
```

Object storage/CDN can later reduce the load on the application VPS.

------------------------------------------------------------------------

## 16. MQTT Topic Design

Recommended initial structure:

``` text
devices/{device_id}/status
devices/{device_id}/command
devices/{device_id}/ota/status
```

Example:

``` text
devices/IR000123/status
devices/IR000123/command
devices/IR000123/ota/status
```

Avoid a global OTA broadcast topic for production deployments.

The backend should target devices intentionally.

------------------------------------------------------------------------

## 17. MQTT QoS and Retained Message Planning

This must be decided carefully.

For OTA commands, avoid leaving stale commands that can unexpectedly
trigger an old deployment later.

Recommended design:

-   Deployment truth lives in the database.
-   Device status messages are informational.
-   OTA assignment is validated by the backend.
-   Commands include `deployment_id` and target version.
-   Device rejects duplicate/already-completed deployments.
-   MQTT retained-message behavior must be explicitly tested before
    production.
-   QoS should be selected based on the existing broker/client behavior
    and duplicate-message handling.

The device logic must be idempotent: receiving the same OTA command
twice must not cause unsafe behavior.

------------------------------------------------------------------------

## 18. Database Design

### `devices`

``` text
id
device_uid
product
hardware_version
current_firmware
target_firmware
last_seen
last_ip (optional)
last_ota_check
ota_status
created_at
updated_at
```

### `firmware_versions`

``` text
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

### `deployments`

``` text
id
name
firmware_id
status
rollout_type
rollout_percentage
max_concurrency
started_at
paused_at
completed_at
created_by
created_at
```

### `deployment_devices`

``` text
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

### `ota_events`

``` text
id
device_id
deployment_id
event_type
from_version
to_version
error_code
metadata
created_at
```

`ota_events` acts as an audit/event history.

------------------------------------------------------------------------

## 19. Admin Dashboard Pages

### Dashboard

Show:

``` text
Total devices
Online/recent devices
Firmware distribution
Active deployments
OTA success rate
OTA failures
Devices waiting for OTA
Rollback count
```

### Devices

Columns:

``` text
Device ID
Product
Hardware
Current Firmware
Target Firmware
Last Seen
OTA Status
```

### Firmware

Show:

``` text
Version
Product
Hardware
File Size
SHA-256
Release Date
Release Notes
Status
```

Actions:

``` text
Upload
Validate
Create Deployment
Archive
```

### Deployments

Show:

``` text
Deployment Name
Firmware
Target Count
Waiting
Updating
Success
Failed
Rolled Back
Progress %
```

Actions:

``` text
Start
Pause
Resume
Cancel
Expand rollout
Retry failed devices
```

### Device OTA History

Example:

``` text
IR000123

1.0.0 -> 1.1.0
Started: 18:20
Completed: 18:23
Result: SUCCESS
Deployment: DEP_1007
```

------------------------------------------------------------------------

## 20. Security Requirements

### Minimum for MVP

-   HTTPS only.
-   MQTT authentication.
-   Device identity.
-   Admin authentication.
-   SHA-256 firmware verification.
-   Hardware compatibility checks.
-   Server-side authorization.
-   Firmware upload restricted to authorized users.
-   Audit logging.

### Production Hardening

Add:

-   Per-device credentials.
-   Signed firmware.
-   Secure Boot where appropriate.
-   Flash Encryption where appropriate.
-   Credential rotation strategy.
-   Signed/short-lived firmware download URLs.
-   Rate limiting.
-   API authorization roles.
-   Secrets management.
-   Backup and disaster recovery.

Never rely only on a device ID as authentication.

------------------------------------------------------------------------

## 21. Firmware URL Security

Avoid permanently public firmware URLs for production.

Preferred future flow:

``` text
Device authenticated
       |
       v
Backend approves OTA
       |
       v
Generate short-lived download URL
       |
       v
ESP32 downloads firmware
```

The URL may expire after a short period.

This prevents unrestricted long-term access to production firmware
binaries.

------------------------------------------------------------------------

## 22. Device State Machine

Implement OTA on the ESP32 as a state machine.

``` text
IDLE
 |
 v
OTA_COMMAND_RECEIVED
 |
 v
PRECHECK
 |
 +--> FAIL -> POSTPONED/FAILED
 |
 v
DOWNLOAD
 |
 +--> FAIL -> FAILED
 |
 v
VERIFY
 |
 +--> FAIL -> FAILED
 |
 v
INSTALL
 |
 v
REBOOT
 |
 v
POST_BOOT_CHECK
 |
 +--> FAIL -> ROLLBACK
 |
 v
SUCCESS
```

This is easier to debug than one large OTA function.

------------------------------------------------------------------------

## 23. Backend Deployment State Machine

``` text
DRAFT
  |
  v
READY
  |
  v
RUNNING
 /   |    \
v    v     v
PAUSED FAILED COMPLETED
 |
 v
RUNNING
```

A cancelled deployment should not silently restart.

------------------------------------------------------------------------

## 24. Suggested Repository Structure

A clean monorepo could be:

``` text
limelight-ota/
|
+-- README.md
+-- docs/
|   +-- architecture.md
|   +-- mqtt-protocol.md
|   +-- api-spec.md
|   +-- database.md
|   +-- security.md
|   +-- deployment-runbook.md
|
+-- backend/
|   +-- src/
|   |   +-- auth/
|   |   +-- devices/
|   |   +-- firmware/
|   |   +-- deployments/
|   |   +-- mqtt/
|   |   +-- ota/
|   |   +-- storage/
|   |   +-- database/
|   |   +-- audit/
|   |   +-- config/
|   +-- tests/
|
+-- dashboard/
|   +-- src/
|   |   +-- pages/
|   |   +-- components/
|   |   +-- services/
|   |   +-- hooks/
|   |   +-- types/
|
+-- device/
|   +-- ota/
|   |   +-- ota_manager.*
|   |   +-- ota_state.*
|   |   +-- ota_validation.*
|   +-- mqtt/
|   +-- config/
|   +-- examples/
|
+-- database/
|   +-- migrations/
|   +-- schema/
|
+-- infrastructure/
|   +-- docker/
|   +-- nginx/
|   +-- scripts/
|
+-- firmware-artifacts/
    +-- README.md
```

Do not commit production firmware binaries, credentials, private signing
keys, or environment secrets to the repository.

------------------------------------------------------------------------

## 25. API Design --- Initial Endpoints

### Firmware

``` text
POST   /api/firmware
GET    /api/firmware
GET    /api/firmware/:id
```

### Devices

``` text
GET    /api/devices
GET    /api/devices/:id
GET    /api/devices/:id/ota-history
```

### Deployments

``` text
POST   /api/deployments
GET    /api/deployments
GET    /api/deployments/:id
POST   /api/deployments/:id/start
POST   /api/deployments/:id/pause
POST   /api/deployments/:id/resume
POST   /api/deployments/:id/cancel
```

The MQTT consumer updates device/OTA state separately.

------------------------------------------------------------------------

## 26. MVP Scope

Do not attempt to build every OTAdrive feature in version 1.

### MVP must support:

-   Admin login.
-   Upload `.bin`.
-   Store firmware metadata.
-   SHA-256 generation/validation.
-   Firmware version management.
-   Device registry.
-   Current firmware reporting over MQTT.
-   Select specific devices for deployment.
-   MQTT OTA command.
-   HTTPS firmware download.
-   ESP32 OTA installation.
-   Success/failure reporting.
-   Retry counter.
-   Basic deployment dashboard.
-   OTA history.

### Not required for first MVP:

-   Complex percentage rollout automation.
-   Multiple organizations/tenants.
-   Advanced analytics.
-   Mobile application.
-   Multi-vendor MCU support.
-   Full CI/CD firmware release automation.
-   Sophisticated RBAC.
-   Geographic deployment rules.

Build those after the basic OTA path is proven.

------------------------------------------------------------------------

## 27. Development Phases

### Phase 0 --- Requirements & Existing System Audit

Before coding:

-   Confirm ESP32-C5 flash size.
-   Confirm current partition table.
-   Measure current `.bin` size.
-   Confirm free OTA slot capacity.
-   Confirm Arduino-ESP32 / ESP-IDF version.
-   Document current MQTT topics.
-   Document MQTT authentication.
-   Document wake/sleep behavior.
-   Document battery behavior during Wi-Fi and flash writes.
-   Confirm broker capacity.
-   Select backend language.
-   Select storage provider.
-   Define product/hardware IDs.

**Output:** frozen OTA v1 technical specification.

------------------------------------------------------------------------

### Phase 1 --- ESP32 Local OTA Proof of Concept

Goal:

``` text
ESP32 running v1.0.0
      |
      | HTTPS
      v
Download v1.0.1
      |
      v
Reboot
      |
      v
ESP32 running v1.0.1
```

Test:

-   Successful OTA.
-   Wi-Fi interruption.
-   Wrong file.
-   Hash mismatch.
-   Power interruption.
-   Reboot behavior.
-   Partition behavior.

Do this before building a large dashboard.

------------------------------------------------------------------------

### Phase 2 --- Firmware Storage + Backend

Build:

-   PostgreSQL schema.
-   Firmware upload endpoint.
-   Object storage integration.
-   Firmware metadata.
-   SHA-256 calculation.
-   Basic device registry.

------------------------------------------------------------------------

### Phase 3 --- MQTT Integration

Build backend MQTT consumer.

Flow:

``` text
Device status
     |
     v
MQTT broker
     |
     v
OTA backend
     |
     v
Database
```

Then implement targeted command publishing.

------------------------------------------------------------------------

### Phase 4 --- End-to-End OTA

Complete:

``` text
Upload .bin
    |
Create deployment
    |
Device connects
    |
MQTT command
    |
HTTPS download
    |
Install
    |
Reboot
    |
MQTT success
    |
Dashboard updates
```

At this stage the basic private OTA platform exists.

------------------------------------------------------------------------

### Phase 5 --- Dashboard

Build:

-   Firmware page.
-   Devices page.
-   Create deployment.
-   Deployment progress.
-   Device OTA history.
-   Failed device view.

------------------------------------------------------------------------

### Phase 6 --- Reliability

Add:

-   Retry/backoff.
-   Timeout handling.
-   Duplicate-command handling.
-   Post-boot validation.
-   Rollback.
-   Deployment pause.
-   Deployment cancellation.
-   Error codes.
-   Better logging.

------------------------------------------------------------------------

### Phase 7 --- Scale Testing

Use simulated MQTT clients and controlled physical devices.

Test approximately:

``` text
10
50
100
500
1000+
```

Measure:

-   MQTT broker load.
-   Backend CPU/RAM.
-   Database load.
-   Storage bandwidth.
-   Simultaneous downloads.
-   OTA success rate.
-   Average OTA duration.
-   Failure/retry behavior.

Do not infer 1,000-device capability only from a 5-device test.

------------------------------------------------------------------------

### Phase 8 --- Production Security

Implement:

-   Per-device authentication.
-   Signed firmware.
-   Secure Boot decision.
-   Flash Encryption decision.
-   Short-lived firmware URLs.
-   Role-based admin permissions.
-   Audit logs.
-   Secret management.
-   Backup/recovery.

------------------------------------------------------------------------

### Phase 9 --- CI/CD Integration

Later, automate:

``` text
Git tag/release
     |
     v
Build firmware
     |
     v
Run tests
     |
     v
Generate SHA-256
     |
     v
Sign firmware
     |
     v
Upload as DRAFT
     |
     v
Human approval
     |
     v
Deployment
```

Never automatically deploy untested firmware to the entire fleet after a
code push.

------------------------------------------------------------------------

## 28. Testing Matrix

Every firmware release process should eventually cover:

  -----------------------------------------------------------------------
  Test                                Expected Result
  ----------------------------------- -----------------------------------
  Normal OTA                          Success

  Wi-Fi drops during download         Old firmware remains usable / retry
                                      possible

  MQTT disconnect                     Safe recovery

  HTTP timeout                        Failure recorded

  Invalid `.bin`                      Rejected

  Wrong hardware firmware             Rejected

  Hash mismatch                       Rejected

  Low battery                         OTA postponed

  Device reboots mid-download         Safe recovery

  Same version command                No unnecessary OTA

  Duplicate command                   No unsafe duplicate installation

  New firmware fails validation       Rollback

  Backend unavailable                 Device continues normal safe
                                      behavior

  Storage unavailable                 OTA fails safely

  1000 devices connect over time      System remains stable
  -----------------------------------------------------------------------

------------------------------------------------------------------------

## 29. Observability

Track metrics such as:

``` text
OTA success rate
OTA failure rate
Rollback rate
Average download duration
Average installation duration
Firmware distribution
Devices on outdated firmware
Failures by error code
Retries per deployment
Concurrent downloads
Bytes downloaded
```

Logs should include:

``` text
timestamp
device_id
deployment_id
firmware_version
event
error_code
```

Do not log secrets or device credentials.

------------------------------------------------------------------------

## 30. Example Production Deployment

Assume:

``` text
Fleet = 1,000 devices
Current = 1.4.2
New = 1.5.0
```

Recommended flow:

``` text
Developer
   |
   v
Build 1.5.0
   |
   v
Internal testing
   |
   v
Upload to OTA platform
   |
   v
Create deployment
   |
   v
5 development devices
   |
   v
Verify
   |
   v
20 field test devices
   |
   v
Verify
   |
   v
100 devices
   |
   v
Monitor
   |
   v
250 devices
   |
   v
Monitor
   |
   v
Remaining fleet
```

At any stage:

``` text
Unexpected failure rate
        |
        v
PAUSE DEPLOYMENT
```

Do not continue rollout until the issue is understood.

------------------------------------------------------------------------

## 31. Definition of Done for Version 1

OTA Platform v1 is complete when:

-   A developer can build firmware v1.1.0.
-   Admin can upload it from the dashboard.
-   Backend stores firmware and metadata correctly.
-   Admin can select a test device.
-   Device reports v1.0.0 through MQTT.
-   Backend determines that v1.1.0 is required.
-   Device receives a targeted MQTT OTA command.
-   Device downloads v1.1.0 over HTTPS.
-   Hash/image validation succeeds.
-   Device installs into the OTA partition.
-   Device reboots successfully.
-   Device reconnects to MQTT.
-   Device reports v1.1.0.
-   Dashboard shows `SUCCESS`.
-   Failed updates show an understandable error.
-   Existing firmware survives an interrupted/invalid update.
-   Deployment can be paused.
-   OTA history is retained.

------------------------------------------------------------------------

## 32. Initial Work Breakdown

### Device/Firmware

-   [ ] Audit flash/partition layout
-   [ ] Define firmware version constants
-   [ ] Implement OTA manager
-   [ ] Implement HTTPS download
-   [ ] Implement SHA-256/image verification
-   [ ] Implement MQTT OTA command parser
-   [ ] Implement OTA status publisher
-   [ ] Implement pre-checks
-   [ ] Implement retry behavior
-   [ ] Implement post-boot validation
-   [ ] Implement rollback
-   [ ] Test interrupted OTA

### Backend

-   [ ] Create OTA service repository
-   [ ] Configure PostgreSQL
-   [ ] Create database migrations
-   [ ] Connect MQTT consumer
-   [ ] Build device registry
-   [ ] Build firmware upload API
-   [ ] Integrate object storage
-   [ ] Build deployment service
-   [ ] Build device targeting
-   [ ] Build MQTT command publisher
-   [ ] Build OTA event processor
-   [ ] Implement retry/backoff
-   [ ] Implement concurrency control

### Dashboard

-   [ ] Login/authentication
-   [ ] Firmware list
-   [ ] Firmware upload
-   [ ] Device list
-   [ ] Device details
-   [ ] Create deployment
-   [ ] Deployment progress
-   [ ] Failure details
-   [ ] OTA history
-   [ ] Pause/resume/cancel controls

### Infrastructure

-   [ ] HTTPS domain
-   [ ] TLS configuration
-   [ ] Object storage
-   [ ] Database backups
-   [ ] Application logging
-   [ ] Monitoring
-   [ ] Secrets management
-   [ ] MQTT access control review

------------------------------------------------------------------------

## 33. Decisions to Freeze Before Coding

The team should explicitly decide and document:

1.  Backend: Node.js/TypeScript or FastAPI.
2.  Database hosting: existing PostgreSQL/Supabase or dedicated
    PostgreSQL.
3.  Firmware storage: R2, S3, Supabase Storage, or MinIO.
4.  Current ESP32 partition table.
5.  Maximum supported firmware size.
6.  Firmware versioning convention.
7.  Product and hardware version identifiers.
8.  MQTT topic naming convention.
9.  MQTT QoS/retained-message policy.
10. Device authentication mechanism.
11. OTA battery eligibility rule.
12. OTA retry/backoff policy.
13. Initial concurrency limit.
14. Rollback validation criteria.
15. Admin authentication model.

These should not remain implicit assumptions.

------------------------------------------------------------------------

## 34. Recommended First Milestone

Do **not** begin with the complete web dashboard.

The first engineering milestone should prove this exact path:

``` text
ESP32-C5 v1.0.0
      |
      | MQTT status
      v
Backend knows device version
      |
      | targeted MQTT command
      v
ESP32 receives OTA request
      |
      | HTTPS
      v
Download v1.0.1.bin
      |
      v
Verify
      |
      v
Install
      |
      v
Reboot
      |
      v
ESP32-C5 v1.0.1
      |
      | MQTT
      v
Backend receives SUCCESS
```

Once this works reliably on real hardware, build the deployment UI,
fleet rollout logic, and advanced management around it.

------------------------------------------------------------------------

## 35. Final Target

The finished platform should provide a controlled pipeline:

``` text
CODE
 |
 v
BUILD
 |
 v
TEST
 |
 v
UPLOAD
 |
 v
APPROVE
 |
 v
TARGET
 |
 v
DEPLOY
 |
 v
MQTT NOTIFICATION
 |
 v
HTTPS DOWNLOAD
 |
 v
VERIFY
 |
 v
INSTALL
 |
 v
REBOOT
 |
 v
VALIDATE
 |
 +------ failure ------> ROLLBACK
 |
 success
 |
 v
REPORT
 |
 v
MONITOR
```

The system should be designed around one rule:

> **A failed OTA must not turn a remotely deployed working device into
> an unrecoverable device.**

Scalability, dashboard features, and automation are important, but safe
recovery and controlled deployment come first.
