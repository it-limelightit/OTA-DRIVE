# Master Prompt for Codex CLI

Copy this prompt into Codex CLI from the root of the existing OTA project.

---

You are working inside an existing, partially completed OTA platform project for a fleet of ESP32-C5 Smart IR devices.

This is NOT a greenfield project.

Your first responsibility is to understand the existing repository and preserve working functionality.

## Documentation

Read all of these files completely before modifying code:

```text
00_PROJECT_CONTEXT.md
01_ARCHITECTURE.md
02_PHASES.md
03_UI_UX_DESIGN.md
04_IMPLEMENTATION_PLAN.md
05_DO_AND_DONT.md
06_CODEX_WORKING_RULES.md
```

If they are inside `docs/`, read them there.

## Step 1 — Audit First

Before changing anything:

1. Inspect the complete repository structure.
2. Inspect `git status`.
3. Identify frontend framework/version.
4. Identify backend framework/version.
5. Identify database and ORM/query layer.
6. Identify authentication.
7. Identify current MQTT implementation, topics, QoS and reconnect handling.
8. Identify existing device model/schema.
9. Identify existing firmware/OTA code.
10. Identify firmware upload/storage implementation.
11. Identify deployment-related code.
12. Identify environment variable structure.
13. Identify Docker/infrastructure files.
14. Identify tests.
15. Run existing lint, typecheck, test and build commands that are available.

Do not discard, reset, overwrite or mass-refactor existing user work.

## Step 2 — Create Current-State Report

Create or update:

```text
docs/CURRENT_STATE.md
```

Classify features into:

```text
DONE
PARTIAL
MISSING
BROKEN
NEEDS_REFACTOR
```

Cover at minimum:
- Device registry
- Firmware management
- Object storage
- MQTT status ingestion
- Deployment model
- Deployment targeting
- OTA command publishing
- OTA event/status tracking
- Retry logic
- Concurrency control
- Rollback
- Dashboard
- Authentication
- Security
- Tests
- Infrastructure

Record existing build/test failures before changes.

## Step 3 — Determine Next Logical Incomplete Phase

Use `02_PHASES.md`.

Do not automatically implement every phase.

Choose the earliest incomplete phase required for a working vertical slice.

If a few adjacent small tasks are required to make that phase actually work end-to-end, complete them together.

## Step 4 — Non-Negotiable Architecture Rules

```text
MQTT = OTA command/status
HTTPS = firmware binary download
PostgreSQL = metadata/state/history
Object storage = .bin files
```

Do NOT send firmware binaries through MQTT.

Do NOT create uncontrolled fleet-wide OTA broadcast.

Do NOT rewrite working architecture only to match a preferred framework.

Do NOT introduce a second frontend component library.

Do NOT store firmware binaries in PostgreSQL.

Do NOT use device_id alone as production authentication.

Do NOT mark OTA success before the new firmware boots and reports expected version/healthy state.

Do NOT implement infinite retries.

Do NOT remove compatibility with deployed ESP32 firmware without a migration strategy.

## Step 5 — Code Quality

Follow existing project conventions.

Prefer:

```text
controller/route
-> service
-> repository/integration
```

Validate external inputs.

Use structured error handling.

Use stable OTA reason/error codes.

Avoid giant files, duplicate services and unrelated refactoring.

## Step 6 — UI/UX

If frontend work is needed, follow `03_UI_UX_DESIGN.md`.

This is an operational engineering dashboard.

Dangerous actions such as:

```text
start deployment
deploy to all
cancel deployment
retry large batch
archive firmware
```

must show impact and require confirmation.

Failures must show actionable reason codes.

Reuse the existing design system.

## Step 7 — OTA Safety

Target lifecycle:

```text
device reports version
-> backend checks deployment eligibility
-> targeted MQTT OTA command
-> device pre-check
-> HTTPS firmware download
-> firmware verification
-> install to OTA partition
-> reboot
-> post-boot validation
-> report success
```

On failure, existing working firmware must remain recoverable whenever the ESP32 OTA mechanism allows it.

## Step 8 — Scale

Target is 1,000+ devices.

Use:
- pagination
- database indexes
- targeted MQTT
- object storage
- bounded concurrency
- staged rollout
- retry backoff

Do not load entire fleet into memory unnecessarily.

Do not over-engineer distributed infrastructure before it is needed.

## Step 9 — Verification

After implementation:

1. Run relevant lint.
2. Run typecheck.
3. Run unit tests.
4. Run integration tests if present.
5. Run production build.
6. Verify migrations.
7. Verify no secrets are committed.
8. Verify no unrelated files were changed.

If a failure existed before your changes, clearly distinguish it from new failures.

## Step 10 — Final Report

Return exactly:

```text
## Current State Found

## Phase Implemented

## What Changed

## Files Changed

## Database/Migrations

## New Environment Variables

## Validation Performed

## Existing Failures

## Remaining Risks

## Manual Verification Steps

## Recommended Next Phase
```

Do not claim hardware-level ESP32 validation unless it was actually performed.

Do not claim production readiness until rollback, security, failure handling and staged rollout are validated.

Begin by auditing the repository now. Do not start with a rewrite.
