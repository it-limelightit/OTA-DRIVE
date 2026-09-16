# OTA Project — What To Do and What Not To Do

# DO

## Repository
- Inspect existing code before changes.
- Preserve working code.
- Respect current framework/patterns.
- Keep changes focused.
- Use existing component libraries.
- Use existing env patterns.
- Keep migrations safe.
- Maintain backward compatibility.

## OTA
- Use MQTT for command/status.
- Use HTTPS for firmware download.
- Validate firmware version.
- Validate hardware compatibility.
- Validate SHA-256.
- Use OTA partitions.
- Track deployment IDs.
- Make commands idempotent.
- Store OTA history.
- Use retries with backoff.
- Add concurrency limits.
- Design rollback before full rollout.

## Backend
- Keep business logic in services/domain layer.
- Validate external input.
- Handle malformed MQTT payloads.
- Use structured logs.
- Use transactions where consistency matters.
- Paginate.
- Index.
- Use object storage for binaries.

## Frontend
- Show impact before dangerous actions.
- Show specific failure reasons.
- Show loading/error/empty states.
- Keep tables filterable.
- Keep status language consistent.
- Reuse existing design system.
- Make pause visible.

## Security
- Use HTTPS.
- Authenticate MQTT clients.
- Authenticate admin users.
- Authenticate devices.
- Protect firmware storage.
- Keep secrets out of code.
- Plan signed firmware.

## Codex
- Read all project instruction Markdown files.
- Audit before coding.
- Show assumptions.
- Work phase-by-phase.
- Run build/tests/lint.
- Report existing failures separately.
- Document blockers.

# DO NOT

## Repository
- Do not rewrite the whole project.
- Do not delete working code because it differs from docs.
- Do not change framework without necessity.
- Do not change package manager casually.
- Do not mass-format unrelated files.
- Do not rename large trees unnecessarily.
- Do not erase user changes.
- Do not reset Git.
- Do not force-push.
- Do not delete migration history.

## OTA
- Do not send `.bin` through MQTT.
- Do not broadcast uncontrolled fleet OTA.
- Do not make all devices download at once.
- Do not mark success after download only.
- Do not mark success before new firmware boots healthy.
- Do not retry forever.
- Do not allow incompatible hardware firmware.
- Do not use permanently public production firmware URLs if avoidable.

## MQTT
- Do not put all logic in one callback.
- Do not crash backend on malformed payload.
- Do not assume QoS eliminates duplicates.
- Do not depend on unsafe retained OTA commands.
- Do not use only one global OTA command topic.

## Database
- Do not store `.bin` in PostgreSQL.
- Do not mutate schema outside migrations.
- Do not silently delete OTA history.
- Do not query entire fleet without pagination.

## Frontend
- Do not use fake production statistics.
- Do not create one-click Update All.
- Do not hide failures behind generic text.
- Do not rely only on color.
- Do not add a second UI framework.
- Do not redesign unrelated pages.

## Security
- Do not use `device_id` as the only credential.
- Do not log secrets.
- Do not commit `.env`.
- Do not commit private signing keys.
- Do not disable TLS verification.
- Do not accept arbitrary firmware URLs from untrusted clients.

## Code Quality
- Do not add dependencies for trivial functions.
- Do not duplicate services.
- Do not create giant files when modular structure exists.
- Do not swallow exceptions.
- Do not use unexplained magic constants.
- Do not leave debug endpoints enabled.
- Do not claim tests pass without running them.

# High-Risk Changes

Be conservative with:

```text
authentication
database migrations
MQTT topic changes
firmware compatibility logic
deployment targeting
rollback
production configuration
storage deletion
Git history
```

# Golden Rule

Prefer the simpler implementation that is easier to verify over a clever but fragile one.
