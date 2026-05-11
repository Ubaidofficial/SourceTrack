# RULES.md — SourceTrack Coding Behavior Rules

These rules apply to every session unless explicitly overridden.
Bias: caution over speed on non-trivial work. Use judgment on trivial tasks.
Read this file at the start of every session alongside system.md, progress.md, and deepseek.md.

---

## R1 — Think before coding
State assumptions explicitly before writing any code.
If uncertain about repo state, behavior, or intent — ask or inspect, do not guess.
Push back if a simpler approach exists.
Stop when confused. Name what is unclear before proceeding.

## R2 — Simplicity first
Minimum code that solves the problem. Nothing speculative.
No features beyond what was asked.
No abstractions for single-use code.
If a senior engineer would say this is overcomplicated, simplify.

## R3 — Surgical changes
Touch only what you must.
Do not clean up adjacent code you did not introduce in this session.
Do not refactor what is not broken.
Match existing file style, naming conventions, and patterns.

## R4 — Read before you write
Before adding or modifying code, read:
- the relevant route handlers or component files
- the immediate callers of what you are changing
- any shared utilities or helpers involved
"Looks orthogonal" is dangerous. If unsure why code is structured a certain way, inspect it before changing anything near it.

## R5 — Surface conflicts, do not average them
If two patterns or conventions contradict each other, pick one — the more recent or more tested.
Explain why you chose it.
Flag the other for cleanup in the session report.
Do not silently blend conflicting patterns.

## R6 — Checkpoint after every significant step
After every meaningful unit of work, summarize:
- what was done
- what was verified
- what remains
Do not continue from a state you cannot describe back.
If you lose track, stop and restate current state before proceeding.

## R7 — Fail loud
"Completed" is wrong if anything was skipped silently.
"Verified" is wrong if the code path was not actually traced.
Default to surfacing uncertainty rather than hiding it.
If something cannot be confirmed from code, say so explicitly and label it as unverified.

## R8 — Match codebase conventions
Conform to existing conventions even if you disagree with them.
If you genuinely believe a convention is harmful, surface it in the session report.
Do not fork style, naming, or structure silently.

## R9 — Never overclaim product capability
Do not claim feature parity, integration support, or behavioral maturity unless it is verified in code during this session.
Specifically:
- Do not claim Cometly or Usermaven parity unless verified end-to-end.
- Do not claim cookieless, cross-device, or server-side attribution maturity unless implemented and verified.
- Do not claim integrations, optimizations, or automation beyond what exists in repo.
If a feature is unverified or incomplete, label it explicitly.
Prefer a truthful docs-only outcome over speculative code when implementation is not safe.dou

## R10 — Hard scope boundary
Implement only what was explicitly asked in this session.
Do not add adjacent features, architectural improvements, or roadmap items that were not requested.
If something adjacent looks broken or worth improving, surface it in the session report instead of fixing it silently.
Scope creep that is not surfaced is a session failure.