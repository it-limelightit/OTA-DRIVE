# Limelight OTA Platform — Project Context

## Purpose

This repository is an in-house OTA platform for a fleet of ESP32-C5 Smart IR devices.

The project is already partially implemented. Any AI coding agent, developer, or Codex CLI session MUST treat the existing repository as the source of truth for what is already working.

The objective is to complete the project without unnecessarily rewriting stable components.

## Product Goal

Build a production-ready private OTA platform capable of managing firmware updates for 1,000+ ESP32 devices.

The system must support:
- Existing MQTT-based device communication.
- HTTPS firmware download.
- Firmware version management.
- Device-specific and group-specific deployments.
- Staged rollout.
- OTA progress tracking.
- Retry and failure handling.
- Safe rollback.
- Admin dashboard.
- Firmware history.
- Device OTA history.
- Auditability.
- Secure firmware distribution.

## Important Existing Constraints

The device fleet consists primarily of battery-powered ESP32-C5 Smart IR devices.

Typical device behavior:

```text
Wake
-> Connect Wi-Fi
-> Connect MQTT
-> Publish telemetry/status
-> Receive configuration/commands
-> Perform required work
-> Sleep
```

OTA must fit into this lifecycle.

Do NOT redesign the entire device communication architecture unless there is a proven technical reason.

## Core OTA Principle

```text
MQTT  = control + notification + OTA status
HTTPS = actual firmware binary download
```

Do NOT send `.bin` firmware files through MQTT.

## Expected Production Scale

Initial target:

```text
1,000+ devices
```

Design for safe scaling beyond this, but do not over-engineer the MVP.

## Existing Project Rule

Before changing code:
1. Inspect the repository.
2. Identify what is already implemented.
3. Identify working functionality.
4. Identify incomplete functionality.
5. Identify duplicated/dead code.
6. Identify framework versions/dependencies.
7. Identify database schema/migrations.
8. Identify MQTT topics.
9. Identify API routes.
10. Identify frontend structure.
11. Identify authentication.
12. Identify firmware upload/storage logic.

If the current project contains a better implementation that satisfies these requirements, preserve it.

## Technology Direction

Preferred architecture:

```text
ESP32-C5
   |
   +---- MQTT ----> MQTT Broker
   |
   +---- HTTPS ---> Firmware Object Storage

MQTT Broker
   |
   v
OTA Backend
   |
   +---- PostgreSQL
   |
   +---- Object Storage
   |
   +---- Admin Web Dashboard
```

Possible backend stacks:
- Node.js + TypeScript
- Fastify
- NestJS
- Express if already present and structured properly
- Python + FastAPI

Do NOT migrate frameworks just because another stack is preferred.

## Database Direction

Preferred:
```text
PostgreSQL
```

Supabase PostgreSQL is acceptable.

Firmware binary files should NOT be stored directly in PostgreSQL.

## OTA Safety Goal

Primary rule:

> A failed OTA must not convert a working deployed device into an unrecoverable device.

Therefore the system must eventually support:
- OTA partitions.
- Firmware verification.
- SHA-256 validation.
- Safe reboot.
- Post-boot health validation.
- Rollback.
- Retry control.
- Deployment pause.

## Coding Agent Priority Order

1. Correctness.
2. Device safety.
3. Backward compatibility.
4. Security.
5. Reliability.
6. Observability.
7. Maintainability.
8. UI polish.
9. Performance optimization.
10. Advanced features.

## Definition of Project Completion

The core flow must work:

```text
Upload firmware
-> Create deployment
-> Device reports current version
-> Backend determines update eligibility
-> MQTT OTA command sent
-> Device downloads over HTTPS
-> Firmware verifies
-> Device installs
-> Device reboots
-> New firmware reports healthy
-> Backend records success
```

Failure paths must also be safe and observable.
