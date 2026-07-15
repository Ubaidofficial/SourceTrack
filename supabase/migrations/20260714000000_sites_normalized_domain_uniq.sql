-- Enforce ONE site per NORMALIZED domain (www-insensitive). Prevents the duplicate rows that let a
-- domain->site lookup (privacy-suppression GPC/DNT, and any future by-domain resolver) attribute to
-- the wrong site. Prod today: techrupt.pk has TWO rows —
--   eb7f68c3-a2b7-4224-a8d0-56ac1e831511  www.techrupt.pk  2026-06-24  (real, has events)
--   b8249142-f2e4-4bd0-9627-1b37507dfcee  techrupt.pk      2026-07-11  (duplicate)
--
-- 🔴 APPLY NOTE (founder applies staging->prod; CC does NOT apply): this WILL FAIL while any domain
-- has >1 normalized row. That failure is INTENDED — it forces the canonical-site decision. Decide the
-- survivor and repoint FKs FIRST. NO DELETE is written here: ~20 tables carry site_id FKs, so picking
-- the canonical row and migrating references is a data-migration decision, not a cleanup.
--
-- CONCURRENTLY builds the index without locking writes on `sites`, but MUST run OUTSIDE a transaction
-- block — apply this file on its own, not inside a BEGIN/COMMIT batch. A failed CONCURRENTLY build
-- leaves an INVALID index; drop it before retrying:
--   DROP INDEX IF EXISTS sites_normalized_domain_uniq;
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS sites_normalized_domain_uniq
  ON sites (regexp_replace(lower(domain), '^www\.', ''));
