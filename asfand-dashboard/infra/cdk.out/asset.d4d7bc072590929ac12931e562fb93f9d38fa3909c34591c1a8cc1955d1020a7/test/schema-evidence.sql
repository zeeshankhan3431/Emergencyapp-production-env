-- Module 3 test schema (pg-mem compatible — plain TEXT for status, no PostGIS)

CREATE TABLE IF NOT EXISTS evidence (
  id                UUID PRIMARY KEY,
  incident_id       UUID NOT NULL REFERENCES incidents (id) ON DELETE CASCADE,
  user_id           UUID NOT NULL REFERENCES users (id),
  s3_key            TEXT NOT NULL UNIQUE,
  checksum_sha256   TEXT NOT NULL,
  file_size_bytes   BIGINT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'pending',
  reject_reason     TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  uploaded_at       TIMESTAMPTZ,
  verified_at       TIMESTAMPTZ
);
