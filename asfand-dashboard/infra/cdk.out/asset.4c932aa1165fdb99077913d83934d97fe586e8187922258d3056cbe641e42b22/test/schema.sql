-- Same as src/db/schema.sql without PL/pgSQL DO block (pg-mem compatible)

CREATE TYPE user_role AS ENUM ('Admin', 'Responder', 'Analyst', 'Public');

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  cognito_sub TEXT UNIQUE,
  role user_role NOT NULL DEFAULT 'Public',
  full_name TEXT NOT NULL,
  phone TEXT,
  is_verified BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login TIMESTAMPTZ,
  notification_prefs JSONB NOT NULL DEFAULT '{"sms_enabled":true,"push_enabled":true,"email_digest_enabled":false}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_users_cognito_sub ON users (cognito_sub);
CREATE INDEX IF NOT EXISTS idx_users_email_lower ON users (lower(email));

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens (user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash ON refresh_tokens (token_hash);
