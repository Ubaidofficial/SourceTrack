# Next Session Prompt

AI-agent workflow rules are governed by [ai_agent_workflow_rules.md](file:///Users/ubaid/Desktop/trackiq/docs/ai_agent_workflow_rules.md).
No AI-agent may commit or push before raw diff review and explicit user approval.

---

Copy and paste the prompt below into the chat to begin the next development session:

```markdown
We are starting **Session 140I-A — Fix Identify PII Redaction / Lead Stitching Bug**.

Please perform the work for this session following the rules in docs/ai_agent_workflow_rules.md.

### Goal
1. Verify the reported bug where `api/routes/identify.js` redacts `contact_email` / `email` before extraction.
2. Fix identity extraction in `/api/identify` so safe identifiers (like `contact_email` and traits) can be linked/resolved correctly without storing unsafe, arbitrary plaintext PII. Ensure `redactPiiFromObject` is bypassed or handled selectively for explicit user identifiers during identify API calls.
3. Add/adjust backend unit tests (e.g. in `api/tests/identity-resolution.test.js` or `api/tests/pii-sanitization.test.js`) proving `contact_email`, `email_hash`, and safe identity fields behave correctly.
4. Do not implement universal form capture yet.
5. Do not add booking provider detection yet.
6. Keep paid beta NOT READY.

### Hard Production Safety Rules
- Strict [Secret Handling Rules](file:///Users/ubaid/Desktop/trackiq/docs/ai_agent_workflow_rules.md#secret-handling-rules) apply: no inline environment secret assignments (e.g. `SUPABASE_SERVICE_KEY=...` is banned).
- Do not print, inspect, or retrieve private service role keys or secrets.
- Use `railway run --service ...` when a command or script requires managed environment variables.
- Stop immediately and report if any secret is exposed in logs, outputs, or transcripts.
- No localhost as final QA evidence.

### Validation Commands
Before requesting approval, run:
```bash
git status --short --untracked-files=all
git diff --check
npm run qa:env-safety
npm run qa:static
npm run qa:identity:unit
git diff --stat
git diff
```

Do not commit until approved.
```
