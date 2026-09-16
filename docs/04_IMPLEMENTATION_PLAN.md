# OTA Platform Implementation Plan

## Important

This is a continuation project, not a greenfield rewrite.

Implementation begins with discovery.

# Step 1 — Inspect Existing Repository

Inspect as applicable:

```text
package.json
requirements.txt
pyproject.toml
docker-compose*
.env.example
src/
app/
pages/
server/
backend/
api/
db/
prisma/
migrations/
mqtt/
firmware/
ota/
```

Also inspect:

```text
git status
git log --oneline -n 10
```

Do not discard uncommitted user work.

# Step 2 — Build Current-State Map

Identify:

```text
Frontend
Backend
Database
ORM
Authentication
MQTT
Storage
OTA
Deployment
Tests
Docker
CI/CD
```

Create:

```text
docs/CURRENT_STATE.md
```

# Step 3 — Compare Current State to Target

Use:
- `00_PROJECT_CONTEXT.md`
- `01_ARCHITECTURE.md`
- `02_PHASES.md`
- `03_UI_UX_DESIGN.md`
- `05_DO_AND_DONT.md`

Classify:

```text
DONE
PARTIAL
MISSING
BROKEN
OUT_OF_SCOPE
```

# Step 4 — Protect Working Behavior

Before editing:
- run tests.
- run build.
- run lint.
- record existing failures.

Do not blame new changes for pre-existing failures.

# Step 5 — Implement Small Vertical Slices

Prefer:

```text
DB
-> backend service
-> API/MQTT
-> frontend
-> tests
```

for one feature at a time.

# Step 6 — Recommended Feature Order

## Feature A — Firmware Metadata
- firmware_versions
- upload
- hash
- version
- hardware compatibility
- storage

## Feature B — Device Firmware Tracking
- MQTT status
- current firmware
- last seen

## Feature C — Deployment Core
- deployment
- deployment_devices
- targeting
- status

## Feature D — OTA Command
- eligibility
- targeted MQTT command

## Feature E — Device OTA
- ESP32 lifecycle

## Feature F — Event Tracking
- OTA status ingestion/history

## Feature G — Dashboard
- expose working backend

## Feature H — Reliability
- retry
- concurrency
- pause
- rollback

# Step 7 — Database Rules

- migrations only.
- use foreign keys where appropriate.
- add indexes intentionally.
- use enums/check constraints where helpful.
- consistent timestamp strategy.
- do not store firmware binaries in DB.

# Step 8 — Backend Structure

Recommended:

```text
routes/controllers
services
repositories/data-access
mqtt
storage
validation
types/models
```

Keep business logic out of route handlers.

# Step 9 — MQTT Integration

Requirements:
- reconnect automatically.
- validate payloads.
- handle malformed messages safely.
- avoid backend crash on one bad message.
- structured logging.
- targeted publishing.
- duplicate-safe commands.

# Step 10 — Firmware Upload

Flow:

```text
Receive upload
-> validate
-> calculate SHA-256
-> upload object storage
-> save metadata transactionally
```

Handle partial failure safely.

# Step 11 — Deployment Eligibility

A device can receive OTA only if:

```text
deployment running
device targeted
hardware compatible
current version != target
retry policy allows
not completed
concurrency allows
```

# Step 12 — Frontend

Use real APIs.

Handle:
```text
loading
success
empty
failure
permission denied
```

# Step 13 — Testing

Unit tests:
- version comparison.
- eligibility.
- retry policy.
- state transitions.
- compatibility.
- payload validation.

Integration tests:
```text
status MQTT -> DB
deployment -> MQTT command
OTA status MQTT -> deployment update
firmware upload -> storage + DB
```

Physical ESP32 tests remain mandatory.

# Step 14 — Stable Error Codes

Examples:

```text
OTA_HTTP_TIMEOUT
OTA_TLS_ERROR
OTA_HASH_MISMATCH
OTA_INVALID_IMAGE
OTA_LOW_BATTERY
OTA_INCOMPATIBLE_HW
OTA_DOWNLOAD_INTERRUPTED
OTA_FLASH_WRITE_FAILED
OTA_POST_BOOT_FAILED
```

# Step 15 — Logging

Use structured logs.

Never log:
- secrets.
- passwords.
- private keys.
- full device tokens.

# Step 16 — Security

MVP:
```text
admin auth
device auth
MQTT auth
HTTPS
hash verification
authorization
```

Later:
```text
signed firmware
Secure Boot
Flash Encryption
short-lived URLs
RBAC
```

# Step 17 — Performance

Use:
- DB indexes.
- pagination.
- bounded queries.
- object storage.
- concurrency limits.

Avoid loading whole fleet into memory unnecessarily.

# Step 18 — Deployment Safety

Rollout:

```text
development devices
-> internal devices
-> small field group
-> controlled rollout
```

# Step 19 — Completion Checklist

Before saying "done":

- [ ] Feature implemented.
- [ ] Existing behavior preserved.
- [ ] Build passes.
- [ ] Lint passes.
- [ ] Relevant tests pass.
- [ ] Migration added if needed.
- [ ] Env vars documented.
- [ ] No secrets committed.
- [ ] Error handling present.
- [ ] UI states handled.
- [ ] Changed files summarized.
- [ ] Manual validation steps provided.

# Step 20 — Codex Final Response Format

```text
1. What I found
2. What I changed
3. Files changed
4. Database changes
5. Environment variables
6. Tests/build/lint results
7. Remaining risks
8. Manual verification
9. Recommended next step
```
