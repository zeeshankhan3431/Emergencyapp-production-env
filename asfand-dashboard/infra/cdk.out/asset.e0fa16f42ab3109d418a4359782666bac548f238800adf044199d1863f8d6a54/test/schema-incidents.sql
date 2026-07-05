-- Module 2 test schema (pg-mem compatible — no PostGIS, no PL/pgSQL DO blocks)

CREATE TYPE incident_type AS ENUM ('assault','medical','kidnap','other');

CREATE TYPE incident_status AS ENUM (
  'triggered','ai_processing','escalated',
  'responder_assigned','resolved','cancelled'
);

CREATE TABLE IF NOT EXISTS incidents (
  id                    UUID PRIMARY KEY,
  user_id               UUID NOT NULL REFERENCES users (id),
  type                  incident_type NOT NULL,
  lat                   FLOAT NOT NULL,
  lng                   FLOAT NOT NULL,
  status                incident_status NOT NULL DEFAULT 'triggered',
  confidence_score      FLOAT,
  assigned_responder_id UUID REFERENCES users (id),
  encrypted_audio_s3_key TEXT,
  transcript_s3_key     TEXT,
  ai_summary            TEXT,
  urgency_score         FLOAT,
  is_deleted            BOOLEAN NOT NULL DEFAULT FALSE,
  triggered_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  escalated_at          TIMESTAMPTZ,
  resolved_at           TIMESTAMPTZ,
  device_id             TEXT,
  accuracy              FLOAT
);

CREATE TABLE IF NOT EXISTS incident_notes (
  id            UUID PRIMARY KEY,
  incident_id   UUID NOT NULL REFERENCES incidents (id) ON DELETE CASCADE,
  responder_id  UUID NOT NULL REFERENCES users (id),
  body          TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
