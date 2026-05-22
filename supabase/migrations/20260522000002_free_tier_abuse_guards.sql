-- Free-tier abuse guards. Defense-in-depth — the frontend also performs these
-- checks, but RLS lets the dashboard insert into `sites` directly with the anon
-- key, so a trigger is the only place we can guarantee enforcement.

-- ── 1. Disposable email domains lookup table ─────────────────────────────────
CREATE TABLE IF NOT EXISTS disposable_email_domains (
  domain text PRIMARY KEY
);

INSERT INTO disposable_email_domains (domain) VALUES
  ('10minutemail.com'), ('10minutemail.net'), ('mailinator.com'),
  ('tempmail.com'), ('temp-mail.org'), ('temp-mail.io'),
  ('guerrillamail.com'), ('guerrillamail.net'), ('sharklasers.com'),
  ('grr.la'), ('getnada.com'), ('getairmail.com'), ('throwawaymail.com'),
  ('yopmail.com'), ('maildrop.cc'), ('dispostable.com'), ('fakeinbox.com'),
  ('fake-mail.com'), ('tempinbox.com'), ('mintemail.com'), ('mailnesia.com'),
  ('emailondeck.com'), ('mailcatch.com'), ('spambox.us'), ('mohmal.com'),
  ('incognitomail.org'), ('tempmailer.com'), ('mvrht.com'), ('inboxbear.com'),
  ('discard.email'), ('discardmail.com'), ('trashmail.com'), ('trashmail.net'),
  ('trash-mail.com'), ('trbvm.com'), ('mytemp.email'), ('tempmailaddress.com'),
  ('tempr.email'), ('mt2014.com'), ('mt2015.com'), ('thankyou2010.com'),
  ('spam4.me'), ('mailtemp.info'), ('fexbox.org'), ('fexbox.ru'),
  ('tempmailo.com'), ('minuteinbox.com'), ('tempemail.com'), ('tempemail.net')
ON CONFLICT (domain) DO NOTHING;

-- ── 2. PaaS subdomain blocklist ──────────────────────────────────────────────
-- Free tier may not register sites on shared-platform subdomains where one
-- bad actor can spawn unlimited subdomains. Listed as full suffix including dot.
CREATE TABLE IF NOT EXISTS paas_subdomain_blocklist (
  suffix text PRIMARY KEY
);

INSERT INTO paas_subdomain_blocklist (suffix) VALUES
  ('.vercel.app'), ('.netlify.app'), ('.netlify.com'), ('.webflow.io'),
  ('.glitch.me'), ('.replit.dev'), ('.replit.app'), ('.repl.co'), ('.repl.it'),
  ('.ngrok.io'), ('.ngrok-free.app'), ('.ngrok.app'),
  ('.herokuapp.com'), ('.firebaseapp.com'), ('.web.app'),
  ('.pages.dev'), ('.workers.dev'),
  ('.shopifypreview.com'), ('.myshopify.com'),
  ('.github.io'), ('.gitlab.io'), ('.bitbucket.io'),
  ('.azurewebsites.net'), ('.appspot.com'),
  ('.surge.sh'), ('.now.sh'),
  ('.ondigitalocean.app'), ('.fly.dev'), ('.up.railway.app'),
  ('.onrender.com'), ('.lovable.app')
ON CONFLICT (suffix) DO NOTHING;

-- ── 3. Trigger function — runs on sites INSERT or UPDATE ─────────────────────
CREATE OR REPLACE FUNCTION enforce_free_tier_abuse_guards()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER  -- needs to read auth.users for email lookup
SET search_path = public
AS $$
DECLARE
  v_email          text;
  v_email_domain   text;
  v_clean_domain   text;
  v_match_suffix   text;
BEGIN
  -- Only enforce for free-plan sites. Paid customers can use any domain/email.
  IF NEW.plan IS DISTINCT FROM 'free' THEN
    RETURN NEW;
  END IF;

  -- ── Domain check (PaaS subdomain farms) ────────────────────────────────────
  IF NEW.domain IS NOT NULL AND length(trim(NEW.domain)) > 0 THEN
    -- Normalize: lowercase, strip scheme, strip trailing slash, strip path
    v_clean_domain := lower(trim(NEW.domain));
    v_clean_domain := regexp_replace(v_clean_domain, '^https?://', '');
    v_clean_domain := split_part(v_clean_domain, '/', 1);

    SELECT suffix INTO v_match_suffix
    FROM paas_subdomain_blocklist
    WHERE v_clean_domain LIKE '%' || suffix
      AND length(v_clean_domain) > length(suffix)
    LIMIT 1;

    IF v_match_suffix IS NOT NULL THEN
      RAISE EXCEPTION 'Free tier does not allow PaaS subdomains (%). Use a custom domain or upgrade to a paid plan.', v_match_suffix
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- ── Disposable email check ────────────────────────────────────────────────
  IF NEW.owner_id IS NOT NULL THEN
    SELECT email INTO v_email FROM auth.users WHERE id = NEW.owner_id;
    IF v_email IS NOT NULL THEN
      v_email_domain := lower(split_part(v_email, '@', 2));
      IF EXISTS (SELECT 1 FROM disposable_email_domains WHERE domain = v_email_domain) THEN
        RAISE EXCEPTION 'Disposable email addresses are not allowed on the free tier. Use a real work or personal email.'
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sites_free_tier_abuse_guards ON sites;
CREATE TRIGGER sites_free_tier_abuse_guards
  BEFORE INSERT OR UPDATE ON sites
  FOR EACH ROW
  EXECUTE FUNCTION enforce_free_tier_abuse_guards();

COMMENT ON FUNCTION enforce_free_tier_abuse_guards IS
  'Blocks free-tier signups using disposable emails or PaaS subdomain farms. Paid plans skip the check.';
