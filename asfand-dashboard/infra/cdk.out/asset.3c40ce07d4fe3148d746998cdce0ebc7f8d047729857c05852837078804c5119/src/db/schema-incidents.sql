-- Module 2: incidents + incident_notes (PostgreSQL + PostGIS)
-- Requires: PostGIS extension and users table from schema.sql

DO $$ BEGIN
  CREATE TYPE incident_type AS ENUM ('assault','medical','kidnap','other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE incident_status AS ENUM (
    'triggered','ai_processing','escalated',
    'responder_assigned','resolved','cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS incidents (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL REFERENCES users (id),
  type                  incident_type NOT NULL,
  lat                   FLOAT NOT NULL,
  lng                   FLOAT NOT NULL,
  -- PostGIS column populated via trigger; nullable for non-PostGIS environments
  location              GEOGRAPHY(POINT,4326),
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

CREATE INDEX IF NOT EXISTS idx_incidents_user_id ON incidents (user_id);
CREATE INDEX IF NOT EXISTS idx_incidents_status ON incidents (status);
CREATE INDEX IF NOT EXISTS idx_incidents_triggered_at ON incidents (triggered_at DESC);
CREATE INDEX IF NOT EXISTS idx_incidents_assigned ON incidents (assigned_responder_id)
  WHERE assigned_responder_id IS NOT NULL;

-- Spatial index: requires PostGIS
-- CREATE INDEX IF NOT EXISTS idx_incidents_location ON incidents USING GIST (location);

CREATE TABLE IF NOT EXISTS incident_notes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id   UUID NOT NULL REFERENCES incidents (id) ON DELETE CASCADE,
  responder_id  UUID NOT NULL REFERENCES users (id),
  body          TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_incident_notes_incident ON incident_notes (incident_id);
