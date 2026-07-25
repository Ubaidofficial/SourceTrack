# Tinybird Cutover Runbook

**Purpose:** promote authored `.pipe` changes to a Tinybird workspace (staging or prod) safely. This procedure was run twice on 2026-07-24 — **ST_Staging deployment #25** and **prod deployment #21** — and worked. It lived only in a chat log; this file is its home.

**Founder-gated (§8).** Prod pipe deploys are founder-only. `tb --cloud deploy --check` against the target is the **mandatory** pre-deploy gate (not advisory — see step 3). CC writes `.pipe` files; CC does **not** run `tb --cloud deploy`.

**Three of the steps below exist because something went wrong.** They are marked ⚠️ WHY. Do not skip them.

Related: **KI-58** (main-worktree `.tinyb` is authed to PROD — the reason step 2 and step 7 exist), **KI-54** (rename `dual_write_append` before the prod cutover), **KI-59** (prod carries pre-existing Phase-4 drift, so its `--check` diff is larger than staging's).

---

## 0. HARD GATE — clean tree on `main` at the intended SHA

**This is a gate, not a checklist item. If any line below does not hold, STOP: no
`--check` output from this worktree may be trusted or quoted, and no deploy may proceed.
Re-run step 0 after fixing the tree — do not "read past" a failure.**

```bash
git fetch origin                          # ALWAYS first — a stale ref invalidates every check below
git -C <worktree> status --porcelain      # must print NOTHING
git -C <worktree> rev-parse HEAD          # must equal the SHA you reviewed
git -C <worktree> rev-parse origin/main   # must equal the line above, unless deploying a PR branch
git -C <worktree> log -1 --oneline        # eyeball it: is this the commit you think it is?
```

⚠️ **WHY — it fired TWICE in one session (2026-07-25/26), in two different shapes:**

- **(a) A false "no-op".** `tb --cloud deploy --check` reported **"No changes to be deployed"**
  from a worktree **2 commits behind** `main`. That output is **indistinguishable from a genuine
  no-op** — it is exactly what a correctly-synced, already-deployed workspace prints. Only an
  unrelated `grep` for `trial_start` in the local `.pipe` file revealed the tree was stale. Nothing
  in the `--check` output itself would ever have surfaced it.
- **(b) A false CI green.** A PR's CI was green **against an old base**; the branch then conflicted
  on merge. The green tick was true about a tree nobody was going to ship.

> ### The general principle — applies well beyond this runbook
>
> **A pass computed against a stale base is not a pass.** Every verification tool here — `--check`,
> CI, a parity query, a diff — answers a question about **the tree it was given**, not about the tree
> you intend to ship. When those differ, the tool reports success and the success is meaningless.
>
> Two consequences worth internalising:
> - **A clean "no changes" result is the most dangerous output**, not the most reassuring one: a
>   correct no-op and a stale-tree no-op are byte-identical. Establish the base *before* reading the
>   result, never after.
> - **Re-establish the base after any rebase, merge, or branch switch.** A check that was valid ten
>   minutes ago is not evidence about the tree you have now.

`tb --cloud deploy --check` compares the **local `.pipe` files** against the remote workspace — if
the working tree is behind, the diff is meaningless. Deploy from a worktree that is clean and at the
exact `main` SHA you reviewed.

## 1. Capture a BEFORE baseline — by QUERY, not by snapshot

Record the **exact endpoint calls**, so the baseline can be **regenerated** later (a pasted snapshot rots the moment the workspace receives new data). Use the pipe endpoints, not a screenshot.

```bash
# Example: the refund-count acceptance baseline (conversion counts per site, revenue).
# Run against the TARGET workspace (see step 2 for how to point the CLI).
tb --cloud sql "SELECT site_id,
  count() AS conversions_NOW,
  countIf(conversion_type != 'refund' OR conversion_type IS NULL) AS conversions_AFTER,
  round(sum(conversion_value), 2) AS revenue_MUST_NOT_CHANGE
FROM events WHERE event_type = '\$conversion'
GROUP BY site_id ORDER BY conversions_NOW DESC" > /tmp/before.txt

# Or capture a specific endpoint's data block for the exact params you will re-diff in step 6:
tb --cloud sql "SELECT * FROM <endpoint_or_pipe> WHERE site_id = '<id>' ..." > /tmp/before_<endpoint>.txt
```

Save the **queries themselves** alongside the output. Step 6 re-runs them against the post-deploy workspace and diffs.

## 2. Point the CLI at the target workspace DELIBERATELY

Every `tb --cloud` command prints a line:

```
Running against Tinybird Cloud: Workspace <X>
```

**Read it. That line is the only reliable check of which workspace you are about to touch.**

⚠️ **WHY (KI-58):** the main worktree's `tinybird/.tinyb` is authenticated to **PROD** with `TB_TOKEN` unset, so `tb --cloud deploy` from that directory hits production **with no confirmation prompt**. And `tb --cloud workspace ls` lists **only `imubaid93_workspace`** — it does **NOT** show the workspace the `.tinyb` is actually pointed at. So `workspace ls` cannot confirm your target; the `Running against` line can.

```bash
cd <worktree>/tinybird
tb workspace current 2>&1 | grep -iE "Workspace |^name:"   # name only — never print the token
# Confirm it says the workspace you intend (ST_Staging for a staging cutover, SourceTrack for prod).
```

If it names the wrong workspace, **STOP** — do not proceed until it is pointed where you intend.

## 3. `tb --cloud deploy --check` — MANDATORY, read for THREE things

```bash
tb --cloud deploy --check
```

Before proceeding, confirm all three:

1. **Any datasource row → STOP.** Prod `privacy_signals` has **live appends**; a datasource change in the diff means the cutover would touch ingestion, not just read pipes. A pipe-only cutover shows **no** datasource rows.
2. **`No changes in tokens to be deployed` → must hold.** A token change in the diff is a red flag (KI-54: `dual_write_append` name collision) — resolve the token rename first, out of band.
3. **The endpoint list → does it match what you expect?** Count and names. On prod, expect it **larger than staging** (KI-59: pre-existing Phase-4 drift on `pageviews_by_visitors`, `conversions_by_site`, `pageviews_windowed_by_site`, `last_touch_by_site`, plus `multitouch_pageviews_live`). Confirm each extra entry is a **known** drift item, not a surprise.

⚠️ **WHY (it is mandatory, not advisory):** `--check` caught **three separate classes of failure** on 2026-07-24 —
- **pipes that could not compile** (`Missing columns: conversion_type` — the #383/#389 nested-projection bug);
- **a diff against a stale tree** (step 0's failure mode);
- **confirming no datasource/token change** was silently in play.

Only proceed on **`✓ Deployment is valid`**.

## 4. Record the rollback target BEFORE promoting

```bash
tb --cloud deployment ls
```

Note the **current live deployment number** — that is your rollback target. Write it down **before** you deploy, not after (after, the list has moved).

> Prod example: current was **deployment 20**; the cutover produced **21**. Rollback target recorded as **20** before promoting.

## 5. Deploy with a `WORKSPACE:DEPLOY`-scoped token, passed inline for ONE command

The default workspace token lacks `WORKSPACE:DEPLOY` and returns `workspace requires scope WORKSPACE:DEPLOY`. Use the deploy-scoped token, inline, for exactly one command:

```bash
PD='<the WORKSPACE:DEPLOY token>'; TB_TOKEN="$PD" tb --cloud deploy; unset PD
```

- **Do NOT re-auth `.tinyb` to prod** — that leaves it armed (KI-58); step 7 exists to undo even the CLI pointer.
- **Do NOT use `pbpaste`** — it captures whatever was last copied, which is usually **the command itself**, not the token.
- **Do NOT use `read -rs`** — it **silently returned an empty string twice** on 2026-07-24. The inline single-quoted form above is what worked.
- `TB_TOKEN` **persists in the shell** and silently overrides `.tinyb` for every later command — the `unset PD` + the one-command scoping keep it from leaking into step 6/7. (Never echo, log, or paste the token value — §0 / secrets.)

Confirm the `Running against` line **again** in the deploy output before accepting the result.

## 6. Verify by DIFFING the before/after endpoint responses

Re-run the **exact** step-1 queries against the now-deployed workspace and diff:

```bash
tb --cloud sql "<the same query as step 1>" > /tmp/after.txt
diff /tmp/before.txt /tmp/after.txt
```

**Only the `data` block counts.** `statistics` (`elapsed`, `bytes_read`, `rows_read`) varies per call and will **always** differ — ignore it. If comparing raw endpoint JSON, diff only `.data`:

```bash
# jq form when hitting endpoints directly:
diff <(jq .data /tmp/before.json) <(jq .data /tmp/after.json)
```

For a refund-count cutover, apply the invariants: conversion counts equal the AFTER column exactly; **revenue is byte-identical** — any revenue movement means a `SUM` was touched → **ROLLBACK** to the step-4 target.

## 7. Re-point the CLI back to ST_Staging when finished

```bash
tb workspace use ST_Staging      # or re-auth .tinyb back to staging
tb workspace current 2>&1 | grep -iE "Workspace |^name:"   # confirm it says ST_Staging
```

⚠️ **WHY (KI-58):** leaving the CLI / `.tinyb` pointed at prod is **KI-58 armed** — the next `tb --cloud deploy` anyone runs from that worktree hits production with no prompt. Restore the pointer to staging before you walk away.

---

## Worked prod example (2026-07-24, deployment 20 → 21)

- **Step 0:** clean worktree at the reviewed `main` SHA.
- **Step 2:** `Running against Tinybird Cloud: Workspace SourceTrack` — confirmed prod, deliberately.
- **Step 3:** `--check` → **23 endpoints**, **no datasource rows**, **`No changes in tokens`**, `✓ Deployment is valid`. The endpoint list was larger than staging's (KI-59 drift) — each extra confirmed known.
- **Step 4:** `tb --cloud deployment ls` → current **20**. Rollback target recorded.
- **Step 5:** `PD='…'; TB_TOKEN="$PD" tb --cloud deploy; unset PD` → produced **deployment 21**.
- **Step 6:** before/after `data`-block diff —
  - `bench_conversions_by_site`: **5 conversions / 1777.76 revenue — UNCHANGED** ✓ (revenue byte-identical → no SUM touched).
  - `multitouch_pageviews_live`: **400 → 200** ✓ (the pre-rename param bug fixed by the cutover — the whole point).
- **Step 7:** CLI re-pointed to ST_Staging; `workspace current` confirmed.

Result: prod at **deployment 21**, verified, rollback target (20) on record, CLI left on staging.
