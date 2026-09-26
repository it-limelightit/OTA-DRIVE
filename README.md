# Limelight OTA Platform

MVP foundation for safely managing ESP32-C5 firmware deployments.

## Local start

1. Copy `.env.example` to `.env` and replace the development-only secrets.
2. Start infrastructure: `docker compose up -d postgres minio`.
3. Install application packages: `npm.cmd install`.
4. Start both applications: `npm.cmd run dev`.

Dashboard: `http://localhost:5173`  
API health check: `http://localhost:3000/health`

On the first API start, an administrator is created from `ADMIN_EMAIL` and `ADMIN_PASSWORD` in `.env`. The dashboard requires this login. Change both bootstrap credentials and `JWT_SECRET` before any non-local deployment.

The API runs SQL migrations automatically at startup and creates the local MinIO `firmware` bucket on the first upload. For Cloudflare R2, create the bucket first and set `S3_ENDPOINT` to `https://<account-id>.r2.cloudflarestorage.com`, `S3_ACCESS_KEY` and `S3_SECRET_KEY` to an R2 API token's access keys, `S3_REGION=auto`, and `S3_FORCE_PATH_STYLE=false`. Set `S3_CREATE_BUCKET=false` for R2.

Alternatively, start the complete containerized stack (including backend and dashboard) with `docker compose up --build`. The dashboard is available at `http://localhost:5173`.

## Initial safety boundary

This scaffold stores firmware metadata and device/deployment state, but it deliberately does **not** issue firmware downloads or MQTT OTA commands yet. Those actions must be enabled only after the real ESP32-C5 partition, rollback, authentication, and HTTPS download proof of concept are verified.

See [docs/implementation-plan.md](docs/implementation-plan.md) for the execution plan and release gates.

## Implemented API foundation

- `GET /health` — API and database readiness check.
- `GET /api/overview` — dashboard counters.
- `GET, POST /api/devices` — device registry; a future MQTT consumer will call the same service layer.
- `GET, POST /api/firmware` — firmware metadata registration. Binary upload to object storage is the next protected endpoint.
- `GET, POST /api/deployments` — deployment listing and safe selected-device assignment. Creation requires `READY` firmware and compatible devices.
