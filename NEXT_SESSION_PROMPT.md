# Next Session Prompt

AI-agent workflow rules are governed by [ai_agent_workflow_rules.md](file:///Users/ubaid/Desktop/trackiq/docs/ai_agent_workflow_rules.md).
No AI-agent may commit or push before raw diff review and explicit user approval.

---

Copy and paste the prompt below into the chat to begin the next development session:

```markdown
We are starting **Session 138F — Add release/deploy checklist gate**.

Please perform the work for this session following the rules in docs/ai_agent_workflow_rules.md.

### Goal
Add the release checklist that blocks deploy unless staging/backups/secrets/CI are verified.

### Context & Baseline
- We recently completed Session 138E where AI-agent workflow rules were codified.
- The canonical AI-agent rules are codified in `docs/ai_agent_workflow_rules.md`.
- Staging Supabase project exists and safety boot guards are fully active.

### Verification
- Run syntax and sanity checks before requesting review.
- Provide the final pre-commit report format as defined in `docs/ai_agent_workflow_rules.md`.

Please review. I will not commit until explicitly approved.
```
