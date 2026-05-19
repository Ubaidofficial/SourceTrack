-- Set imubaid93@gmail.com as super_admin
-- This updates raw_app_meta_data so requireUserAuth middleware grants super_admin role.
UPDATE auth.users
SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || '{"role": "super_admin"}'::jsonb
WHERE email = 'imubaid93@gmail.com';
