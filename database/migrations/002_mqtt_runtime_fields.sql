ALTER TABLE devices
  ADD COLUMN IF NOT EXISTS mqtt_client_id text,
  ADD COLUMN IF NOT EXISTS connection_status text NOT NULL DEFAULT 'UNKNOWN',
  ADD COLUMN IF NOT EXISTS last_status_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_boot_id text;

ALTER TABLE deployment_devices
  ADD COLUMN IF NOT EXISTS command_id uuid,
  ADD COLUMN IF NOT EXISTS command_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz,
  ADD COLUMN IF NOT EXISTS claimed_by text,
  ADD COLUMN IF NOT EXISTS started_at timestamptz,
  ADD COLUMN IF NOT EXISTS finished_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_progress_percent integer CHECK (last_progress_percent IS NULL OR (last_progress_percent >= 0 AND last_progress_percent <= 100)),
  ADD COLUMN IF NOT EXISTS last_progress_at timestamptz;

CREATE TABLE IF NOT EXISTS mqtt_message_receipts (
  message_id text PRIMARY KEY,
  device_uid text NOT NULL,
  message_type text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS devices_connection_status_idx ON devices(connection_status, last_status_at DESC);
CREATE INDEX IF NOT EXISTS deployment_devices_pending_idx ON deployment_devices(status, next_retry_at, claimed_at);
