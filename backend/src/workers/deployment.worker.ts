import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import type { MqttClient } from 'mqtt';
import { publishOtaCommand } from '../services/mqtt/mqtt.service.js';

const ACTIVE_STATUSES = ['STARTED', 'DOWNLOADING', 'INSTALLING', 'REBOOTING'];

type WorkerLogger = {
  info: (value: unknown, message?: string) => void;
  warn: (value: unknown, message?: string) => void;
  error: (value: unknown, message?: string) => void;
};

export function startDeploymentWorker(db: pg.Pool, mqttClient: MqttClient | undefined, log: WorkerLogger) {
  const intervalMs = Number(process.env.OTA_WORKER_INTERVAL_MS ?? 5_000);
  let running = false;
  const tick = async () => {
    if (running || !mqttClient?.connected) return;
    running = true;
    try { await deliverPendingDevices(db, mqttClient, log); }
    catch (error) { log.error(error, 'OTA deployment worker tick failed'); }
    finally { running = false; }
  };
  const timer = setInterval(() => void tick(), intervalMs);
  void tick();
  return () => clearInterval(timer);
}

async function deliverPendingDevices(db: pg.Pool, mqttClient: MqttClient, log: WorkerLogger) {
  const deployments = await db.query(`SELECT d.id, d.max_concurrency AS "maxConcurrency", f.version, f.file_key AS "fileKey", f.file_size AS "fileSize", f.sha256 FROM deployments d JOIN firmware_versions f ON f.id=d.firmware_id WHERE d.status='RUNNING' AND f.status='READY' ORDER BY d.created_at ASC`);
  for (const deployment of deployments.rows) {
    const active = await db.query(`SELECT COUNT(*)::int AS count FROM deployment_devices WHERE deployment_id=$1 AND status = ANY($2::ota_status[])`, [deployment.id, ACTIVE_STATUSES]);
    const available = Math.max(0, deployment.maxConcurrency - active.rows[0].count);
    if (!available) continue;
    for (let index = 0; index < available; index += 1) {
      const claimed = await claimDevice(db, deployment.id);
      if (!claimed) break;
      try {
        await publishOtaCommand(mqttClient, claimed.deviceUid, { msg_type: 'ota.check' });
        log.info({ deviceUid: claimed.deviceUid, deploymentId: deployment.id }, 'OTA check published');
      } catch (error) {
        await db.query(`UPDATE deployment_devices SET status='PENDING', claimed_at=NULL, claimed_by=NULL, command_sent_at=NULL, last_error=$2, next_retry_at=now() + interval '30 seconds' WHERE id=$1`, [claimed.assignmentId, error instanceof Error ? error.message : 'MQTT publish failed']);
        log.warn({ error, deviceUid: claimed.deviceUid, deploymentId: deployment.id }, 'OTA command could not be published');
      }
    }
  }
}

async function claimDevice(db: pg.Pool, deploymentId: string) {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(`SELECT dd.id AS "assignmentId", d.device_uid AS "deviceUid" FROM deployment_devices dd JOIN devices d ON d.id=dd.device_id WHERE dd.deployment_id=$1 AND dd.status='PENDING' AND (dd.next_retry_at IS NULL OR dd.next_retry_at <= now()) AND d.connection_status='ONLINE' AND d.last_status_at > now() - interval '10 minutes' AND dd.claimed_at IS NULL ORDER BY d.last_status_at DESC FOR UPDATE OF dd SKIP LOCKED LIMIT 1`, [deploymentId]);
    if (!result.rows[0]) { await client.query('ROLLBACK'); return undefined; }
    const commandId = randomUUID();
    await client.query(`UPDATE deployment_devices SET status='STARTED', command_id=$2, claimed_at=now(), claimed_by=$3, command_sent_at=now(), started_at=COALESCE(started_at, now()), last_attempt_at=now(), retry_count=retry_count+1 WHERE id=$1`, [result.rows[0].assignmentId, commandId, `ota-worker-${process.pid}`]);
    await client.query('COMMIT');
    return { ...result.rows[0], commandId } as { assignmentId: string; deviceUid: string; commandId: string };
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
