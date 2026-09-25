ALTER TABLE devices
  ADD COLUMN IF NOT EXISTS flash_size_mb integer
    CHECK (flash_size_mb IS NULL OR flash_size_mb IN (4, 8, 16));

ALTER TABLE firmware_versions
  ADD COLUMN IF NOT EXISTS flash_size_mb integer
    CHECK (flash_size_mb IS NULL OR flash_size_mb IN (4, 8, 16));

ALTER TABLE firmware_versions
  DROP CONSTRAINT IF EXISTS firmware_versions_product_hardware_version_version_key;

UPDATE firmware_versions f
SET flash_size_mb = f.hardware_version::integer,
    hardware_version = 'ESP32-S3'
WHERE f.product IN ('DM', 'Datameter')
  AND f.hardware_version ~ '^(4|8|16)$'
  AND NOT EXISTS (
    SELECT 1
    FROM firmware_versions existing
    WHERE existing.id <> f.id
      AND existing.product = f.product
      AND existing.hardware_version = 'ESP32-S3'
      AND existing.version = f.version
      AND existing.flash_size_mb = f.hardware_version::integer
  );

CREATE UNIQUE INDEX IF NOT EXISTS firmware_versions_target_version_idx
  ON firmware_versions(product, hardware_version, flash_size_mb, version);

UPDATE devices
SET product = 'DM'
WHERE device_uid ~* '^DM-[0-9]+'
  AND lower(product) = 'datameter';

UPDATE devices d
SET flash_size_mb = candidate.flash_size_mb
FROM (
  SELECT d.id, MIN(f.flash_size_mb) AS flash_size_mb
  FROM devices d
  JOIN firmware_versions f
    ON lower(f.product) IN (lower(d.product), 'dm', 'datameter')
   AND f.version = regexp_replace(d.current_firmware, '^v@?', '')
   AND f.hardware_version = d.hardware_version
   AND f.flash_size_mb IS NOT NULL
  WHERE d.device_uid ~* '^DM-[0-9]+'
    AND d.flash_size_mb IS NULL
  GROUP BY d.id
  HAVING COUNT(DISTINCT f.flash_size_mb) = 1
) candidate
WHERE d.id = candidate.id;
