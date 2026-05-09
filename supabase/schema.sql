CREATE TABLE IF NOT EXISTS sites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_key uuid UNIQUE DEFAULT gen_random_uuid(),
  owner_id uuid REFERENCES auth.users(id),
  name text NOT NULL,
  domain text,
  plan text DEFAULT 'trial' CHECK (plan IN ('trial', 'pro', 'inactive')),
  stripe_customer_id text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE sites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner access" ON sites
  FOR ALL
  USING (auth.uid() = owner_id);

CREATE TABLE IF NOT EXISTS dashboard_widgets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid REFERENCES auth.users(id) NOT NULL,
  widget_type text NOT NULL,
  config jsonb DEFAULT '{}'::jsonb,
  position int DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE dashboard_widgets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner access" ON dashboard_widgets
  FOR ALL
  USING (auth.uid() = owner_id)
