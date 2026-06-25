-- Module 6: notification preferences (PostgreSQL)

ALTER TABLE users ADD COLUMN IF NOT EXISTS notification_prefs JSONB NOT NULL DEFAULT '{"sms_enabled":true,"push_enabled":true,"email_digest_enabled":false}'::jsonb;
