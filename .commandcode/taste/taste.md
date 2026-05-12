# Taste (Continuously Learned by [CommandCode][cmd])

[cmd]: https://commandcode.ai/

# code-style
See [code-style/taste.md](code-style/taste.md)
# safety
- Never expose raw internal errors (provider, parsing, PostHog) to the client. Always return sanitized error messages. Confidence: 0.85
- Never weaken or bypass security checks (auth, CSRF, CORS) unless explicitly required and justified in code comments. Confidence: 0.85

# ai
- All AI output must be deterministic: always set temperature to 0. Confidence: 0.85

# api
- All API responses must use the shape { success, data, error }. Confidence: 0.80

# code-style
- Use SourceTrack lime/charcoal/neutral palette for UI — avoid purple/blue SaaS gradients. Confidence: 0.70

# workflow
See [workflow/taste.md](workflow/taste.md)

# auditing
- For zero-edit verification audits: do NOT edit files, write code, or change docs. Report findings precisely with PASS/FAIL/PARTIAL/UNVERIFIED verdicts per check. Suggest follow-up fixes in report only. Confidence: 0.70
- When correcting an audit, classify each finding's implementation confidence: "Verified implemented" (code exists and wiring confirmed), "Runtime QA needed" (code exists but needs live environment validation), "Partially implemented" (backend but no UI, or UI but no backend), "UI-only / placeholder" (static UI with no wiring), "Not implemented" (zero code). Mark any finding that cannot be verified from available files as "Cannot verify from files." Confidence: 0.70
- For second-pass audit consistency checks, review for: findings based on docs rather than code, findings that should be downgraded to Runtime QA needed, overstatements of implementation completeness, duplicates to merge, conflicts with spec docs (ATTRIBUTION.md), and conflicts with product truth (no dashboard builder, no drag/drop, no ad sync, etc.). Return sections: Coverage Check, Corrected Audit Deltas, Merged/Removed Findings, Final Top 10 Priority Fixes, Safe Next Session Recommendation. Confidence: 0.70

# planning
- When scoping a session, include an explicit "what NOT to build" section alongside deliverables. This prevents scope creep and clarifies boundaries. Confidence: 0.70
- For surgical bug-fix sessions, include a comprehensive negative-scope guardrails list, required docs to read, pre-change inventory requirement, numbered acceptance criteria, and a structured final report format (Summary, Pre-change Inventory, Files Changed, Verification, Remaining Risks, Explicitly Not Touched). Confidence: 0.70
- For QA/re-verification sessions following a bug-fix, use a structured prompt format with: Core Identity Standard (what must not change), Absolute Scope Guardrails, required docs to read, files grouped by category (source-of-truth / changed / must-verify), Part 1 Static Verification with grep patterns, Part 2 Conditional Runtime/API smoke tests, Part 3 Cross-surface consistency checks, Part 4 Regression checks, Part 5 Known separate follow-ups (do NOT fix), and a REQUIRED OUTPUT FORMAT section. Confidence: 0.70
- For high-risk sessions (DB migrations, destructive changes), use hierarchical risk-gated phases with hard stop conditions: Phase 1 inspect/read only, Phase 2 plan/compare only, Phase 3 write artifact only, Phase 4 apply only if additive/safe, Phase 5 verify. Never rush past a gate into irreversible execution. Separate read/analyze from write from apply from verify. Confidence: 0.70
