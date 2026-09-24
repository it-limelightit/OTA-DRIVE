import dotenv from 'dotenv';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import multipart from '@fastify/multipart';
import bcrypt from 'bcryptjs';
import pg from 'pg';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { deleteFirmware, putFirmware } from './services/storage/storage.service.js';
import { startMqtt } from './services/mqtt/mqtt.service.js';
import { startDeploymentWorker } from './workers/deployment.worker.js';

const here = fileURLToPath(new URL('.', import.meta.url));
dotenv.config({ path: join(here, '../../.env') });
const app = Fastify({ logger: true });
const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
db.on('error', (error) => app.log.error(error, 'PostgreSQL pool connection error'));
let mqttClient: ReturnType<typeof startMqtt>;
// Works from both `backend/src` (tsx development) and `backend/dist` (production build).
const migrationsDir = join(here, '../../database/migrations');

async function migrate() {
  await db.query('CREATE TABLE IF NOT EXISTS schema_migrations (filename text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
  for (const filename of (await readdir(migrationsDir)).filter((entry) => entry.endsWith('.sql')).sort()) {
    if ((await db.query('SELECT 1 FROM schema_migrations WHERE filename = $1', [filename])).rowCount) continue;
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      await client.query(await readFile(join(migrationsDir, filename), 'utf8'));
      await client.query('INSERT INTO schema_migrations(filename) VALUES ($1)', [filename]);
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  }
}

async function ensureInitialAdmin() {
  const { rows } = await db.query('SELECT COUNT(*)::int AS count FROM admin_users');
  if (rows[0].count > 0) return;
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password || password.length < 12) throw new Error('Set ADMIN_EMAIL and an ADMIN_PASSWORD of at least 12 characters in .env before first startup.');
  await db.query('INSERT INTO admin_users(email, password_hash, role) VALUES ($1,$2,\'ADMIN\')', [email.toLowerCase(), await bcrypt.hash(password, 12)]);
  app.log.warn({ email }, 'Initial administrator account created. Change the bootstrap password after first login.');
}

const deviceSchema = z.object({ deviceUid: z.string().trim().min(3), product: z.string().trim().min(1), hardwareVersion: z.string().trim().min(1), currentFirmware: z.string().trim().min(1).optional() });
const firmwareSchema = z.object({ product: z.string().trim().min(1), hardwareVersion: z.string().trim().min(1), version: z.string().trim().regex(/^\d+\.\d+\.\d+$/, 'Use MAJOR.MINOR.PATCH'), fileKey: z.string().min(1), fileSize: z.number().int().positive(), sha256: z.string().regex(/^[a-f0-9]{64}$/, 'Must be a lowercase SHA-256 hash'), releaseNotes: z.string().max(10_000).default(''), createdBy: z.string().min(1).default('local-admin') });
const firmwareUploadSchema = z.object({ product: z.string().trim().min(1).max(80), hardwareVersion: z.string().trim().min(1).max(80), version: z.string().trim().regex(/^\d+\.\d+\.\d+$/, 'Use MAJOR.MINOR.PATCH'), releaseNotes: z.string().max(10_000).default('') });
const deploymentSchema = z.object({ name: z.string().min(3).max(120), firmwareId: z.string().uuid(), deviceIds: z.array(z.string().uuid()).min(1).max(1000), maxConcurrency: z.number().int().min(1).max(100).default(10), createdBy: z.string().min(1).default('local-admin') });
const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });
const firmwareStatusSchema = z.object({ status: z.enum(['READY', 'ARCHIVED']) });

await app.register(cors, { origin: process.env.CORS_ORIGIN ?? 'http://localhost:5173' });
await app.register(multipart, { limits: { files: 1, fileSize: Number(process.env.FIRMWARE_MAX_UPLOAD_BYTES ?? 16 * 1024 * 1024) } });
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) throw new Error('Set JWT_SECRET to a random value of at least 32 characters in .env.');
await app.register(jwt, { secret: process.env.JWT_SECRET });
app.get('/health', async () => {
  await db.query('SELECT 1');
  return {
    status: 'ok',
    mqtt: {
      configured: Boolean(process.env.MQTT_URL),
      connected: Boolean(mqttClient?.connected)
    }
  };
});

app.post('/api/auth/login', async (request, reply) => {
  const parsed = loginSchema.safeParse(request.body);
  if (!parsed.success) return reply.code(400).send({ error: 'Email and password are required.' });
  const { rows } = await db.query('SELECT id, email, password_hash, role FROM admin_users WHERE email=$1 AND is_active=true', [parsed.data.email.toLowerCase()]);
  const user = rows[0];
  if (!user || !(await bcrypt.compare(parsed.data.password, user.password_hash))) return reply.code(401).send({ error: 'Invalid email or password.' });
  await db.query('UPDATE admin_users SET last_login_at=now(), updated_at=now() WHERE id=$1', [user.id]);
  const token = await reply.jwtSign({ sub: user.id, email: user.email, role: user.role }, { expiresIn: '8h' });
  return { token, user: { email: user.email, role: user.role } };
});

app.addHook('preHandler', async (request, reply) => {
  if (!request.url.startsWith('/api/') || request.url === '/api/auth/login') return;
  try { await request.jwtVerify(); } catch { return reply.code(401).send({ error: 'Authentication required.' }); }
});

app.get('/api/overview', async () => {
  const { rows } = await db.query(`SELECT (SELECT COUNT(*)::int FROM devices) AS "deviceCount", (SELECT COUNT(*)::int FROM deployments WHERE status='RUNNING') AS "activeDeployments", (SELECT COUNT(*)::int FROM devices WHERE last_seen > now() - interval '24 hours') AS "recentDevices", (SELECT COUNT(*)::int FROM deployment_devices WHERE status='FAILED') AS "failedUpdates"`);
  return rows[0];
});

app.get('/api/devices', async () => {
  const { rows } = await db.query(`SELECT d.id, d.device_uid AS "deviceUid", d.product, d.hardware_version AS "hardwareVersion", d.current_firmware AS "currentFirmware", d.target_firmware AS "targetFirmware", d.last_seen AS "lastSeen", d.ota_status AS "otaStatus", d.health_fault_active AS "faultActive", d.health_faults AS "faults", d.health_fault_updated_at AS "faultUpdatedAt", latest.status AS "deploymentStatus", latest.name AS "deploymentName", latest.command_sent_at AS "deploymentStartedAt", latest.finished_at AS "deploymentFinishedAt", CASE WHEN latest.command_sent_at IS NOT NULL THEN EXTRACT(EPOCH FROM (COALESCE(latest.finished_at, now()) - latest.command_sent_at))::int END AS "deploymentElapsedSeconds" FROM devices d LEFT JOIN LATERAL (SELECT dd.status, dd.command_sent_at, dd.finished_at, deployment.name FROM deployment_devices dd JOIN deployments deployment ON deployment.id=dd.deployment_id WHERE dd.device_id=d.id ORDER BY dd.command_sent_at DESC NULLS LAST, deployment.created_at DESC LIMIT 1) latest ON true ORDER BY d.last_seen DESC NULLS LAST LIMIT 100`);
  return rows;
});

app.post('/api/devices', async (request, reply) => {
  const parsed = deviceSchema.safeParse(request.body);
  if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
  const input = parsed.data;
  const { rows } = await db.query(`INSERT INTO devices(device_uid, product, hardware_version, current_firmware, last_seen) VALUES ($1,$2,$3,$4,now()) ON CONFLICT(device_uid) DO UPDATE SET product=EXCLUDED.product, hardware_version=EXCLUDED.hardware_version, current_firmware=COALESCE(EXCLUDED.current_firmware, devices.current_firmware), last_seen=now(), updated_at=now() RETURNING id, device_uid AS "deviceUid"`, [input.deviceUid, input.product, input.hardwareVersion, input.currentFirmware ?? null]);
  return reply.code(201).send(rows[0]);
});

app.delete('/api/devices/:id', async (request, reply) => {
  const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
  if (!params.success) return reply.code(400).send({ error: 'A valid device ID is required.' });
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const device = await client.query('SELECT device_uid FROM devices WHERE id=$1 FOR UPDATE', [params.data.id]);
    if (!device.rowCount) { await client.query('ROLLBACK'); return reply.code(404).send({ error: 'Device not found.' }); }
    const affectedDeployments = await client.query('SELECT DISTINCT deployment_id FROM deployment_devices WHERE device_id=$1', [params.data.id]);
    await client.query('DELETE FROM ota_events WHERE device_id=$1', [params.data.id]);
    await client.query('DELETE FROM deployment_devices WHERE device_id=$1', [params.data.id]);
    if (affectedDeployments.rowCount) await client.query(`UPDATE deployments d SET status='CANCELLED', completed_at=now() WHERE d.id = ANY($1::uuid[]) AND d.status IN ('READY','RUNNING','PAUSED') AND NOT EXISTS (SELECT 1 FROM deployment_devices dd WHERE dd.deployment_id=d.id)`, [affectedDeployments.rows.map((row) => row.deployment_id)]);
    await client.query('DELETE FROM devices WHERE id=$1', [params.data.id]);
    await client.query('COMMIT');
    return { deleted: true, deviceUid: device.rows[0].device_uid };
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
});

app.get('/api/firmware', async () => {
  const { rows } = await db.query(`SELECT id, product, hardware_version AS "hardwareVersion", version, file_size AS "fileSize", sha256, release_notes AS "releaseNotes", status, created_at AS "createdAt" FROM firmware_versions ORDER BY created_at DESC`);
  return rows;
});

app.post('/api/firmware', async (request, reply) => {
  const parsed = firmwareSchema.safeParse(request.body);
  if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
  const f = parsed.data;
  try {
    const { rows } = await db.query(`INSERT INTO firmware_versions(product, hardware_version, version, file_key, file_size, sha256, release_notes, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id, status`, [f.product, f.hardwareVersion, f.version, f.fileKey, f.fileSize, f.sha256, f.releaseNotes, f.createdBy]);
    return reply.code(201).send(rows[0]);
  } catch (error: unknown) {
    if ((error as { code?: string }).code === '23505') return reply.code(409).send({ error: 'Firmware version or storage key already exists.' });
    throw error;
  }
});

app.post('/api/firmware/upload', async (request, reply) => {
  const upload = await request.file();
  if (!upload) return reply.code(400).send({ error: 'A firmware .bin file is required.' });
  if (!upload.filename.toLowerCase().endsWith('.bin')) return reply.code(400).send({ error: 'Firmware must be a .bin file.' });
  // Multipart fields can arrive after the file part. Consume the stream first so
  // Fastify has populated upload.fields before validating the metadata.
  const binary = await upload.toBuffer();
  if (!binary.length) return reply.code(400).send({ error: 'Firmware file is empty.' });
  if (upload.file.truncated) return reply.code(413).send({ error: 'Firmware file exceeds FIRMWARE_MAX_UPLOAD_BYTES.' });
  const fieldValue = (name: string) => { const field = upload.fields[name]; return field && !Array.isArray(field) && field.type === 'field' ? field.value : undefined; };
  const parsed = firmwareUploadSchema.safeParse({ product: fieldValue('product'), hardwareVersion: fieldValue('hardwareVersion'), version: fieldValue('version'), releaseNotes: fieldValue('releaseNotes') ?? '' });
  if (!parsed.success) return reply.code(400).send({ error: 'Enter a product, hardware revision, and a version in MAJOR.MINOR.PATCH format.' });
  const input = parsed.data;
  const duplicate = await db.query('SELECT 1 FROM firmware_versions WHERE product=$1 AND hardware_version=$2 AND version=$3', [input.product, input.hardwareVersion, input.version]);
  if (duplicate.rowCount) return reply.code(409).send({ error: 'A firmware version already exists for this product and hardware version.' });
  const sha256 = createHash('sha256').update(binary).digest('hex');
  const safePart = (value: string) => value.replace(/[^A-Za-z0-9._-]/g, '_');
  const fileKey = `firmware/${safePart(input.product)}/${safePart(input.hardwareVersion)}/${input.version}/${sha256}.bin`;
  try { await putFirmware(fileKey, binary, sha256); }
  catch (error) { request.log.error(error, 'Firmware storage upload failed'); return reply.code(503).send({ error: 'Firmware object storage is unavailable.' }); }
  try {
    const { rows } = await db.query(`INSERT INTO firmware_versions(product, hardware_version, version, file_key, file_size, sha256, release_notes, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id, status, version, file_size AS "fileSize", sha256`, [input.product, input.hardwareVersion, input.version, fileKey, binary.length, sha256, input.releaseNotes, (request.user as { email?: string }).email ?? 'local-admin']);
    return reply.code(201).send(rows[0]);
  } catch (error: unknown) {
    await deleteFirmware(fileKey).catch((cleanupError) => request.log.error(cleanupError, 'Failed to remove orphaned firmware object'));
    if ((error as { code?: string }).code === '23505') return reply.code(409).send({ error: 'Firmware version or storage key already exists.' });
    throw error;
  }
});

app.patch('/api/firmware/:id/status', async (request, reply) => {
  const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
  const parsed = firmwareStatusSchema.safeParse(request.body);
  if (!params.success || !parsed.success) return reply.code(400).send({ error: 'A firmware ID and a valid status are required.' });
  const { rows } = await db.query('UPDATE firmware_versions SET status=$1 WHERE id=$2 RETURNING id, status', [parsed.data.status, params.data.id]);
  if (!rows[0]) return reply.code(404).send({ error: 'Firmware not found.' });
  return rows[0];
});

app.delete('/api/firmware/:id', async (request, reply) => {
  const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
  if (!params.success) return reply.code(400).send({ error: 'A valid firmware ID is required.' });
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const firmware = await client.query('SELECT file_key FROM firmware_versions WHERE id=$1 FOR UPDATE', [params.data.id]);
    if (!firmware.rowCount) { await client.query('ROLLBACK'); return reply.code(404).send({ error: 'Firmware not found.' }); }
    const usage = await client.query('SELECT 1 FROM deployments WHERE firmware_id=$1 LIMIT 1', [params.data.id]);
    if (usage.rowCount) { await client.query('ROLLBACK'); return reply.code(409).send({ error: 'Delete deployments using this firmware before deleting the firmware artifact.' }); }
    try { await deleteFirmware(firmware.rows[0].file_key); }
    catch (error) { request.log.error(error, 'Firmware storage deletion failed'); await client.query('ROLLBACK'); return reply.code(503).send({ error: 'Firmware object storage is unavailable; the artifact was not deleted.' }); }
    await client.query('DELETE FROM firmware_versions WHERE id=$1', [params.data.id]);
    await client.query('COMMIT');
    return { deleted: true };
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
});

app.get('/api/deployments', async () => {
  const { rows } = await db.query(`SELECT d.id, d.name, d.status, d.max_concurrency AS "maxConcurrency", f.version AS "firmwareVersion", COUNT(dd.id)::int AS "targetCount", COUNT(dd.id) FILTER (WHERE dd.status='SUCCESS')::int AS "successCount", COUNT(dd.id) FILTER (WHERE dd.status='FAILED')::int AS "failedCount", COUNT(dd.id) FILTER (WHERE dd.status = ANY(ARRAY['STARTED','DOWNLOADING','INSTALLING','REBOOTING']::ota_status[]))::int AS "activeCount", MAX(dd.last_progress_at) AS "lastProgressAt" FROM deployments d JOIN firmware_versions f ON f.id=d.firmware_id LEFT JOIN deployment_devices dd ON dd.deployment_id=d.id GROUP BY d.id,f.version ORDER BY d.created_at DESC`);
  return rows;
});

app.delete('/api/deployments/:id', async (request, reply) => {
  const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
  if (!params.success) return reply.code(400).send({ error: 'A valid deployment ID is required.' });
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const deployment = await client.query('SELECT status FROM deployments WHERE id=$1 FOR UPDATE', [params.data.id]);
    if (!deployment.rowCount) { await client.query('ROLLBACK'); return reply.code(404).send({ error: 'Deployment not found.' }); }
    if (deployment.rows[0].status === 'RUNNING') { await client.query('ROLLBACK'); return reply.code(409).send({ error: 'A running deployment cannot be deleted. Remove or cancel its target devices first.' }); }
    await client.query('DELETE FROM ota_events WHERE deployment_id=$1', [params.data.id]);
    await client.query('DELETE FROM deployment_devices WHERE deployment_id=$1', [params.data.id]);
    await client.query('DELETE FROM deployments WHERE id=$1', [params.data.id]);
    await client.query('COMMIT');
    return { deleted: true };
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
});

app.post('/api/deployments/:id/start', async (request, reply) => {
  const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
  if (!params.success) return reply.code(400).send({ error: 'A valid deployment ID is required.' });
  const { rows } = await db.query(`UPDATE deployments SET status='RUNNING', started_at=COALESCE(started_at, now()), paused_at=NULL WHERE id=$1 AND status='READY' RETURNING id, status, started_at AS "startedAt"`, [params.data.id]);
  if (!rows[0]) return reply.code(409).send({ error: 'Deployment does not exist or is not ready to start.' });
  return rows[0];
});

app.post('/api/deployments/:id/redeploy', async (request, reply) => {
  const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
  if (!params.success) return reply.code(400).send({ error: 'A valid deployment ID is required.' });
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const deployment = await client.query(`SELECT d.id, f.status AS firmware_status FROM deployments d JOIN firmware_versions f ON f.id=d.firmware_id WHERE d.id=$1 FOR UPDATE`, [params.data.id]);
    if (!deployment.rowCount) { await client.query('ROLLBACK'); return reply.code(404).send({ error: 'Deployment not found.' }); }
    if (deployment.rows[0].firmware_status !== 'READY') { await client.query('ROLLBACK'); return reply.code(409).send({ error: 'The deployment firmware must be READY before redeploying.' }); }
    await client.query(`UPDATE deployment_devices SET status='PENDING', retry_count=0, last_attempt_at=NULL, next_retry_at=NULL, last_error=NULL, completed_at=NULL, command_id=NULL, command_sent_at=NULL, claimed_at=NULL, claimed_by=NULL, started_at=NULL, finished_at=NULL, last_progress_percent=NULL, last_progress_at=NULL WHERE deployment_id=$1`, [params.data.id]);
    const { rows } = await client.query(`UPDATE deployments SET status='RUNNING', started_at=now(), paused_at=NULL, completed_at=NULL WHERE id=$1 RETURNING id, status, started_at AS "startedAt"`, [params.data.id]);
    await client.query(`INSERT INTO ota_events(device_id, deployment_id, event_type, metadata) SELECT device_id, deployment_id, 'DEPLOYMENT_REDEPLOYED', jsonb_build_object('restarted_at', now()) FROM deployment_devices WHERE deployment_id=$1`, [params.data.id]);
    await client.query('COMMIT');
    return rows[0];
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
});

app.post('/api/deployments', async (request, reply) => {
  const parsed = deploymentSchema.safeParse(request.body);
  if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
  const input = parsed.data;
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const firmware = await client.query('SELECT product, hardware_version, version, status FROM firmware_versions WHERE id=$1', [input.firmwareId]);
    if (!firmware.rowCount) { await client.query('ROLLBACK'); return reply.code(404).send({ error: 'Firmware not found.' }); }
    if (firmware.rows[0].status !== 'READY') { await client.query('ROLLBACK'); return reply.code(409).send({ error: 'Only READY firmware can be assigned to a deployment.' }); }
    const compatible = await client.query('SELECT id FROM devices WHERE id = ANY($1::uuid[]) AND product=$2 AND hardware_version=$3', [input.deviceIds, firmware.rows[0].product, firmware.rows[0].hardware_version]);
    if (compatible.rowCount !== input.deviceIds.length) { await client.query('ROLLBACK'); return reply.code(400).send({ error: 'One or more selected devices are not compatible with this firmware.' }); }
    const deployment = await client.query(`INSERT INTO deployments(name, firmware_id, status, rollout_type, max_concurrency, created_by) VALUES ($1,$2,'READY','SELECTED_DEVICES',$3,$4) RETURNING id, status`, [input.name, input.firmwareId, input.maxConcurrency, input.createdBy]);
    await client.query('INSERT INTO deployment_devices(deployment_id, device_id) SELECT $1, unnest($2::uuid[])', [deployment.rows[0].id, input.deviceIds]);
    await client.query(`INSERT INTO ota_events(device_id, deployment_id, event_type, to_version) SELECT unnest($1::uuid[]), $2, 'DEPLOYMENT_ASSIGNED', $3`, [input.deviceIds, deployment.rows[0].id, firmware.rows[0].version]);
    await client.query('COMMIT');
    return reply.code(201).send(deployment.rows[0]);
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
});

try { await migrate(); await ensureInitialAdmin(); mqttClient = startMqtt(db, app.log); startDeploymentWorker(db, mqttClient, app.log); await app.listen({ port: Number(process.env.API_PORT ?? 3000), host: '0.0.0.0' }); }
catch (error) { app.log.error(error); process.exit(1); }
