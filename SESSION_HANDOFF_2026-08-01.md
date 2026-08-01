# SourceTrack Session Handoff — 2026-08-01 (full rewrite)
**Date:** 2026-08-01 · **Main:** post-#558 (`a17fe24`) · **Audited against:** live GitHub API + `origin/main` at that ref

**This replaces the earlier same-day handoff in full** — that version stopped mid-GDPR-arc, before PR 4, PR 5, the account-deletion finding, and the entire Sitepins adoption. Everything below is either independently verified via live GitHub API / Supabase query in this conversation, or explicitly marked as not verified.

**Scope boundary, unchanged from before:** this covers what was orchestrated in this specific conversation thread. It is not a full record of every PR merged into the repo today — #525/#526/#527 merged the same day, before this thread's currency arc began, and remain outside this document's visibility.

---

## Dropped thread — check this first next session

**KPI drill-down ("Spec A") was approved and never delivered.** Investigation came back (model-independent Overview KPIs can't support a truthful drill-down; option iii — restrict the affordance to Report Builder/Attribution tables only — was approved; fractional-credit representation deferred as a separate founder decision). CC was asked to spec exact call sites and prop shape. No PR, no further report ever arrived. Confirmed via a targeted PR search — nothing matching. Not urgent, not launch-blocking, but a real loose end from mid-session that never closed. Worth either re-dispatching or explicitly deciding it's no longer wanted.

---

## GDPR erasure-suppression arc — complete, 5 of 5

| PR | What | Status |
|---|---|---|
| #540 | erasure_suppression table + write path | Merged |
| #541 | Enforcement on Supabase PII write paths | Merged |
| #549 | Delayed erasure re-sweep (health-agent scheduled, API-executed) | Merged |
| #553 | Refunds -> unattributed; CAPI egress suppression-gated | Merged |
| #554 | Settings.jsx copy caught up to PRs 2-4 | Merged |
| #557 | KNOWN_ISSUES: account deletion doesn't suppress (open decision) | Merged |

*(The arc proper is the five PRs #540/#541/#549/#553/#554 — PR 1/5 through 5/5. #557 is the KNOWN_ISSUES entry that came out of PR 5, listed here for continuity, not a sixth arc PR.)*

**#549's real bug, now fixed and shipped:** findPendingResweeps originally filtered .lt('executed_at', cutoff), but executed_at is NULL for every non-'executed' status - so failed erasures, the exact case the resweep exists to retry, could never be selected. Fixed by widening the predicate to cover both columns: `.or('executed_at.lt.<cutoff>,and(executed_at.is.null,requested_at.lt.<cutoff>)')` — COALESCE(executed_at, requested_at) *semantics*, expressed as a PostgREST filter. There is no literal COALESCE in the code or in the migration; the migration's partial index is deliberately on requested_at, not executed_at, for exactly this reason. Independently verified by tracing the diff and confirming the new test genuinely fails on a revert, not just narratively.

**#553's real findings:** the pre-existing refund behavior was squarely Option A (verbatim attribution inheritance), not close to Option B as originally assumed. Fixing dashboard.js alone would have left analytics.js's first_touch_source || 'Direct' silently misattributing cleared refunds to Direct - caught and fixed in the same PR. CAPI egress is now gated on erasure_suppression before any of six platform sends, fail-closed, with an explicit test proving a subject-less event still sends (so fail-closed doesn't become a total outage for anonymous traffic).

**#557's real finding, genuinely unresolved:** recordErasureSuppression is called only from DELETE /visitor, never DELETE /account. Traced and bounded, not just flagged: sole-member account deletion closes its own exposure by deleting the sites (ingest starts rejecting the key), shared-workspace deletion never touches visitor PII at all - so the gap is narrower than "no protection," but it's real and it's an open product decision, not fixed. A secondary finding inside the same PR: /account writes erasure_log with a synthetic account:${userId} subject id that the PR 3 resweep can never match - it gets marked "swept" having swept nothing. Recorded so it's never mistaken for coverage.

**Verification note on ST_INTERNAL_JOB_SECRET:** the founder stated this was set correctly on both SourceTrack-Api and sourcetrack-health in prod. Never independently verified - Railway MCP access was blocked for this project every single attempt, all session. The real verification is the erasure_resweep health check's first live */30 cycle: silent = correct, Slack red = mismatched. Worth checking Slack history if this hasn't been confirmed since.

---

## Sitepins CMS adoption - decided, partially implemented, one real architectural decision made

**Starting position:** initial recommendation was against adopting this ("not now"), based on an initial GitHub-repo read (8 commits, 4 stars). That assessment was corrected mid-session after the founder pointed to real context that was missed - Sitepins has an official listing in Astro's own docs, and PowerAI Astro (the template this marketing site is built from) is literally Sitepins' own template. The founder decided to proceed; from that point the role was execution and risk management, not re-litigating the decision.

**Content-model audit (investigation only, no PR):** marketing/ already had a working Astro content-collection layer (8 collections, 24 files, 11/43 pages). Remaining 32 pages tiered by cost: 11 near-free (Tier 1), 6 cheap (Tier 2, became 7 during execution), 11 real work (Tier 3, docs pages). Two hard constraints identified and honored throughout: .md never .mdx (Astro parses { as an expression, breaking code snippets), and callout/notice chrome are section-6 honesty boundaries that don't survive a naive Markdown round-trip.

**#556 (merged) - Tier 1 + Tier 2, 18 pages.** Verified via rendered-text diff against a clean baseline build (raw HTML diff was worthless - Math.random() DOM ids make every page differ on every build regardless of content changes). Real finding: the CTA section had never rendered on any of the 7 Tier 2 pages - CallToAction.astro gates on frontmatter.enable, which no inline object ever set. This was a pre-existing bug, not something introduced by the migration; extracting to the correct content shape fixed it as a side effect. Approved and shipped - a working CTA on conversion pages (/solutions/saas, /demo) is unambiguously better than a silently broken one.

**#555 (merged) - parity guard + a 4th real drift instance.** Built a guard comparing extracted prose content (not bytes - different frameworks make byte diffs 100% noise) between dashboard/src/pages/docs/Docs*.jsx and marketing/src/pages/docs/*.astro. It immediately caught shopify.astro missing #466's full 7-step checklist, including the line explaining that a webhook-only setup records purchases against no visitor. Real, live, public-facing gap, closed in the same PR that built the check that found it.

**#558 (merged) - Tier 3, 1 of 11 pages, and the architecture decision.** The parity guard reads .astro source files directly, and Tier 3's entire purpose is removing prose from those files - so the guard and full docs-page CMS-migration are structurally incompatible for the 10 mirrored pages (guard says "verbatim port of the dashboard"; CMS says "non-developer editable"; a page cannot honestly be both). Decision made: exclude the 10 mirrored docs pages from Sitepins, keep the guard's protection. The docs hub + a 7-term glossary (the one docs-directory page the guard already excludes, since it's app navigation not shared prose) were migrated instead. A real, deeper unification (dashboard reading the same content files Sitepins edits) was identified as the only fix that actually dissolves the conflict - explicitly deferred as a separate, much larger future project, not scoped into this session.

**Still open:** the actual GitHub App connection to the repo. Deliberately left as a founder action, not delegated - steps given (scope to this one repo only, not org-wide; verify permission scope before confirming; test on one low-stakes page first). Confirmed the Hobby/free plan (3 sites, 1 private repo, only GitHub repos) is sufficient for current scale - no upgrade needed. Not yet done as of this handoff.

Evidence trap to avoid: marketing/public/.well-known/sitepins.json exists in the repo, but it is theme boilerplate from the original #476 Astro shell PR (marketing/package.json lists "author": "Sitepins", matching the template's own provenance), not evidence of an actual App connection. Its presence proves nothing either way. Real signals checked instead: zero repo webhooks, zero bot-authored commits in the entire history. Neither positively proves "not connected" (the GitHub App installation state itself needs app-level auth or the GitHub UI to check directly), but both are consistent with "not yet done."

---

## KNOWN_ISSUES.md - four PRs added new entries, one resolved an existing row

- **#546 (new entry) - Search Terms Report.** Investigated and correctly backlogged: no join key exists between Google's search_term_view (has the raw query, never gclid) and SourceTrack's captured fields (gclid/utm_term, never the raw query). Structural, not a completeness gap. Keyword-level ROI via st_target_id -> keyword_view recorded as a real, larger, separate alternative.
- **#547 - did NOT add an entry; resolved an existing row.** url-normalization.js vs url-normalize.js flipped from an existing "possible duplicate / audit and merge" line to "RESOLVED - not a duplicate ... do NOT merge." Also touched ARCHITECTURE.md. Confirmed genuinely, deliberately distinct (money-rail case-preserved vs. GSC-join lowercased), guarded by a drift test - the old instruction would have broken either the money rail or the GSC join if followed literally.
- **#548 (two new entries, not one) - CAPI/HogQL corrections.** LinkedIn CAPI confirmed fully live (previously misrecorded as dead). Microsoft is **held deliberately — the entry's own heading says "not a dead sender."** It satisfies all four checklist touchpoints and still cannot fire, because the endpoint does not accept the credential at all - a fifth condition the checklist never anticipated. Its disposition was already decided in #514: kept (the sender is a real head start on the OAuth2 rewrite), not exposed (a config card would save a token that is never sent). Separately: stale "falling back to HogQL" warnings, 10 instances found on main (not the 1 originally suspected) - 3 live runtime warnings printing exactly the wrong thing mid-incident, 6 stale comments, 1 correctly-untouched historical note.
- **#551 (new entry) - Payload-size ceiling.** No byte-size bound anywhere in the Tinybird batcher. Sharper finding beyond the original ask: N is a trigger, not a cap - flush() always takes the entire buffer, so there's no count ceiling either, which is what makes the byte exposure reachable rather than theoretical. A 413 is non-retryable and dead-letters the whole batch with no split-and-retry. Fix recorded as an option only, not committed.
- **#557 (new entry) - Account deletion doesn't suppress.** Covered above under the GDPR arc.

None of these entries cite their own PR number inside KNOWN_ISSUES.md itself - the numbers above are this document's index, not something the file cross-references.

---

## Investigations this session with no code change

- **UTM persistence (tracker.js)** - no misattribution bug exists; current-touch UTM fields are URL-only, never storage-backed, correctly separated from the write-once st_ft_* first-touch namespace. Two "behavior, not bug" facts worth knowing: st_ft_* has no TTL (deliberate, first-touch is meant to outlive the attribution window), and last_touch_source collapses to 'direct' on internal pages - this second one was explicitly flagged as unverified, not fine. Server-side sessionization is presumed to resolve it but was never traced. Worth checking before assuming it's harmless.
- **url-normalization.js vs url-normalize.js** - see #547 above.
- **#516 reconciliation** - a dormant PR from 2026-07-30 (itself a prior session's own handoff document, submitted as a PR, never merged), closed as superseded after full re-verification. Corrected finding: both SourceTrack and sourcetrack-shpfy-app repos are public - #516 had claimed the main repo was private, implying a false differential security margin. There is no such margin; the security section applies identically everywhere, which is stricter than #516 described, not looser.

---

## Competitive research this session (context, not action items)

- **Heeet** - different market (CRM-embedded B2B pipeline attribution). Their AI "Analyst Agents" directly conflict with SourceTrack's own AI-narration guardrail - a deliberate divergence, not a gap.
- **AttributionApp** - genuinely in-lane, more sophisticated than SourceTrack specifically on user-level cross-platform cost deduplication, which SourceTrack's own cost-sync work (campaign-level, still unproven end-to-end) doesn't match. Real gap, not dismissed.
- **Cometly** - MMM claims are content-marketing volume, not a documented product feature (zero help-center coverage found despite extensive blog content). Their Source-Specific Attribution model (first/last-touch logic scoped to one filtered channel) is a genuinely distinct, borrowable concept, not yet scoped into any dispatch.
- **Sitepins** - see above.

---

## Genuinely open items - nobody has acted on these

- **Secret rotation** from the 2026-07-17 incident (RESEND_API_KEY, staging SUPABASE_SERVICE_KEY, ST_LOG_HASH_SECRET, TINYBIRD_READ_TOKEN) - never confirmed done, now going on three weeks.
- **Microsoft CAPI OAuth2 rewrite** - the sender satisfies all four CAPI touchpoints and still cannot fire, because the endpoint does not accept the credential. This is **not** an undecided "wire it or drop it": #514 already decided to keep it unexposed. What remains open is the OAuth2 rewrite itself, unscheduled.
- **Railway MCP access** to project 0d626230 - consistently denied for the orchestrator role, every attempt, all session (whoami/list-projects work; anything service-scoped doesn't). Worth confirming deliberately whether this is intentional post-incident scoping.
- **Art. 15 subject-disclosure** for erasure_suppression - TODO noted in gdpr.js, still open, pending legal review.
- **Same-anonymous_id-still-browsing suppression question** - flagged, not in any approved scope, a founder-level product decision.
- **Account deletion suppression** (#557) - open decision, not a bug, needs a founder call on whether to close it.
- **KPI drill-down Spec A** - see the top of this document. Dropped, not delivered.
- **Sitepins GitHub App connection** - not yet done.
- **developers/index.astro's 8 link cards and subprocessors.astro's 4-vendor table** - scoped out of Sitepins Tier 1 on purpose, flagged as worth doing soon (subprocessors specifically, since it's a legal disclosure that needs to stay current).

## Backlogged, documented, not blocking anything

Payload-size ceiling (#551), stale HogQL fallback references (#548), last_touch_source->'direct' collapse (unverified), search-term-level attribution (#546).

---

## Process note, worth carrying forward

**Stale "still open" claims about already-merged PRs happened repeatedly this session** - at least a dozen instances across #528, #545, #466, #537, #539, #551, #556, and others, always in one direction (claiming something open that was actually already merged, never the reverse). Every single instance resolved correctly by direct API verification. Root cause never diagnosed. The mitigation that worked without fail: treat any "still open"/"awaiting merge" claim as a hypothesis, verify via live API call, never act on it unverified.
