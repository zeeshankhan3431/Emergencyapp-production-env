-- Module 5 test schema (pg-mem)

CREATE TABLE IF NOT EXISTS anonymised_incidents (
  id                    UUID PRIMARY KEY,
  source_incident_id    UUID NOT NULL UNIQUE REFERENCES incidents (id) ON DELETE CASCADE,
  generalised_lat       NUMERIC(10, 3) NOT NULL,
  generalised_lng       NUMERIC(10, 3) NOT NULL,
  hour_bucket           TIMESTAMPTZ NOT NULL,
  cohort_id             TEXT NOT NULL,
  type                  incident_type NOT NULL,
  ai_summary            TEXT,
  urgency_score         DOUBLE PRECISION,
  outcome               TEXT NOT NULL,
  k_anon_group_size     INT NOT NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS community_reports (
  id            UUID PRIMARY KEY,
  title         TEXT NOT NULL,
  summary_text  TEXT NOT NULL,
  published_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_published  BOOLEAN NOT NULL DEFAULT FALSE
);
