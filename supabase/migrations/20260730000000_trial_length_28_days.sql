-- Trial length: 14 days -> 28 days.
--
-- HISTORY, NOT A LIVE CLAIM: the "14" in this file's name and comments records what the
-- default WAS. After this applies, no live surface in the product or on the marketing site
-- claims a 14-day trial (a test asserts that).
--
-- WHY THIS IS A REAL CHANGE AND NOT A COPY FIX: #500 was asked to correct marketing copy
-- from 14 to 28 and refused, because every source of truth said 14 — this column's default,
-- api/middleware/auth.js's TRIAL_DAYS, the two "Your 14-day trial has ended" strings, and
-- prod rows (3 sites provisioned at exactly 14 days, 0 at 28). Editing the copy alone would
-- have promised double what the system granted. This migration is the other half: the
-- system now actually grants 28, so the copy becomes true rather than aspirational.
--
-- GOING FORWARD ONLY. A column default applies to INSERTs, so this affects trials created
-- after it is applied. It does NOT touch any existing row's already-set trial_ends_at, and
-- nothing in this migration back-fills one. That is deliberate: shortening or extending a
-- trial a customer is already inside is a change to existing-customer data, not a policy
-- default. If a retroactive extension is wanted it needs its own reviewed UPDATE with an
-- explicit row count, not a silent rider on a DDL change.
--
-- §8: CC writes this file and does NOT apply it. Founder applies staging -> prod, then
-- merges the code that depends on it. Safe in either order here, in fact — the app-side
-- TRIAL_DAYS constant is only a FALLBACK for rows with a NULL trial_ends_at, so code and
-- DB disagreeing for a window mis-computes nothing that this default governs.

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'sites'
      and column_name = 'trial_ends_at'
  ) then
    -- SET DEFAULT is idempotent: re-running sets the same value again. The guard is for
    -- environment parity (§8), not for repeat-safety.
    alter table public.sites
      alter column trial_ends_at set default (now() + '28 days'::interval);
  else
    raise exception 'public.sites.trial_ends_at does not exist — refusing to guess at the schema';
  end if;
end $$;

comment on column public.sites.trial_ends_at is
  'End of the free trial. Default is now() + 28 days (raised from 14 on 2026-07-30). Applies to new rows only; existing trials keep the boundary they were created with.';
