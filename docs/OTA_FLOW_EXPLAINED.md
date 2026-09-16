# OTA Platform Flow Explained

## The simple model

There are two different communication paths. They have different jobs:

```text
MQTT  = small control and status messages
HTTPS = the actual firmware `.bin` download
```

The firmware binary must not travel through MQTT. MQTT tells a selected device that an update is available; the device then downloads the binary over HTTPS from Cloudflare R2 (or MinIO during local development).

## Components

```text
Admin dashboard
    | HTTPS API requests
    v
Fastify backend  <---- PostgreSQL (devices, firmware metadata, deployments, events)
    | MQTT client connection
    v
MQTT broker  <---- MQTT client connection ---- ESP32-C5 device

ESP32-C5 device ---- HTTPS firmware download ---- Cloudflare R2 bucket
```

## Current project flow

Today, the project supports this part of the journey:

```text
1. Admin signs in to the React dashboard.
2. Dashboard calls the Fastify API over HTTPS.
3. Admin registers a device; device metadata is stored in PostgreSQL.
4. Admin selects a `.bin` file and enters product, hardware version, and release version.
5. The backend calculates the SHA-256 hash itself.
6. The backend uploads the `.bin` to the configured R2 bucket.
7. The backend stores only metadata and the R2 object key in PostgreSQL.
8. The firmware remains DRAFT until an admin marks it READY.
```

The backend now has the first MQTT foundation: it connects using `MQTT_URL`, subscribes to `devices/+/status` and `devices/+/ota/status`, validates JSON payloads, deduplicates messages when a `message_id` is supplied, and updates device/deployment runtime state. OTA command scheduling and secure firmware URL generation are still not implemented.

## Intended full OTA flow

```text
1. ESP32 wakes and connects to Wi-Fi.
2. ESP32 connects to the MQTT broker using its device credentials.
3. ESP32 publishes its status, including its device ID, hardware, and current firmware version.
4. Backend receives the status from MQTT and updates PostgreSQL.
5. Backend checks whether the device has an eligible, running deployment.
6. Backend publishes one targeted OTA command to that device's MQTT command topic.
7. ESP32 validates the command: device identity, hardware, version, battery policy, URL, file size, and SHA-256.
8. ESP32 downloads the firmware binary over HTTPS from R2.
9. ESP32 verifies and writes the image to its inactive OTA partition.
10. ESP32 reports progress and reboots.
11. The new firmware performs its health check and reconnects to MQTT.
12. ESP32 reports its expected new version and healthy status.
13. Backend records SUCCESS only after that post-boot confirmation.
```

If a download, verification, install, or post-boot health check fails, the device reports a stable error code. It must retain or roll back to a working image when the ESP32 OTA partition mechanism supports it.

## How HTTP is used

### Admin dashboard to backend

The React dashboard calls the Fastify backend using HTTP/HTTPS:

```text
Dashboard -> POST /api/auth/login -> Backend
Dashboard -> POST /api/firmware/upload -> Backend
Dashboard -> GET  /api/devices -> Backend
Dashboard -> POST /api/deployments -> Backend
```

The dashboard sends the administrator JWT in the `Authorization: Bearer <token>` header after login.

### ESP32 to firmware storage

The ESP32 does not download the binary from the dashboard or MQTT broker. It uses an HTTPS URL to retrieve an object from R2:

```text
ESP32 -> HTTPS GET firmware URL -> Cloudflare R2 -> `.bin` response
```

For production, that URL should be short-lived and authorized for the specific deployment/device. Public permanent firmware links are not the target design.

## How MQTT is used

The MQTT broker is a message relay. The backend and each ESP32 are MQTT clients; they independently connect to the broker. The backend does not need a direct TCP connection to each device.

Recommended topic layout:

```text
devices/{device_id}/status       Device -> backend
devices/{device_id}/command      Backend -> device
devices/{device_id}/ota/status   Device -> backend
```

Example status message from a device:

```json
{
  "device_id": "IR000123",
  "product": "SMART_IR",
  "hw": "HW2",
  "fw": "1.4.2",
  "battery_mv": 3710
}
```

Example targeted OTA command from the backend:

```json
{
  "command": "ota",
  "deployment_id": "DEP_1007",
  "version": "1.5.0",
  "url": "https://firmware.example.com/temporary-authorized-url",
  "size": 1378544,
  "sha256": "<64-character-sha256>"
}
```

Example OTA status response from the ESP32:

```json
{
  "deployment_id": "DEP_1007",
  "status": "success",
  "current_version": "1.5.0"
}
```

## How the backend connects to MQTT

The backend will use an MQTT library as a client. At startup it will:

```text
1. Read MQTT broker URL and credentials from environment variables.
2. Open a persistent MQTT connection to the broker.
3. Subscribe to device status topics and OTA status topics.
4. Validate every incoming JSON payload.
5. Deduplicate messages with a supplied `message_id`.
6. Update PostgreSQL runtime state.
7. Reconnect with bounded backoff after broker/network failures.
8. Publish OTA commands only to a specific eligible device topic after the deployment worker is implemented.
```

Illustrative pseudocode:

```ts
const client = mqtt.connect(process.env.MQTT_URL, {
  username: process.env.MQTT_USERNAME,
  password: process.env.MQTT_PASSWORD,
  reconnectPeriod: 5_000
});

client.subscribe('devices/+/status', { qos: 1 });
client.subscribe('devices/+/ota/status', { qos: 1 });

client.on('message', async (topic, payload) => {
  // Parse and validate JSON, then update PostgreSQL safely.
});

client.publish(`devices/${deviceId}/command`, commandJson, { qos: 1 });
```

QoS 1 means a message can be delivered more than once. Therefore OTA commands and status processing must be idempotent: the deployment ID lets both backend and device recognise an already handled command.

## Security before enabling production MQTT

The local Mosquitto configuration currently allows anonymous connections to make local development simple. This must not be used in production.

Production MQTT needs:

- A unique credential or client certificate for every device.
- Broker ACLs: a device can publish and subscribe only to its own topics.
- Separate backend service credentials with controlled subscribe/publish access.
- TLS (`mqtts://`) instead of plaintext `mqtt://`.
- Backend payload validation; never trust a supplied `device_id` alone.
- No retained OTA command that could unexpectedly run when a sleeping device reconnects.

## Next implementation order

1. Define device credential format and broker ACL policy.
2. Add the backend MQTT client and validated device-status ingestion.
3. Add deployment lifecycle/eligibility checks.
4. Add targeted MQTT OTA command publishing.
5. Add OTA status ingestion and post-boot success validation.
6. Validate the ESP32 HTTPS OTA and rollback behavior on physical hardware.
