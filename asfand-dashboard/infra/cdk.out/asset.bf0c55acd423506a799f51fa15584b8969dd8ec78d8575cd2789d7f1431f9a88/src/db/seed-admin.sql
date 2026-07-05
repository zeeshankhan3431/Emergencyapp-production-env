-- Seed admin user if not exists
-- This ensures the admin user is always present in the database after migrations

INSERT INTO users (email, cognito_sub, role, full_name, is_verified, created_at)
VALUES (
  'admin@era.dev',
  '04f88458-80f1-708e-cba3-8551c8e37d1a',
  'Admin',
  'ERA Admin',
  true,
  NOW()
)
ON CONFLICT (email) 
DO UPDATE SET 
  cognito_sub = EXCLUDED.cognito_sub,
  role = EXCLUDED.role,
  is_verified = EXCLUDED.is_verified;

INSERT INTO users (email, cognito_sub, role, full_name, is_verified, created_at)
VALUES (
  'mobile3@era.dev',
  '04b87428-90f1-7005-769d-e7df687be295',
  'Public',
  'ERA Mobile Service',
  true,
  NOW()
)
ON CONFLICT (email) 
DO UPDATE SET 
  cognito_sub = EXCLUDED.cognito_sub,
  role = EXCLUDED.role,
  is_verified = EXCLUDED.is_verified;
