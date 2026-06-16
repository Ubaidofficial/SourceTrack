# Next Session Prompt

AI-agent workflow rules are governed by [ai_agent_workflow_rules.md](file:///Users/ubaid/Desktop/trackiq/docs/ai_agent_workflow_rules.md).
No AI-agent may commit or push before raw diff review and explicit user approval.

---

Copy and paste the prompt below into the chat to begin the next development session:

```markdown
We are starting **Session 140H — Universal Forms + Booking Attribution Audit**.

Please perform the work for this session following the rules in docs/ai_agent_workflow_rules.md.

### Problem Statement
We need to support tracking lead conversions that happen through embedded third-party booking widgets (e.g. Calendly, Cal.com, TidyCal, SavvyCal) and generic HTML forms, without introducing privacy risks or unnecessary code complexity. Before writing code, we must audit the existing capture mechanisms and plan the architecture.

### Goal
Audit universal contact-form UTM/source capture and booking attribution options for Calendly, Cal.com, TidyCal, SavvyCal, and generic booking embeds. Propose privacy-safe defaults, provider support matrix, and execution steps. Do not write implementation code.

Note: Session 139K-H3-B (Branded Auth Domain) remains deferred until final paid-beta gate because auth.sourcetrack.ai requires Supabase custom-domain add-on cost. Paid beta remains NOT READY.

### Hard Production Safety Rules
- Strict [Secret Handling Rules](file:///Users/ubaid/Desktop/trackiq/docs/ai_agent_workflow_rules.md#secret-handling-rules) apply: no inline environment secret assignments (e.g. `SUPABASE_SERVICE_KEY=...` is banned).
- Do not print, inspect, or retrieve private service role keys or secrets.
- Use `railway run --service ...` when a command or script requires managed environment variables.
- Stop immediately and report if any secret is exposed in logs, outputs, or transcripts.
- No localhost as final QA evidence.

### Required Audit Targets
- Existing form-capture listener in `tracker/tracker.js`
- Standard cross-origin messaging patterns (postMessage) used by Calendly and others
- Privacy implications (avoiding PII leakage in attributes)
- Support capability matrix for: Calendly, Cal.com, TidyCal, SavvyCal

### Expected Output Report
Create `docs/qa/universal_forms_booking_attribution_audit_140H.md` detailing findings, proposed event schemas, privacy-safe defaults, support matrix, and implementation tasks.

### Validation Commands
Run and include the output of:
```bash
git status --short --untracked-files=all
git diff --check
npm run qa:env-safety
npm run qa:static
git diff --stat
git diff
```

Do not commit until approved.
```
