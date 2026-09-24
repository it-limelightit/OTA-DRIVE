ALTER TABLE devices
  ADD COLUMN IF NOT EXISTS health_fault_active boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS health_faults jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS health_fault_updated_at timestamptz;

CREATE INDEX IF NOT EXISTS devices_health_fault_idx
  ON devices(health_fault_active, health_fault_updated_at DESC);
