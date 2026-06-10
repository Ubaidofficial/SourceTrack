Session: 132D AI Journey Attribution + QA Harness
Last Completed: Implemented journey-based AI attribution (ai_platforms model) that credits the most recent prior AI touchpoint in the visitor's journey (or falls back to the conversion event itself if none) within the lookback window. Refactored the live engine calculation to use a safe 2-step retrieval and grouping, preventing double-counting and handling report-builder groupings gracefully. Re-labeled labels to "AI journey influence". Added ESM-based test harness verifying all 10 edge cases and created digital marketer test plan.
Next Task: Move to Phase C (Dashboard saved widget cards).
Roadmap Queue:
- Phase C (Dashboard saved widget cards)
- Phase D (Campaigns AI Copilot)
Build: ✅ passing (node --check, git diff --check, dashboard vite build, required-grep clean)
Branch: main

⚠️ WARNING: Before deploying Session 124B/C to production, set ST_IP_RESOLVER_MODE=railway on the SourceTrack-Api Railway service. In-memory rate limits are acceptable only for the current single-instance paid-beta deployment (resets on deploy/restart), and a shared store (like Redis/Upstash) is strictly required before horizontally scaling to a multi-instance production environment.
