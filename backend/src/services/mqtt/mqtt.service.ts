import mqtt, { type MqttClient } from 'mqtt';
import { z } from 'zod';
import type pg from 'pg';

const statusSchema = z.object({
  msg_type: z.literal('device.status'),
  device_id: z.string().trim().min(3),
  product: z.string().trim().min(1),
  hw: z.string().trim().min(1),
  fw: z.string().trim().min(1),
  battery_mv: z.number().int().positive().optional(),
  boot_id: z.string().trim().min(1).optional(),
  message_id: z.string().trim().min(1).optional()
});

const factoryHealthSchema = z.object({
  type: z.literal('health'),
  client_id: z.string().trim().min(3),
  fw: z.string().trim().min(1).optional()
});

const otaStatusSchema = z.object({
  msg_type: z.literal('ota.status'),
  device_id: z.string().trim().min(3),
  deployment_id: z.string().uuid(),
  status: z.enum(['WAITING', 'STARTED', 'DOWNLOADING', 'INSTALLING', 'REBOOTING', 'SUCCESS', 'FAILED', 'ROLLED_BACK']),
  current_version: z.string().trim().min(1).optional(),
  progress_percent: z.number().int().min(0).max(100).optional(),
  error_code: z.string().trim().min(1).max(120).optional(),
  message_id: z.string().trim().min(1).optional()
});

const topicSchema = z.object({ deviceId: z.string().trim().min(3), kind: z.enum(['status', 'ota/status', 'factory/health']) });

function parseTopic(topic: string) {
  const parts = topic.split('/');
  if (parts.length === 3 && parts[0] === 'devices' && parts[2] === 'status') return topicSchema.parse({ deviceId: parts[1], kind: 'status' });
  if (parts.length === 4 && parts[0] === 'devices' && parts[2] === 'ota' && parts[3] === 'status') return topicSchema.parse({ deviceId: parts[1], kind: 'ota/status' });
  if (parts.length === 4 && parts[0] === 'Limelight' && parts[1] === 'factory' && parts[3] === 'health') return topicSchema.parse({ deviceId: parts[2], kind: 'factory/health' });
  return null;
}

export function startMqtt(db: pg.Pool, log: { info: (value: unknown, message?: string) => void; warn: (value: unknown, message?: string) => void; error: (value: unknown, message?: string) => void }) {
  const url = process.env.MQTT_URL;
  if (!url) { log.warn({}, 'MQTT_URL is not configured; MQTT integration disabled'); return undefined; }
  const factoryHealthTopics = (process.env.MQTT_FACTORY_HEALTH_TOPICS ?? 'Limelight/factory/DM-117/health').split(',').map((topic) => topic.trim()).filter(Boolean);
  const client = mqtt.connect(url, {
    clientId: process.env.MQTT_CLIENT_ID ?? `ota-backend-${process.pid}`,
    username: process.env.MQTT_USERNAME,
    password: process.env.MQTT_PASSWORD,
    reconnectPeriod: 5_000,
    clean: true
  });

  client.on('connect', () => {
    client.subscribe(['devices/+/status', 'devices/+/ota/status', ...factoryHealthTopics], { qos: 1 }, (error) => {
      if (error) log.error(error, 'MQTT subscription failed');
      else log.info({}, 'MQTT connected and subscribed');
    });
  });
  client.on('error', (error) => log.error(error, 'MQTT client error'));
  client.on('message', (topic, payload) => void handleMessage(db, topic, payload.toString(), log));
  return client;
}

async function handleMessage(db: pg.Pool, topic: string, raw: string, log: { warn: (value: unknown, message?: string) => void; error: (value: unknown, message?: string) => void }) {
  const parsedTopic = parseTopic(topic);
  if (!parsedTopic) return;
  let value: unknown;
  try { value = JSON.parse(raw); } catch { log.warn({ topic }, 'Ignoring invalid MQTT JSON'); return; }
  if (parsedTopic.kind === 'factory/health') {
    const parsed = factoryHealthSchema.safeParse(value);
    if (!parsed.success || parsed.data.client_id !== parsedTopic.deviceId) { log.warn({ topic }, 'Ignoring invalid or mismatched factory health payload'); return; }
    const firmware = parsed.data.fw?.replace(/^v@?/, '') ?? null;
    try {
      const result = await db.query(`UPDATE devices SET current_firmware=COALESCE($2,current_firmware), last_seen=now(), last_status_at=now(), last_ota_check=now(), connection_status='ONLINE', updated_at=now() WHERE device_uid=$1`, [parsed.data.client_id, firmware]);
      if (!result.rowCount) log.warn({ deviceUid: parsed.data.client_id }, 'Factory health received for an unregistered device');
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
      await db.query(`INSERT INTO devices(device_uid, product, hardware_version, current_firmware, last_seen, last_status_at, last_ota_check, connection_status, last_boot_id) VALUES ($1,$2,$3,$4,now(),now(),now(),'ONLINE',$5) ON CONFLICT(device_uid) DO UPDATE SET product=EXCLUDED.product, hardware_version=EXCLUDED.hardware_version, current_firmware=EXCLUDED.current_firmware, last_seen=now(), last_status_at=now(), last_ota_check=now(), connection_status='ONLINE', last_boot_id=COALESCE(EXCLUDED.last_boot_id, devices.last_boot_id), updated_at=now()`, [data.device_id, data.product, data.hw, data.fw, data.boot_id ?? null]);
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
    const status = data.status === 'WAITING' ? 'WAITING_FOR_DEVICE' : data.status;
    await db.query(`UPDATE devices SET current_firmware=COALESCE($2,current_firmware), last_seen=now(), last_status_at=now(), connection_status='ONLINE', ota_status=$3, updated_at=now() WHERE device_uid=$1`, [data.device_id, data.current_version ?? null, status]);
    await db.query(`UPDATE deployment_devices dd SET status=$3, last_error=$4, last_progress_percent=$5, last_progress_at=CASE WHEN $5 IS NULL THEN last_progress_at ELSE now() END, started_at=CASE WHEN $3 IN ('STARTED','DOWNLOADING','INSTALLING','REBOOTING') AND started_at IS NULL THEN now() ELSE started_at END, finished_at=CASE WHEN $3 IN ('SUCCESS','FAILED','ROLLED_BACK') THEN now() ELSE finished_at END WHERE dd.deployment_id=$1 AND dd.device_id=(SELECT id FROM devices WHERE device_uid=$2)`, [data.deployment_id, data.device_id, status, data.error_code ?? null, data.progress_percent ?? null]);
  } catch (error) { log.error({ error, topic }, 'MQTT message processing failed'); }
}

export function publishOtaCommand(client: MqttClient | undefined, deviceUid: string, command: object) {
  if (!client) return Promise.reject(new Error('MQTT is not connected'));
  return new Promise<void>((resolve, reject) => client.publish(`Limelight/factory/${deviceUid}/config`, JSON.stringify(command), { qos: 1, retain: false }, (error) => error ? reject(error) : resolve()));
}
