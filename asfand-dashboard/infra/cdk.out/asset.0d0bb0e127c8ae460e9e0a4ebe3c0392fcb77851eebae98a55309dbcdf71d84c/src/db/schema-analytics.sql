-- Module 5: anonymised analytics + published community content (PostgreSQL)

-- k-anonymity (k ≥ 5) is enforced in application code before insert; each row stores group size at release.
CREATE TABLE IF NOT EXISTS anonymised_incidents (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_incident_id    UUID NOT NULL UNIQUE REFERENCES incidents (id) ON DELETE CASCADE,
  generalised_lat       NUMERIC(10, 3) NOT NULL,
  generalised_lng       NUMERIC(10, 3) NOT NULL,
  hour_bucket           TIMESTAMPTZ NOT NULL,
  cohort_id             TEXT NOT NULL,
  type                  incident_type NOT NULL,
  ai_summary            TEXT,
  urgency_score         DOUBLE PRECISION,
  outcome               TEXT NOT NULL,
  k_anon_group_size     INT NOT NULL CHECK (k_anon_group_size >= 5),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_anon_incidents_hour ON anonymised_incidents (hour_bucket DESC);
CREATE INDEX IF NOT EXISTS idx_anon_incidents_cohort ON anonymised_incidents (cohort_id);
CREATE INDEX IF NOT EXISTS idx_anon_incidents_geo ON anonymised_incidents (generalised_lat, generalised_lng);

-- Admin-approved public summaries (no coordinates, no user ids)
CREATE TABLE IF NOT EXISTS community_reports (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title         TEXT NOT NULL,
  summary_text  TEXT NOT NULL,
  published_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_published  BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_community_reports_published ON community_reports (is_published, published_at DESC);
