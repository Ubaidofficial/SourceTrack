-- Session 59: Super Admin Phase 2 — audit logging + QA notes persistence
-- admin_audit_log: immutable record of super admin actions
-- qa_notes: editable truthfulness notes (replaces static frontend arrays)

CREATE TABLE IF NOT EXISTS admin_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  target_type text,
  target_id text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE admin_audit_log ENABLE ROW LEVEL SECURITY;

-- Only accessible via service key (API uses requireRole('super_admin'))
CREATE POLICY "Service key access only" ON admin_audit_log
  FOR ALL
  USING (false);

CREATE INDEX IF NOT EXISTS idx_admin_audit_log_created
  ON admin_audit_log (created_at DESC);

CREATE TABLE IF NOT EXISTS qa_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_key text NOT NULL,
  note_type text NOT NULL CHECK (note_type IN ('safe_claim', 'watch', 'misleading')),
  note_text text NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE qa_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service key access only" ON qa_notes
  FOR ALL
  USING (false);

CREATE INDEX IF NOT EXISTS idx_qa_notes_feature
  ON qa_notes (feature_key, note_type);
