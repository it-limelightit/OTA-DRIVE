import mqtt, { type MqttClient } from 'mqtt';
import { z } from 'zod';
import type pg from 'pg';

async function refreshDeploymentStatus(db: pg.Pool, deploymentId: string) {
  await db.query(`UPDATE deployments d
    SET status=CASE
      WHEN EXISTS (SELECT 1 FROM deployment_devices dd WHERE dd.deployment_id=d.id AND dd.status IN ('FAILED','ROLLED_BACK')) THEN 'FAILED'::deployment_status
      WHEN EXISTS (SELECT 1 FROM deployment_devices dd WHERE dd.deployment_id=d.id AND dd.status='CANCELLED') THEN 'CANCELLED'::deployment_status
      ELSE 'COMPLETED'::deployment_status
    END,
    completed_at=COALESCE(d.completed_at, now())
    WHERE d.id=$1 AND d.status='RUNNING'
      AND EXISTS (SELECT 1 FROM deployment_devices dd WHERE dd.deployment_id=d.id)
      AND NOT EXISTS (SELECT 1 FROM deployment_devices dd WHERE dd.deployment_id=d.id AND dd.status NOT IN ('SUCCESS','FAILED','ROLLED_BACK','CANCELLED'))`, [deploymentId]);
}

/**
 * A device's first health/status message after reboot is the final OTA
 * acknowledgement for factory devices.  It does not contain the original
 * command id, so complete only the most recent active assignment whose target
 * firmware matches the firmware the device is now running.
 */
async function completeDeploymentAfterReboot(db: pg.Pool, deviceUid: string, firmware: string | null | undefined) {
  if (!firmware) return;
  const completed = await db.query(`WITH matching AS (
    SELECT dd.id
    FROM deployment_devices dd
    JOIN deployments dep ON dep.id=dd.deployment_id
    JOIN firmware_versions f ON f.id=dep.firmware_id
    JOIN devices d ON d.id=dd.device_id
    WHERE d.device_uid=$1
      AND dd.status = ANY(ARRAY['STARTED','DOWNLOADING','INSTALLING','REBOOTING']::ota_status[])
      AND f.version=regexp_replace(trim($2), '^v@?', '', 'i')
    ORDER BY dd.command_sent_at DESC NULLS LAST, dep.created_at DESC
    LIMIT 1
  )
  UPDATE deployment_devices dd
  SET status='SUCCESS', finished_at=COALESCE(dd.finished_at, now()), last_progress_percent=100,
      last_progress_at=now(), last_error=NULL
  FROM matching WHERE dd.id=matching.id
  RETURNING dd.deployment_id`, [deviceUid, firmware]);
  if (!completed.rowCount) return;
  await db.query(`UPDATE devices SET ota_status='SUCCESS', updated_at=now() WHERE device_uid=$1`, [deviceUid]);
  await refreshDeploymentStatus(db, completed.rows[0].deployment_id);
}

const statusSchema = z.object({
  msg_type: z.literal('device.status'),
  device_id: z.string().trim().min(3),
  product: z.string().trim().min(1),
  hw: z.string().trim().min(1),
  flash_size: z.preprocess((value) => typeof value === 'string' && value.trim() !== '' ? Number(value) : value, z.number().int().refine((size) => [4, 8, 16].includes(size)).optional()),
  fw: z.string().trim().min(1),
  battery_mv: z.number().int().positive().optional(),
  boot_id: z.string().trim().min(1).optional(),
  message_id: z.string().trim().min(1).optional()
});

const factoryHealthSchema = z.object({
  type: z.literal('health'),
  client_id: z.string().trim().min(3),
  product: z.string().trim().min(1).optional(),
  hw: z.string().trim().min(1).optional(),
  flash_size: z.preprocess((value) => typeof value === 'string' && value.trim() !== '' ? Number(value) : value, z.number().int().refine((size) => [4, 8, 16].includes(size)).optional()),
  fw: z.string().trim().min(1).optional(),
  is_fault_trigger: z.boolean().optional(),
  errors: z.array(z.string().trim().min(1).max(120)).max(64).optional()
});

const otaStatusSchema = z.object({
  msg_type: z.literal('ota.status'),
  device_id: z.string().trim().min(3),
  deployment_id: z.string().uuid(),
  command_id: z.string().uuid(),
  status: z.enum(['WAITING', 'ACCEPTED', 'STARTED', 'DOWNLOADING', 'VERIFYING', 'INSTALLING', 'REBOOTING', 'SUCCESS', 'FAILED', 'ROLLED_BACK']),
  current_version: z.string().trim().min(1).optional(),
  progress_percent: z.number().int().min(0).max(100).optional(),
  error_code: z.string().trim().min(1).max(120).optional(),
  message_id: z.string().trim().min(1).optional()
});

const topicSchema = z.object({ deviceId: z.string().trim().min(3), kind: z.enum(['status', 'ota/status', 'factory/health', 'factory/ota/status']) });

function parseTopic(topic: string) {
  const parts = topic.split('/');
  if (parts.length === 3 && parts[0] === 'devices' && parts[2] === 'status') return topicSchema.parse({ deviceId: parts[1], kind: 'status' });
  if (parts.length === 4 && parts[0] === 'devices' && parts[2] === 'ota' && parts[3] === 'status') return topicSchema.parse({ deviceId: parts[1], kind: 'ota/status' });
  if (parts.length === 4 && parts[0] === 'Limelight' && parts[1] === 'factory' && parts[3] === 'health') return topicSchema.parse({ deviceId: parts[2], kind: 'factory/health' });
  if (parts.length === 5 && parts[0] === 'Limelight' && parts[1] === 'factory' && parts[3] === 'ota' && parts[4] === 'status') return topicSchema.parse({ deviceId: parts[2], kind: 'factory/ota/status' });
  return null;
}

function productForDevice(deviceId: string, reported?: string) {
  if (/^DM-\d+/i.test(deviceId) || reported?.trim().toLowerCase() === 'datameter') return 'DM';
  return reported?.trim() || process.env.MQTT_DEFAULT_PRODUCT || 'Datameter';
}

export function startMqtt(db: pg.Pool, log: { info: (value: unknown, message?: string) => void; warn: (value: unknown, message?: string) => void; error: (value: unknown, message?: string) => void }, onDeviceChanged?: (deviceUid: string) => void) {
  const url = process.env.MQTT_URL;
  if (!url) { log.warn({}, 'MQTT_URL is not configured; MQTT integration disabled'); return undefined; }
  const factoryHealthTopics = (process.env.MQTT_FACTORY_HEALTH_TOPICS ?? 'Limelight/factory/+/health').split(',').map((topic) => topic.trim()).filter(Boolean);
  const client = mqtt.connect(url, {
    clientId: process.env.MQTT_CLIENT_ID ?? `ota-backend-${process.pid}`,
    username: process.env.MQTT_USERNAME,
    password: process.env.MQTT_PASSWORD,
    reconnectPeriod: 5_000,
    clean: true
  });

  client.on('connect', () => {
    client.subscribe(['devices/+/status', 'devices/+/ota/status', 'Limelight/factory/+/ota/status', ...factoryHealthTopics], { qos: 1 }, (error) => {
      if (error) log.error(error, 'MQTT subscription failed');
      else log.info({}, 'MQTT connected and subscribed');
    });
  });
  client.on('error', (error) => log.error(error, 'MQTT client error'));
  client.on('message', (topic, payload) => void handleMessage(db, topic, payload.toString(), log, onDeviceChanged));
  return client;
}

async function handleMessage(db: pg.Pool, topic: string, raw: string, log: { warn: (value: unknown, message?: string) => void; error: (value: unknown, message?: string) => void }, onDeviceChanged?: (deviceUid: string) => void) {
  const parsedTopic = parseTopic(topic);
  if (!parsedTopic) return;
  let value: unknown;
  try { value = JSON.parse(raw); } catch { log.warn({ topic }, 'Ignoring invalid MQTT JSON'); return; }
  if (parsedTopic.kind === 'factory/health') {
    const parsed = factoryHealthSchema.safeParse(value);
    if (!parsed.success || parsed.data.client_id !== parsedTopic.deviceId) { log.warn({ topic }, 'Ignoring invalid or mismatched factory health payload'); return; }
    const firmware = parsed.data.fw?.replace(/^v@?/, '') ?? null;
    const product = productForDevice(parsed.data.client_id, parsed.data.product);
    const hardware = parsed.data.hw ?? process.env.MQTT_DEFAULT_HARDWARE ?? 'ESP32-S3';
    const flashSize = parsed.data.flash_size ?? (Number(process.env.MQTT_DEFAULT_FLASH_SIZE_MB) || null);
    const faultActive = parsed.data.is_fault_trigger ?? (parsed.data.errors ? parsed.data.errors.length > 0 : null);
    const faultList = parsed.data.errors ? JSON.stringify(parsed.data.errors) : null;
    try {
      await db.query(`INSERT INTO devices(device_uid, product, hardware_version, flash_size_mb, current_firmware, last_seen, last_status_at, last_ota_check, connection_status, health_fault_active, health_faults, health_fault_updated_at)
        VALUES ($1,$2,$3,$4,$5,now(),now(),now(),'ONLINE',COALESCE($6::boolean,false),COALESCE($7::jsonb,'[]'::jsonb),CASE WHEN $6::boolean IS NULL AND $7::jsonb IS NULL THEN NULL ELSE now() END)
        ON CONFLICT(device_uid) DO UPDATE SET product=COALESCE(NULLIF(EXCLUDED.product,''), devices.product), hardware_version=COALESCE(NULLIF(EXCLUDED.hardware_version,''), devices.hardware_version), flash_size_mb=COALESCE(EXCLUDED.flash_size_mb, devices.flash_size_mb), current_firmware=COALESCE($5,devices.current_firmware), last_seen=now(), last_status_at=now(), last_ota_check=now(), connection_status='ONLINE', health_fault_active=COALESCE($6::boolean,devices.health_fault_active), health_faults=COALESCE($7::jsonb,devices.health_faults), health_fault_updated_at=CASE WHEN $6::boolean IS NULL AND $7::jsonb IS NULL THEN devices.health_fault_updated_at ELSE now() END, updated_at=now()`, [parsed.data.client_id, product, hardware, flashSize, firmware, faultActive, faultList]);
      await completeDeploymentAfterReboot(db, parsed.data.client_id, firmware);
      onDeviceChanged?.(parsed.data.client_id);
    } catch (error) { log.error({ error, topic }, 'Factory health processing failed'); }
    return;
  }
  if (parsedTopic.kind === 'status') {
    const parsed = statusSchema.safeParse(value);
    if (!parsed.success || parsed.data.device_id !== parsedTopic.deviceId) { log.warn({ topic }, 'Ignoring invalid or mismatched MQTT payload'); return; }
    const data = parsed.data;
    if (data.message_id) {
      const receipt = await db.query('INSERT INTO mqtt_message_receipts(message_id, device_uid, message_type) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', [data.message_id, data.device_id, data.msg_type]);
      if (!receipt.rowCount) return;
    }
    try {
      await db.query(`INSERT INTO devices(device_uid, product, hardware_version, flash_size_mb, current_firmware, last_seen, last_status_at, last_ota_check, connection_status, last_boot_id) VALUES ($1,$2,$3,$4,$5,now(),now(),now(),'ONLINE',$6) ON CONFLICT(device_uid) DO UPDATE SET product=EXCLUDED.product, hardware_version=EXCLUDED.hardware_version, flash_size_mb=COALESCE(EXCLUDED.flash_size_mb, devices.flash_size_mb), current_firmware=EXCLUDED.current_firmware, last_seen=now(), last_status_at=now(), last_ota_check=now(), connection_status='ONLINE', last_boot_id=COALESCE(EXCLUDED.last_boot_id, devices.last_boot_id), updated_at=now()`, [data.device_id, productForDevice(data.device_id, data.product), data.hw, data.flash_size ?? null, data.fw, data.boot_id ?? null]);
      await completeDeploymentAfterReboot(db, data.device_id, data.fw);
      onDeviceChanged?.(data.device_id);
    } catch (error) { log.error({ error, topic }, 'MQTT status processing failed'); }
    return;
  }
  const parsed = otaStatusSchema.safeParse(value);
  if (!parsed.success || parsed.data.device_id !== parsedTopic.deviceId) { log.warn({ topic }, 'Ignoring invalid or mismatched MQTT payload'); return; }
  const data = parsed.data;
  const messageId = 'message_id' in data ? data.message_id : undefined;
  if (messageId) {
    const receipt = await db.query('INSERT INTO mqtt_message_receipts(message_id, device_uid, message_type) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', [messageId, data.device_id, data.msg_type]);
    if (!receipt.rowCount) return;
  }
  try {
    /* The bridge firmware has a few detailed states which the existing DB enum
       does not need to store separately. Keep the dashboard state meaningful. */

    const status = data.status === 'WAITING' ? 'WAITING_FOR_DEVICE'
      : data.status === 'ACCEPTED' ? 'STARTED'
        : data.status === 'VERIFYING' ? 'DOWNLOADING'
          : data.status;
    const assignment = await db.query(`UPDATE deployment_devices dd SET status=$4::ota_status, last_error=$5::text, last_progress_percent=$6::integer, last_progress_at=CASE WHEN $6::integer IS NULL THEN last_progress_at ELSE now() END, started_at=CASE WHEN $4::ota_status IN ('STARTED'::ota_status,'DOWNLOADING'::ota_status,'INSTALLING'::ota_status,'REBOOTING'::ota_status) AND started_at IS NULL THEN now() ELSE started_at END, finished_at=CASE WHEN $4::ota_status IN ('SUCCESS'::ota_status,'FAILED'::ota_status,'ROLLED_BACK'::ota_status) THEN now() ELSE finished_at END WHERE dd.deployment_id=$1::uuid AND dd.device_id=(SELECT id FROM devices WHERE device_uid=$2::text) AND dd.command_id=$3::uuid RETURNING dd.id`, [data.deployment_id, data.device_id, data.command_id, status, data.error_code ?? null, data.progress_percent ?? null]);
    if (!assignment.rowCount) {
      log.warn({ topic, deviceUid: data.device_id, deploymentId: data.deployment_id, commandId: data.command_id }, 'Ignoring OTA status for an unknown or stale command');
      return;
    }
    await db.query(`UPDATE devices SET current_firmware=COALESCE($2,current_firmware), last_seen=now(), last_status_at=now(), connection_status='ONLINE', ota_status=$3, updated_at=now() WHERE device_uid=$1`, [data.device_id, data.current_version ?? null, status]);
    if (['SUCCESS', 'FAILED', 'ROLLED_BACK'].includes(status)) await refreshDeploymentStatus(db, data.deployment_id);
    onDeviceChanged?.(data.device_id);

  } catch (error) { log.error({ error, topic }, 'MQTT message processing failed'); }
}

export function publishOtaCommand(client: MqttClient | undefined, deviceUid: string, command: object) {
  if (!client) return Promise.reject(new Error('MQTT is not connected'));
  return new Promise<void>((resolve, reject) => client.publish(`Limelight/factory/${deviceUid}/config`, JSON.stringify(command), { qos: 1, retain: false }, (error) => error ? reject(error) : resolve()));
}
