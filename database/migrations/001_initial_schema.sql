CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE firmware_status AS ENUM ('DRAFT', 'READY', 'ARCHIVED');
CREATE TYPE deployment_status AS ENUM ('DRAFT', 'READY', 'RUNNING', 'PAUSED', 'CANCELLED', 'COMPLETED', 'FAILED');
CREATE TYPE ota_status AS ENUM ('PENDING', 'WAITING_FOR_DEVICE', 'STARTED', 'DOWNLOADING', 'INSTALLING', 'REBOOTING', 'SUCCESS', 'FAILED', 'POSTPONED', 'ROLLED_BACK', 'CANCELLED');

CREATE TABLE devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_uid text NOT NULL UNIQUE,
  product text NOT NULL,
  hardware_version text NOT NULL,
  current_firmware text,
  target_firmware text,
  last_seen timestamptz,
  last_ip inet,
  last_ota_check timestamptz,
  ota_status ota_status NOT NULL DEFAULT 'PENDING',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE firmware_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product text NOT NULL,
  hardware_version text NOT NULL,
  version text NOT NULL,
  file_key text NOT NULL UNIQUE,
  file_size bigint NOT NULL CHECK (file_size > 0),
  sha256 char(64) NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  release_notes text NOT NULL DEFAULT '',
  status firmware_status NOT NULL DEFAULT 'DRAFT',
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(product, hardware_version, version)
);

CREATE TABLE deployments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  firmware_id uuid NOT NULL REFERENCES firmware_versions(id),
  status deployment_status NOT NULL DEFAULT 'DRAFT',
  rollout_type text NOT NULL CHECK (rollout_type IN ('SELECTED_DEVICES', 'PERCENTAGE', 'ALL_COMPATIBLE')),
  rollout_percentage numeric(5,2) CHECK (rollout_percentage > 0 AND rollout_percentage <= 100),
  max_concurrency integer NOT NULL DEFAULT 10 CHECK (max_concurrency > 0),
  started_at timestamptz,
  paused_at timestamptz,
  completed_at timestamptz,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE deployment_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deployment_id uuid NOT NULL REFERENCES deployments(id) ON DELETE CASCADE,
  device_id uuid NOT NULL REFERENCES devices(id),
  status ota_status NOT NULL DEFAULT 'PENDING',
  retry_count integer NOT NULL DEFAULT 0 CHECK (retry_count >= 0),
  last_attempt_at timestamptz,
  next_retry_at timestamptz,
  last_error text,
  completed_at timestamptz,
  UNIQUE(deployment_id, device_id)
);

CREATE TABLE ota_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id uuid NOT NULL REFERENCES devices(id),
  deployment_id uuid REFERENCES deployments(id),
  event_type text NOT NULL,
  from_version text,
  to_version text,
  error_code text,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX devices_last_seen_idx ON devices(last_seen DESC);
CREATE INDEX deployment_devices_status_idx ON deployment_devices(deployment_id, status);
CREATE INDEX ota_events_device_created_idx ON ota_events(device_id, created_at DESC);
