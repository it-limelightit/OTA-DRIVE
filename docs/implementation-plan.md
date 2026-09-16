# Delivery plan and quality gates

## Decisions fixed for the local MVP

| Area | Choice | Reason |
| --- | --- | --- |
| Backend | TypeScript + Fastify | Small, typed HTTP service that fits an eventual MQTT worker. |
| Database | PostgreSQL 16 | Transactional deployment state and append-only audit events. |
| Dashboard | React + Vite | Fast internal administration UI. |
| Development storage | MinIO (S3-compatible) | Local equivalent of Cloudflare R2/S3. |
| Device messages | MQTT + JSON | Commands/status only; firmware stays on HTTPS. |

## Today: foundation complete

1. Bring up local PostgreSQL, MinIO and Mosquitto with Docker Compose.
2. Run the versioned, idempotent database migration at API startup.
3. Start the typed API and dashboard together.
4. Verify health endpoint, dashboard device list and database persistence.

## Milestone sequence

1. **Device proof of concept (blocking gate):** confirm C5 flash size, partition CSV, application binary size, HTTPS OTA, SHA-256 validation, boot validation and rollback on physical hardware.
2. **Control-plane MVP:** device registration/status ingestion, firmware metadata + storage upload, selected-device deployments, MQTT command generation, OTA event ingestion.
3. **Dashboard MVP:** firmware upload/list, device search/detail/history, create deployment, progress and pause/cancel controls.
4. **Reliability:** retry backoff, idempotency, concurrency slots, error taxonomy, dead-letter/alert policy.
5. **Production readiness:** broker ACLs and per-device credentials, admin authentication/RBAC, signed firmware, short-lived URLs, backups, observability and load testing.

## Non-negotiable release gates

- A deployment cannot start unless firmware is `READY`, target devices match product/hardware, and `max_concurrency` is set.
- Firmware binary bytes never enter PostgreSQL or MQTT.
- The device validates target product, hardware, version, image, size and SHA-256 before changing boot partition.
- A newly booted partition is marked valid only after health checks and MQTT reconnection; failures roll back.
- Every state change creates an `ota_events` record.
- No fleet rollout occurs before staged tests (5, 20, 100, 25%, 50%, 100%) meet agreed success/failure thresholds.

## Open decisions before device work

- ESP-IDF/Arduino version, C5 partition CSV and available OTA-slot size.
- Device identity/credential model and broker ACL format.
- Battery eligibility threshold from measured voltage under Wi-Fi/flash load.
- Production object storage provider and region.
- Exact retry schedule, timeout values, initial active-download cap and rollback health criteria.
