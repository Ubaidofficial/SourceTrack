# Next Session Prompt

AI-agent workflow rules are governed by [ai_agent_workflow_rules.md](file:///Users/ubaid/Desktop/trackiq/docs/ai_agent_workflow_rules.md).
No AI-agent may commit or push before raw diff review and explicit user approval.

---

Copy and paste the prompt below into the chat to begin the next development session:

```markdown
We are starting **Session 140G-27 — SourceTrack vs DataFast Feature-Parity + Simplicity Audit**.

Please perform the work for this session following the rules in docs/ai_agent_workflow_rules.md.

### Goal
Audit SourceTrack feature capabilities against DataFast and identify ways to simplify or enhance existing telemetry/attribution workflows.

### Context & Baseline
- We just completed Session 140G-26 which was a full functional browser QA in Chrome Canary on staging.
- Staging environment is running on Railway and isolated staging PostHog project 469905 is active.
- Integrations blank screen and MetricTile NaN display bugs have been resolved.

### Verification
- Run syntax and sanity checks before requesting review.
- Provide the final pre-commit report format as defined in `docs/ai_agent_workflow_rules.md`.

Please review. I will not commit until explicitly approved.
```
