-- Module 3: evidence metadata (PostgreSQL)
-- Requires: users + incidents tables

CREATE TABLE IF NOT EXISTS evidence (
  id                UUID PRIMARY KEY,
  incident_id       UUID NOT NULL REFERENCES incidents (id) ON DELETE CASCADE,
  user_id           UUID NOT NULL REFERENCES users (id),
  s3_key            TEXT NOT NULL UNIQUE,
  checksum_sha256   TEXT NOT NULL,
  file_size_bytes   BIGINT NOT NULL,
  -- pending → verified | rejected
  status            TEXT NOT NULL DEFAULT 'pending',
  reject_reason     TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  uploaded_at       TIMESTAMPTZ,
  verified_at       TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_evidence_incident ON evidence (incident_id);
CREATE INDEX IF NOT EXISTS idx_evidence_user    ON evidence (user_id);
CREATE INDEX IF NOT EXISTS idx_evidence_s3_key  ON evidence (s3_key);
