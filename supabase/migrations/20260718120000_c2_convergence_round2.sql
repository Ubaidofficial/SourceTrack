-- Migration: c2_convergence_round2
-- Purpose: Round-2 prod↔staging schema convergence (remaining drift after #275 + #288).
--          Measured by column-hash diff (name:type:nullable:default) of prod
--          (zxjjjsipafojhzkkumvh) vs staging (nrsvpwzekfrdrzkoecfk).
--
-- AUTHORED ONLY. CC does not apply migrations. The FOUNDER reviews this SQL and hand-applies it
-- staging → prod, AFTER running the SET-NOT-NULL pre-flight queries below (each expects 0).
-- Every statement is idempotent (IF NOT EXISTS / SET NOT NULL / SET DEFAULT are no-ops when already
-- satisfied), so it is safe to run against both environments. The PR body lists,
-- per statement, which environment it actually changes and which it no-ops on.
--
-- NOT IN SCOPE (deliberate): sites.owner_id default — founder decision, prod's gen_random_uuid()
-- default stays and staging stays without it. site_annotations (prod-only) and attributed_conversions
-- / pageviews drift are reported in the PR body, not authored here.

-- ── ITEM 1 (REVISED): prod public.sites.id is nullable=YES, staging is NOT NULL — converge nullability
-- CORRECTION (earlier draft was wrong): prod's sites table DOES have a primary key — but on
-- `site_key` (index literally named "DB_1_pkey"), with a separate UNIQUE INDEX (sites_id_unique_idx)
-- on the nullable `id`. Staging has it INVERTED: PRIMARY KEY on `id`, UNIQUE on `site_key`. So `id`
-- is protected in prod (by a unique index, not a constraint), which is why the 18 FKs to sites(id)
-- work today.
--   • The prior ADD PRIMARY KEY block would have SILENTLY NO-OP'd on prod (its `contype='p'` guard
--     finds DB_1_pkey and skips) — reading as a fix while doing nothing — and forcing it would fail
--     anyway (one PK per table). Removed.
--   • We do NOT converge the PK itself. Swapping prod's PK from site_key→id rewrites a constraint
--     18 FKs depend on (10 → sites(site_key), 8 → sites(id)) — a separate planned change, NOT
--     convergence.
-- The only convergence gap here is `id` nullability: prod nullable → NOT NULL (staging already is).
-- No-op on staging; converges prod. Idempotent (SET NOT NULL on an already-NOT-NULL column is a no-op).
--
-- SET NOT NULL PRE-CHECK (SELECT count(*) FROM public.sites WHERE id IS NULL; expected 0) — already
-- verified on prod by the orchestrator: 0 nulls, 0 duplicate ids, 4 rows.
alter table public.sites alter column id set not null;


-- ── ITEM 2: columns present in PROD, missing in STAGING ─────────────────────────────────────────
-- Adds to STAGING; no-op on prod (IF NOT EXISTS). Both nullable, matching prod.
alter table public.sites
  add column if not exists custom_domain text,
  add column if not exists custom_domain_verified boolean default false;


-- ── ITEM 3: column present in STAGING, missing in PROD ──────────────────────────────────────────
-- Adds to PROD; no-op on staging (IF NOT EXISTS). Nullable, default now().
-- NOTE: existing prod rows get created_at = the apply timestamp (inherent to backfilling a
-- default now() column onto an existing table) — this matches how staging's column was created.
alter table public.lead_qualifications
  add column if not exists created_at timestamptz default now();


-- ── ITEM 4a: admin_audit_log.action — prod nullable=YES, staging=NO → SET NOT NULL (converges prod)
-- SET NOT NULL PRE-CHECK (founder runs first, expect 0):
--   SELECT count(*) FROM public.admin_audit_log WHERE action IS NULL;
-- Aborts the whole migration if any row has a null action. No-op on staging (already NOT NULL).
alter table public.admin_audit_log alter column action set not null;


-- ── ITEM 4b: api_keys.name — prod default 'Server API Token', staging none → SET DEFAULT (converges staging)
-- Adds the column default on STAGING; no-op on prod (default already present). Existing rows unchanged.
alter table public.api_keys alter column name set default 'Server API Token'::text;


-- ── ITEM 6a: attributed_conversions — drop a leftover STAGING default on 6 columns ─────────────
-- Column sets/types/nullability are IDENTICAL across envs (founder-verified 2026-07-18; custom_properties
-- exists in BOTH — the "20260519000005 unapplied" suspicion did NOT hold). The ONLY diff: staging carries
-- a leftover `NULL::character varying` default on these 6 columns — residue from today's varchar→text
-- migration (20260718104700), where ALTER TYPE preserved the old default; prod has none. NOT money-rail
-- risky and behaviourally a no-op: NULL is already the implicit default, so dropping it changes no
-- inserted or existing value — it only removes the redundant catalog default so the two envs hash-match.
-- Staging-only effect (DROP DEFAULT on prod's already-defaultless columns is a safe no-op).
alter table public.attributed_conversions
  alter column first_touch_browser drop default,
  alter column first_touch_country drop default,
  alter column first_touch_device  drop default,
  alter column last_touch_browser  drop default,
  alter column last_touch_country  drop default,
  alter column last_touch_device   drop default;


-- ── ITEM 6b: pageviews.os — present in STAGING, missing in PROD ─────────────────────────────────
-- Adds to PROD; no-op on staging (IF NOT EXISTS). text, nullable, no default — matches staging.
-- (pageviews is otherwise identical across envs — this single column was the whole drift; the table
-- is empty-by-design per §5.)
alter table public.pageviews
  add column if not exists os text;
