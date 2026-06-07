-- Add cross-domain tracking settings to sites table
ALTER TABLE public.sites ADD COLUMN IF NOT EXISTS cross_domain_domains text[] DEFAULT NULL;
ALTER TABLE public.sites ADD COLUMN IF NOT EXISTS cross_domain_cookie_domain text DEFAULT NULL;
