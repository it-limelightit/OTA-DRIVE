# OTA Platform Development Phases

## Rule

The project is already partially built.

Before starting any phase, classify each item:

```text
DONE
PARTIAL
NOT_STARTED
BROKEN
NEEDS_REFACTOR
```

Do not repeat completed work unnecessarily.

# Phase 0 — Repository Audit

## Goal
Understand the existing project before changing it.

## Tasks
- Inspect repository tree.
- Identify frontend framework.
- Identify backend framework.
- Identify database.
- Identify ORM/query layer.
- Identify authentication.
- Identify MQTT integration.
- Identify device model.
- Identify existing OTA code.
- Identify firmware upload logic.
- Identify storage integration.
- Identify deployment-related code.
- Identify environment variables.
- Identify Docker/infra files.
- Identify tests.
- Run lint/build/test.
- Record current failures.

## Deliverable

Create:

```text
docs/CURRENT_STATE.md
```

with:

```text
Working
Partial
Missing
Broken
Risks
Recommended next phase
```

# Phase 1 — Data Model & Core Domain

Must have:
- Device entity.
- Firmware entity.
- Deployment entity.
- Deployment-device relation.
- OTA event history.
- Migrations.
- Indexes.
- Status enums/constants.

Acceptance:

```text
Device A -> current v1.0.0
Firmware -> v1.1.0
Deployment -> targets Device A
```

# Phase 2 — Firmware Management

Must have:
- Upload API.
- Validation.
- Version field.
- Hardware compatibility.
- File size.
- SHA-256.
- Object storage.
- Firmware list API.
- Firmware details API.
- Release notes.
- Safe duplicate-version handling.

# Phase 3 — MQTT Device Registry Integration

Must have:
- MQTT backend client.
- Status subscriber.
- Payload validation.
- Device upsert/update.
- Firmware version update.
- Last seen.
- Error handling.

# Phase 4 — Deployment Engine

Must have:
- Create deployment.
- Select firmware.
- Select target device(s).
- Create deployment-device records.
- Deployment state.
- Start.
- Pause.
- Resume.
- Cancel.
- Basic concurrency field.
- Eligibility logic.

Acceptance:

```text
Should device IR000123 update?
If yes, to which version?
```

# Phase 5 — MQTT OTA Command

Must have:
- Command publisher.
- Per-device topic.
- Deployment ID.
- Version.
- URL.
- SHA-256.
- Size.
- Duplicate safety.

# Phase 6 — ESP32 OTA Implementation

Must have:
- Parse OTA command.
- Check compatibility.
- Check current version.
- Check battery policy.
- Download HTTPS.
- Write inactive OTA partition.
- Verify.
- Reboot.
- Report status.
- Safe interrupted-download handling.

Acceptance:

```text
v1.0.0
-> MQTT command
-> HTTPS download
-> install
-> reboot
-> report v1.0.1
```

# Phase 7 — OTA Event Tracking

Events:

```text
started
download_started
download_complete
verify_started
verify_failed
install_started
rebooting
success
failed
postponed
rollback
```

# Phase 8 — Dashboard MVP

Pages:
- Overview.
- Devices.
- Firmware.
- Firmware upload.
- Deployments.
- Deployment detail.
- Device detail.
- OTA history.

# Phase 9 — Retry & Failure Recovery

Must have:
- retry count.
- last attempt.
- next retry.
- backoff.
- max attempts.
- manual retry.
- reason codes.
- no infinite retry.

# Phase 10 — Rollback

Must have:
- post-boot validation.
- valid image confirmation.
- rollback on unhealthy build.
- rollback status reporting.

# Phase 11 — Staged Rollout

Support:

```text
Selected devices
Internal group
Small batch
Percentage
Whole compatible fleet
```

Suggested path:

```text
5
-> 20
-> 100
-> 25%
-> 50%
-> 100%
```

# Phase 12 — Security Hardening

Add:
- per-device credentials.
- signed firmware.
- short-lived URLs.
- RBAC.
- secrets management.
- audit logs.
- rate limiting.
- Secure Boot decision.
- Flash Encryption decision.

# Phase 13 — Load Testing

Test:

```text
10
50
100
500
1000+
```

Observe:
- broker.
- backend.
- database.
- storage.
- concurrency.
- event processing.

# Phase 14 — CI/CD

Later:

```text
Git tag
-> build
-> test
-> hash
-> sign
-> upload as DRAFT
-> manual approval
-> deploy
```

## Codex Execution Rule

Codex should implement only the next incomplete logical phase unless explicitly instructed otherwise.

After each phase:
1. run tests.
2. run lint.
3. run build.
4. summarize changed files.
5. summarize DB changes.
6. summarize env changes.
7. list manual validation steps.
8. stop before unrelated work.
